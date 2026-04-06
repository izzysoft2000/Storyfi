# STORYFI — Planning Specification (`CLAUDE.md`)
> **Role**: Senior Architect / Product Manager Blueprint  
> **Version**: 1.2 — All 10 Questions Decided. Specification Complete.  
> **Last updated**: 2026-04-04  
> **Status**: Pre-implementation. Do not begin coding until this document is approved and sections marked `[DECIDED]`.

---

## 1. Product Vision

**Storyfi** is a browser-native, offline-capable Progressive Web App that turns a plain Markdown document into a multi-voice audio production studio. A writer imports their script, assigns speaking roles to text selections, maps each role to a TTS voice via a provider API (e.g. MiniMax Audio), triggers generation, and exports a finished playlist of MP3s with a full scene breakdown — all without leaving the browser.

### Core Promise
> *"Paste your story. Assign voices. Hit generate. Download your audiobook."*

### Non-Goals (v1)
- Real-time collaboration
- Server-side rendering or backend storage
- Video/image sync
- Custom voice model training

---

## 2. User Personas

| Persona | Use Case |
|---|---|
| **The Author** | Converts their novel chapters to audio for proofreading |
| **The Indie Podcaster** | Produces dramatic readings with character differentiation |
| **The Educator** | Creates multi-voice dialogues for language learning content |
| **The Game Dev** | Prototypes NPC dialogue trees with temp audio |

---

## 3. High-Level User Flow

```
[Import MD File]
      │
      ▼
[Markdown rendered in Rich Text Editor]
      │
      ▼
[User selects text spans → assigns a Voice Role]
  (NARRATOR / Actor1 / Actor2 / custom names)
      │
      ▼
[Voice Role → mapped to a TTS API Voice ID + Provider]
      │
      ▼
[User triggers "Generate Audio" per segment or full doc]
      │
      ▼
[MP3 files returned → stored in IndexedDB (always)]
      │
      ├─→ [If output folder linked: written to disk via File System Access API]
      │
      ▼
[Playlist view: segments table with timestamps]
      │
      ▼
[Export: MP3 bundle zip / JSON manifest / HTML annotated doc]
```

---

## 4. Information Architecture

Storyfi runs in two modes: **Library** (no project open) and **Editor** (one project open). Only one project is active at a time.

```
┌─────────────────────────────────────────────────────┐
│  LIBRARY SCREEN  (default on first load / on close) │
│                                                     │
│  [ + New Project ]  [ Import .md ]                  │
│                                                     │
│  Recent Projects                                    │
│  ┌─────────────────────────────────────────────┐   │
│  │ 📄 My Novel Ch.1    45MB  2 days ago   [→] │   │
│  │ 📄 Podcast Script   12MB  1 week ago   [→] │   │
│  │ 📄 Test Project      0MB  3 weeks ago  [→] │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Storage  ████████░░░░░░  1.2 GB / 8.4 GB          │
│                           [ Manage Storage ]        │
└─────────────────────────────────────────────────────┘

Clicking a project → loads it → transitions to Editor screen

┌─────────────────────────────────────────────────────────────────┐
│  EDITOR SCREEN  (one project active)                            │
├──────────────┬──────────────────────────────┬───────────────────┤
│  Sidebar     │  Editor Pane                 │  Playlist Pane    │
│              │                              │                   │
│  ← Library   │  Toolbar                     │  Segment table    │
│  ─────────── │  (import, format, tag,       │  Audio player     │
│  Projects    │   generate, §-break)         │  Export controls  │
│  (current)   │                              │                   │
│  ─────────── │  Rich Text Editor (Tiptap)   │                   │
│  Voice Cast  │                              │                   │
│  ─────────── │                              │                   │
│  Storage bar │                              │                   │
└──────────────┴──────────────────────────────┴───────────────────┘
```

**Navigation rules:**
- "← Library" link in sidebar returns to Library screen — prompts save if unsaved changes
- Closing a project always returns to Library
- Browser back button on Library → nothing (no history before Library)
- Deep link to a project via URL hash: `/#/project/{id}` — loads directly into Editor
- Only one project in memory at a time — switching projects flushes Pinia store and reloads

---

## 5. PWA Technical Requirements

### 5.1 App Manifest (`manifest.json`)
```json
{
  "name": "Storyfi",
  "short_name": "Storyfi",
  "description": "Multi-voice audio production from Markdown",
  "start_url": "/",
  "display": "standalone",
  "orientation": "landscape-primary",
  "theme_color": "#1a1625",
  "background_color": "#0e0c18",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ],
  "categories": ["productivity", "entertainment"],
  "screenshots": []
}
```

### 5.2 Service Worker Strategy

| Resource Type | Cache Strategy |
|---|---|
| App shell (HTML/CSS/JS) | **Cache First** — precached at install |
| Fonts & icons | **Cache First** — long TTL |
| TTS API calls | **Network Only** — never cached (live data) |
| MP3 audio results | **IndexedDB** (playback cache) + **File System API** (disk, if folder linked) |
| User project data | **IndexedDB only** — not SW cache |
| FileSystemDirectoryHandle | **IndexedDB ("settings")** — persisted across sessions |

**Service Worker Lifecycle:**
```
Install → precache app shell assets
Activate → purge old caches
Fetch → intercept, serve from cache or network
```

Use **Workbox** (via CDN or bundled) to manage this without hand-rolling SW cache logic.

### 5.3 Offline Behavior
- App shell loads fully offline
- Previously generated MP3s play offline via IndexedDB cache
- If output folder was linked and files written to disk, those files remain accessible on disk even if IndexedDB is cleared
- Saved projects load and are editable offline
- API generation attempts show a clear "You're offline — generation unavailable" toast
- Unsaved edits are auto-persisted to IndexedDB on every change (debounced 2s)
- If File System Access API is unavailable (Firefox/mobile), app silently falls back to IndexedDB-only with ZIP export

---

## 6. Data Model

### 6.1 Project
```typescript
interface Project {
  id: string;                    // UUID
  title: string;
  createdAt: number;             // Unix timestamp
  updatedAt: number;
  sourceMarkdown: string;        // Raw original MD
  editorState: string;           // Serialized Tiptap JSON doc
  cast: VoiceRole[];
  paragraphGroups: ParagraphGroup[];
  apiConfig: ApiConfig;
  audioSizeBytes: number;        // Sum of all stitched blob sizes — updated after each stitch
  persistenceGranted: boolean;   // Whether persistent storage was requested
  outputFolderHandle: FileSystemDirectoryHandle | null; // Per-project output folder
  outputFolderName: string | null;   // Display name only e.g. "Novel-Ch1"
  outputFolderPromptDismissed: boolean; // true = user chose "Don't ask again"
}
```

### 6.2 VoiceRole
```typescript
interface VoiceRole {
  id: string;                    // e.g. "narrator", "actor_1", "actor_2"
  label: string;                 // User-editable: "Narrator", "Elena", "The King"
  color: string;                 // Hex, for highlight in editor
  voiceAssignment: VoiceAssignment | null;
}
```

### 6.3 VoiceAssignment
```typescript
interface VoiceAssignment {
  providerId: string;           // e.g. "minimax", "elevenlabs", "openai"
  voiceId: string;              // Provider-specific voice ID
  voiceName: string;            // Human label
  settings: Record<string, unknown>; // speed, pitch, emotion, etc.
}
```

### 6.4 ParagraphGroup
A `ParagraphGroup` represents one tagged span in the editor — a single voice role applied to a block of text. It owns the stitched deliverable audio. Its children are individual `Sentence` records.

```typescript
interface ParagraphGroup {
  id: string;
  roleId: string;                   // FK → VoiceRole.id
  order: number;                    // Integer document position
  sentenceIds: string[];            // Ordered array of Sentence.id
  stitchedAudioKey: string | null;  // IndexedDB key → stitched MP3 blob
  stitchedDiskFilename: string | null; // e.g. "003_narrator_p2.mp3" on disk
  totalDurationMs: number | null;
  startMs: number | null;           // Position in master timeline
  endMs: number | null;
  stitchStatus: "pending" | "stitching" | "ready" | "error";
  stitchError: string | null;
}
```

### 6.5 Sentence
A `Sentence` is the atomic unit of generation — one TTS API call, one MP3 blob. It belongs to a `ParagraphGroup` and carries both audio timing and editor position data for highlight sync.

```typescript
interface Sentence {
  id: string;
  paragraphGroupId: string;         // FK → ParagraphGroup.id
  roleId: string;
  text: string;                     // Plain text of this sentence
  sentenceIndex: number;            // 0-based position within paragraph
  status: "pending" | "generating" | "ready" | "error" | "stale";
  audioKey: string | null;          // IndexedDB key → raw sentence MP3 blob
  durationMs: number | null;
  startMs: number | null;           // Relative to paragraph start (for highlight sync)
  endMs: number | null;             // Relative to paragraph start
  editorFrom: number | null;        // ProseMirror doc position — sentence start
  editorTo: number | null;          // ProseMirror doc position — sentence end
  wordTimings: WordTiming[] | null; // Populated if provider supports word timestamps
  splitWarning: boolean;            // true if hard-split at charLimit
}
```

### 6.6 WordTiming
Per-word timing data returned by providers that support it (MiniMax, ElevenLabs). Drives word-level highlight sync during playback.

```typescript
interface WordTiming {
  word: string;
  startMs: number;       // Relative to sentence start
  endMs: number;         // Relative to sentence start
  editorFrom: number;    // ProseMirror doc position — word start
  editorTo: number;      // ProseMirror doc position — word end
}
```

### 6.7 EncryptedKeyRecord
```typescript
interface EncryptedKeyRecord {
  providerId: string;      // e.g. "minimax", "openai"
  isEncrypted: boolean;
  encrypted: string;       // base64 AES-GCM ciphertext (or plaintext key if isEncrypted: false)
  salt: string | null;     // base64 — null if not encrypted
  iv: string | null;       // base64 — null if not encrypted
  savedAt: number;         // Unix timestamp
}
```

### 6.8 IndexedDB Schema
```
Database: "storyfi_db" (v1)
├── Store: "projects"          — keyPath: "id"          — Project + ParagraphGroup metadata
│                                                          (includes outputFolderHandle per project)
├── Store: "sentences"         — keyPath: "id"          — Sentence records (index: paragraphGroupId)
├── Store: "audio_sentences"   — keyPath: "sentenceId"  — Raw sentence MP3 Blobs
├── Store: "audio_stitched"    — keyPath: "groupId"     — Stitched paragraph MP3 Blobs
├── Store: "api_keys"          — keyPath: "providerId"  — EncryptedKeyRecord
└── Store: "settings"          — keyPath: "key"
      └── key: "appPreferences" → { charLimit, highlightMode, theme, ... }
```
Note: `outputFolderHandle` is stored on the `Project` record directly — not in global settings. Each project manages its own output folder.

### 6.9 File System Storage Strategy

Storyfi uses a **hybrid storage model**: IndexedDB is always the working cache for in-app playback; the File System Access API optionally mirrors **stitched paragraph MP3s** directly to a real folder on the user's computer. Raw sentence blobs stay in IndexedDB only — they are working files, not deliverables.

```
Sentence MP3 Blob returned from TTS API
      │
      └─→ IndexedDB "audio_sentences"     (always — working cache)

All sentences in paragraph ready → stitch
      │
      ├─→ IndexedDB "audio_stitched"      (always — playback source)
      │
      └─→ File System Access API          (if output folder linked for this project)
            e.g. 003_narrator_p2.mp3 written to disk
```

#### Per-Project Output Folder

Each project has its **own output folder setting** — stored as a `FileSystemDirectoryHandle` in the project record itself, not in global settings. This means:
- Chapter 1 → `~/Documents/Storyfi/Novel-Ch1/`
- Chapter 2 → `~/Documents/Storyfi/Novel-Ch2/`
- Podcast    → `~/Documents/Storyfi/Podcast/`

Add to `Project` interface:
```typescript
interface Project {
  // ... existing fields
  outputFolderHandle: FileSystemDirectoryHandle | null;
  outputFolderName: string | null;    // display name only, e.g. "Novel-Ch1"
}
```

#### Output Folder Prompt — First Generation

The folder prompt appears **once per project** — on the first time the user clicks "Generate" and no output folder has been set for that project:

```
┌────────────────────────────────────────────────────┐
│  📁  Where should audio files be saved?            │
│                                                    │
│  Storyfi can write MP3 files directly to a         │
│  folder on your computer as they're generated.     │
│                                                    │
│  [ Choose a folder ]   [ Skip — use app only ]     │
│                                                    │
│  □  Don't ask again for this project               │
└────────────────────────────────────────────────────┘
```

- **"Choose a folder"** → `showDirectoryPicker()` → handle saved to project record
- **"Skip"** → generation proceeds, audio stored in IndexedDB only
- **"Don't ask again"** → sets `project.outputFolderHandle = null` permanently for this project, suppresses future prompts
- This prompt never appears again once either choice is made (unless user resets in Settings)

**After first prompt, folder is configurable in per-project Settings:**
```
Project Settings
─────────────────────────────────────────────
Output Folder:  📁 Novel-Ch1          [ Change ] [ Clear ]
                ~/Documents/Storyfi/Novel-Ch1/
```

#### Output Folder Linking Flow
```
1. showDirectoryPicker() dialog → user selects folder
2. FileSystemDirectoryHandle saved to project record in IndexedDB
3. outputFolderName = handle.name (for display without re-querying)
4. On next app load → handle restored → requestPermission({ mode: "readwrite" })
5. One browser permission re-confirmation (required by spec)
6. From that point: all generated MP3s write silently to disk
```

#### Filename Convention
```
{NNN}_{sanitized-role-label}_p{P}.mp3

e.g.  001_narrator_p1.mp3    ← paragraph group 1, narrator
      002_elena_p1.mp3        ← paragraph group 2, Elena
      003_narrator_p2.mp3     ← paragraph group 3, narrator again
```
`NNN` = zero-padded group order. `P` = paragraph index within that role's sequence.
Role labels: lowercased, spaces → hyphens, special characters stripped.

#### Sync-on-Open — Divergence Detection

When a project is opened, Storyfi checks whether disk files and IndexedDB blobs are in agreement. Divergence can happen if:
- The user manually deleted or moved files from the output folder
- The output folder was on a removable drive that's now absent
- IndexedDB was partially cleared by the browser (storage pressure)
- The app crashed mid-write during generation

```javascript
// storage/filesystem.js
async function syncCheckOnOpen(project) {
  if (!project.outputFolderHandle) return; // no folder linked — nothing to check

  const permission = await project.outputFolderHandle
    .requestPermission({ mode: 'readwrite' });
  if (permission !== 'granted') {
    ui.showFolderWarning('folder_permission_denied');
    return;
  }

  const divergences = [];

  for (const group of project.paragraphGroups) {
    if (group.stitchStatus !== 'ready') continue;

    const hasIDB   = await db.hasAudioBlob('audio_stitched', group.id);
    const hasDisk  = await fileExistsOnDisk(
      project.outputFolderHandle,
      group.stitchedDiskFilename
    );

    if (hasIDB && !hasDisk) {
      divergences.push({ groupId: group.id, type: 'missing_from_disk' });
    } else if (!hasIDB && hasDisk) {
      divergences.push({ groupId: group.id, type: 'missing_from_idb' });
    } else if (!hasIDB && !hasDisk) {
      divergences.push({ groupId: group.id, type: 'missing_both' });
    }
    // hasIDB && hasDisk → in sync, no action
  }

  if (divergences.length > 0) {
    ui.showDivergenceWarning(divergences);
  }
}
```

#### Divergence Warning UI

```
┌──────────────────────────────────────────────────────────┐
│  ⚠️  Some audio files are out of sync                    │
│                                                          │
│  3 audio files exist in the app but are missing from    │
│  📁 Novel-Ch1                                            │
│                                                          │
│  This can happen if files were moved or deleted.         │
│                                                          │
│  [ Re-write missing files to disk ]                      │
│  [ Re-generate missing audio      ]   ← if missing_both │
│  [ Ignore — use app storage only  ]                      │
└──────────────────────────────────────────────────────────┘
```

**Resolution options by divergence type:**

| Type | Meaning | Options shown |
|---|---|---|
| `missing_from_disk` | IDB has blob, disk file gone | Re-write to disk / Ignore |
| `missing_from_idb` | Disk file exists, IDB blob gone | Re-import from disk / Re-generate / Ignore |
| `missing_both` | Neither IDB nor disk has audio | Re-generate / Ignore |

**"Re-write to disk"** — reads blob from IndexedDB, writes it back to the output folder. Fast, no API call.

**"Re-import from disk"** — reads the MP3 file from disk via `FileSystemFileHandle.getFile()`, stores it back in IndexedDB. Restores playback without re-generating.

**"Re-generate"** — marks affected sentences `status: "pending"`, triggers generation queue. Costs API credits.

**"Ignore"** — dismisses warning. Divergent groups show a subtle ⚠️ disk icon in the playlist row. App continues using IndexedDB blobs for playback.

#### Browser Compatibility
| Browser | File System Access | Notes |
|---|---|---|
| Chrome 86+ | ✅ Full | Primary target |
| Edge 86+ | ✅ Full | Chromium-based |
| Safari 15.2+ | ✅ Full | macOS/iOS 15.2+ |
| Firefox | ⚠️ No `showDirectoryPicker` | Falls back to ZIP export |
| Mobile Chrome | ⚠️ Partial | `showDirectoryPicker` may be unavailable |
| PWA (installed) | ✅ Full (Chromium) | Works identically to browser |

**Detection:**
```javascript
export const hasFileSystemAccess = () =>
  'showDirectoryPicker' in window && window.isSecureContext;

if (!hasFileSystemAccess()) {
  ui.disableFolderLinking();
  ui.showFallbackNote('Folder output unavailable in this browser. Use ZIP export instead.');
}
```

### 6.10 Storage Quota Management

No artificial project size cap. Storyfi uses the **StorageManager API** to query available browser quota and surfaces usage transparently. The user's disk space is the real limit.

#### Typical Audio Footprint
```
1 sentence  ≈ 50–100KB  (raw MP3) + ~same stitched
1 chapter   ≈ 200–500 sentences  ≈ 20–100MB total
Full novel  ≈ 300–2,000 sentences ≈ 100MB–1GB
```
For most users the browser quota (Chrome: ~60% of free disk) far exceeds a chapter's audio. The concern is transparency, not enforcement.

#### Quota Query
```javascript
// storage/quota.js
export async function getQuotaInfo() {
  if (!navigator.storage?.estimate) return null;
  const { quota, usage, usageDetails } = await navigator.storage.estimate();
  return {
    quotaBytes:    quota,
    usedBytes:     usage,
    availableBytes: quota - usage,
    usedPercent:   usage / quota,         // 0.0 – 1.0
    indexedDBBytes: usageDetails?.indexedDB ?? null,
  };
}

export async function requestPersistentStorage() {
  // Prevent browser from evicting IndexedDB under storage pressure
  if (navigator.storage?.persist) {
    return await navigator.storage.persist(); // true = granted
  }
  return false;
}
```

#### Persistent Storage Prompt (First Project Save)
Without persistent storage, browsers (especially Safari) may silently evict IndexedDB data under pressure. Storyfi requests persistence on first save with a clear one-time prompt:

```
┌─────────────────────────────────────────────────┐
│  💾  Keep your projects safe?                   │
│                                                 │
│  Allow Storyfi to mark its storage as           │
│  persistent so your projects and audio          │
│  aren't cleared by the browser automatically.  │
│                                                 │
│  [ Not now ]    [ Allow persistent storage ]    │
└─────────────────────────────────────────────────┘
```
- Chrome: auto-grants for installed PWAs, prompt is informational only
- Safari: shows its own browser-level permission dialog
- Firefox: shows its own browser-level permission dialog
- Result stored in `settings.persistenceGranted` — don't prompt again if already asked

#### Progressive Storage Warnings
| Usage Level | Trigger | UI Response |
|---|---|---|
| < 80% | Normal | Storage bar in sidebar (always visible, no alert) |
| ≥ 80% | Warning | Yellow banner: *"Storage getting full — consider clearing old audio"* |
| ≥ 95% | Critical | Red banner: *"Storage nearly full — export and clear audio to continue generating"* |
| Write fails | Error | Inline error on segment row: *"Storage full — free space to continue"* |

#### Storage Bar (Sidebar)
```
Storage  ████████░░░░░░░░░░  1.2 GB / 8.4 GB
                              [ Manage ]
```
- Updates after every generation + stitch cycle
- `Manage` → opens Storage Manager modal

#### Storage Manager Modal
Shows per-project audio footprint with targeted clear controls:

```
Project Storage
──────────────────────────────────────────────────────
My Novel Ch.1      Audio: 45 MB   Project: 2 KB   [ Clear Audio ]  [ Delete ]
Podcast Script     Audio: 12 MB   Project: 1 KB   [ Clear Audio ]  [ Delete ]
Test Project       Audio:  0 MB   Project: <1 KB  [     ——      ]  [ Delete ]
──────────────────────────────────────────────────────
Total audio: 57 MB   Total project data: 3 KB
```

**"Clear Audio"** removes all `audio_sentences` and `audio_stitched` blobs for that project from IndexedDB. It does **not** remove the project record, editor state, cast, sentence text, or timing metadata — everything needed to re-generate is preserved. The project resets to `status: "pending"` on all sentences and can be re-generated at any time.

**"Delete"** removes the project entirely including all audio blobs.

#### Per-Project Audio Size Tracking
Add `audioSizeBytes` to the `Project` interface, updated after each stitch:
```typescript
interface Project {
  // ... existing fields
  audioSizeBytes: number;   // Sum of all stitched blob sizes for this project
}
```
This avoids re-querying IndexedDB every time the storage bar needs to render — just sum across projects.

No backend proxy. API keys are stored locally using the browser's native **Web Crypto API** (PBKDF2 + AES-GCM). No third-party crypto library required.

#### What Gets Stored in IndexedDB
```json
{
  "providerId": "minimax",
  "encrypted": "<base64 AES-GCM ciphertext>",
  "salt": "<base64 16 random bytes>",
  "iv": "<base64 12 random bytes>",
  "isEncrypted": true
}
```
The password, plaintext key, and derived `CryptoKey` are **never stored**. The blob above is useless without the user's password.

#### Encryption Implementation (Web Crypto API — no libraries)
```javascript
// Derive a CryptoKey from the user's password
async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 250_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// Encrypt
async function encryptApiKey(apiKey, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const key  = await deriveKey(password, salt);
  const enc  = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(apiKey)
  );
  return {
    encrypted: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
    salt: btoa(String.fromCharCode(...salt)),
    iv:   btoa(String.fromCharCode(...iv)),
    isEncrypted: true
  };
}

// Decrypt
async function decryptApiKey(stored, password) {
  const salt       = Uint8Array.from(atob(stored.salt), c => c.charCodeAt(0));
  const iv         = Uint8Array.from(atob(stored.iv),   c => c.charCodeAt(0));
  const ciphertext = Uint8Array.from(atob(stored.encrypted), c => c.charCodeAt(0));
  const key        = await deriveKey(password, salt);
  const plain      = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new TextDecoder().decode(plain); // throws if wrong password
}
```

#### UX Flow A — Save API Key (Settings Modal)
```
User pastes API key → clicks "Save Key"
        │
        ▼
┌──────────────────────────────────────────────┐
│  How would you like to store this key?       │
│                                              │
│  🔓 Save without password                   │
│     Stored as plaintext in this browser.    │
│     Suitable for private devices only.      │
│                                              │
│  🔐 Encrypt with a password  ← highlighted  │
│     You'll enter this once per session.     │
│     Your password is never saved.           │
└──────────────────────────────────────────────┘
        │
  [Encrypt chosen]
        ▼
  Enter password:  [________________]
  Confirm:         [________________]
  ⚠️ "If you forget this password, you will
      need to re-enter your API key manually."
  [ Cancel ]  [ Save & Encrypt ]
        │
        ▼
  Encrypted blob → IndexedDB
  Plaintext key  → memory (JS module variable)
  Tab close      → memory cleared automatically
```

#### Session Memory Management
```javascript
// In-memory store — never written back to IndexedDB
let _apiKeyCache = {}; // { [providerId]: string }

export const setDecryptedKey = (providerId, key) => {
  _apiKeyCache[providerId] = key;
};
export const getDecryptedKey = (providerId) => _apiKeyCache[providerId] ?? null;
export const clearKeys = () => { _apiKeyCache = {}; };

// Clear on tab close
window.addEventListener('beforeunload', clearKeys);
```

#### New Session — Encrypted Key Detection
When the app loads and finds `isEncrypted: true` in IndexedDB:
- The **generation buttons** are disabled with a lock icon and tooltip: *"Unlock API key to generate audio"*
- A dismissible banner appears: *"API key is locked — click to unlock"*
- Clicking the banner opens a minimal password prompt (not the full Settings modal)
- Correct password → key decrypted into memory, generation enabled, banner dismissed
- Wrong password → inline error, allow unlimited retries (local — no lockout needed)
- User can dismiss entirely and use the app for editing/playback without unlocking

#### Security Scope — What This Protects
| Threat | Protected? |
|---|---|
| Shared device — someone opens DevTools | ✅ Yes — ciphertext only |
| Browser extension scraping storage | ✅ Yes — ciphertext only |
| Exported browser profile / storage snapshot | ✅ Yes — useless without password |
| Shoulder surfing during password entry | ❌ No |
| Keylogger or compromised browser | ❌ No |
| User logged into device (encrypted blob is still present) | ❌ No |

A single-line note in the Settings UI surfaces the scope honestly:
> *"Encryption protects your key in browser storage. It does not protect against a compromised device or browser."*

### 7.1 Chosen Editor: **Tiptap v2** (recommended) or ProseMirror
**Why Tiptap:**
- Built on ProseMirror (robust, battle-tested)
- Custom marks/extensions system — perfect for voice tagging
- First-class JSON serialization for persistence
- Markdown import via `@tiptap/extension-markdown`
- Active community, well-documented

### 7.2 Custom Tiptap Extension: `VoiceTag`
```typescript
// VoiceTag is a Mark (inline decoration), not a Node
// Applied to any text selection

const VoiceTag = Mark.create({
  name: 'voiceTag',
  
  addAttributes() {
    return {
      roleId:  { default: null },
      roleLabel: { default: 'Narrator' },
      color:   { default: '#888888' },
      segmentId: { default: null },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-voice-role]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', {
      ...HTMLAttributes,
      'data-voice-role': HTMLAttributes.roleId,
      style: `background-color: ${HTMLAttributes.color}22; 
              border-bottom: 2px solid ${HTMLAttributes.color};
              border-radius: 2px;`
    }, 0]
  }
})
```

### 7.3 Tagging Interaction Flow
```
1. User selects text in editor
2. Floating toolbar appears above selection
3. User clicks a VoiceRole chip (or opens role picker)
4. VoiceTag mark is applied to selection with roleId + color
5. A new Segment record is created / existing one updated
6. Editor state serialized to IndexedDB (debounced)
```

### 7.4 Tagging Rules & Edge Cases
- **Overlapping tags**: Disallowed. Applying a new tag to already-tagged text replaces it. Warn user.
- **Untagged text = Annotations**: Untagged text is intentionally inert — it is never sent to a TTS API and never generates audio. Users can freely write stage directions, notes, reminders, or pasted references anywhere in the document. This is a feature, not an oversight.
- **NARRATOR requires explicit tagging**: There is no implicit default voice. A NARRATOR tag must be manually applied to text for it to generate audio, exactly like any other role.
- **Visual distinction — tagged vs. untagged**: Untagged text renders in the editor's base style (no highlight, no underline). Tagged text always shows its role color. The contrast makes the annotation intent immediately obvious.
- **Annotation affordance in toolbar**: The floating toolbar shown on text selection should include a clear "No Voice / Annotation" option (or simply leaving text untagged is the default). This reinforces the mental model that untagged = comment.
- **Generation skip indicator**: In the Playlist panel, untagged paragraphs are not listed at all — the segment table only contains tagged spans. There is no "skipped" row shown; absence is the signal.
- **Paragraph breaks within a tag**: Allowed. Multi-paragraph monologues stay as one segment.
- **Re-ordering**: Segments derive their `order` from document position at generation time, not tagging time.
- **Editing tagged text**: The mark persists through edits. If all text within a tag is deleted, the segment is orphaned — mark it `status: "stale"` and show a warning in the playlist row.

### 7.5 Markdown Import Pipeline
```
User selects .md file
  → FileReader API reads as text
  → Tiptap's Markdown extension parses to ProseMirror doc
  → Rendered in editor
  → sourceMarkdown saved to Project record
```

### 7.5 Segment Splitting

When a `VoiceTag` mark is applied to a text span, that span may need to be split into multiple `Segment` records before generation. Splitting is governed by two mechanisms: **manual break markers** (user-placed, always take priority) and **automatic character-limit splitting** (applied to each resulting chunk).

#### Settings
```typescript
interface SegmentSplitSettings {
  charLimit: number;        // Default: 250. Range: 50–2000.
  splitOnManualBreak: boolean; // Always true — not user-configurable
  hardSplitFallback: boolean;  // Default: true. Hard-cut if no sentence end found.
}
```
Exposed in Settings under **"Audio Generation → Segment Length"** as a single number input with a live character-count preview.

#### Priority 1 — Manual Segment Break Marker

A **Segment Break** is a custom Tiptap inline Node the user can insert anywhere inside a tagged span — or between paragraphs. It behaves like Word's page break but for voice segments.

```typescript
// Custom Tiptap Node: SegmentBreak
const SegmentBreak = Node.create({
  name: 'segmentBreak',
  group: 'inline',
  inline: true,
  atom: true,           // non-editable, selected as a unit

  parseHTML() {
    return [{ tag: 'span[data-segment-break]' }]
  },

  renderHTML() {
    return ['span', {
      'data-segment-break': 'true',
      'contenteditable': 'false',
      style: `display: inline-block;
              width: 100%;
              border-top: 1px dashed #7c5cbf44;
              margin: 4px 0;
              font-size: 0;`   // zero-width visually but present in DOM
    }]
  }
})
```

**Insertion UX:**
- Toolbar button: `§` icon (or "Break" label) — inserts at cursor position
- Keyboard shortcut: `Ctrl/Cmd + Shift + Enter` (mirrors Word's Ctrl+Enter for page break)
- Renders as a subtle dashed violet line across the editor width
- Clicking it selects it; `Delete`/`Backspace` removes it
- Only insertable inside a tagged span (toolbar button disabled otherwise)

#### Priority 2 — Automatic Character-Limit Splitting

Applied to each chunk after manual breaks are resolved.

```javascript
/**
 * Split text into chunks respecting sentence boundaries.
 * @param {string} text       — plain text of the tagged span
 * @param {number} charLimit  — from settings (default 250)
 * @returns {string[]}        — ordered array of chunk strings
 */
function splitToChunks(text, charLimit = 250) {
  const chunks = [];
  let remaining = text.trim();

  while (remaining.length > charLimit) {
    const window = remaining.slice(0, charLimit);

    // Find last sentence-ending punctuation within window
    // Sentence ends: . ! ? followed by whitespace or end-of-window
    const sentenceEnd = window.search(/[.!?][^.!?]*$/);

    let splitAt;
    if (sentenceEnd !== -1) {
      // Split after the punctuation mark (include it in chunk 1)
      splitAt = sentenceEnd + 1;
    } else {
      // No sentence boundary found — hard split at charLimit
      // Warn user via segment.splitWarning = true
      splitAt = charLimit;
    }

    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trimStart(); // drop leading whitespace
  }

  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}
```

**Split warning:** If a hard split (no sentence boundary) occurs, the resulting `Segment` records get `splitWarning: true`. The Playlist panel shows a ⚠️ icon on that row with tooltip: *"No sentence boundary found — this segment was hard-split at the character limit. Consider inserting a manual break or shortening the sentence."*

#### Full Splitting Pipeline
```
Tagged span extracted as plain text
        │
        ▼
① Split on SegmentBreak nodes → array of text chunks
        │
        ▼
② For each chunk:
     splitToChunks(chunk, settings.charLimit)
        │
        ▼
③ Each resulting string → one Segment record
     order = document position + sub-index (e.g. 3.1, 3.2, 3.3)
     roleId = parent VoiceTag roleId
     status = "pending"
     splitWarning = true/false
        │
        ▼
④ Segment records written to project store
   Editor VoiceTag mark updated with segmentIds[]
```

#### Segment Sub-Ordering
When one tagged span produces multiple segments, they get a compound order:
```typescript
// Parent span is 3rd in document → sub-segments are:
segments[0].order = 3.1
segments[1].order = 3.2
segments[2].order = 3.3
```
This preserves sort stability when segments from different spans interleave.

#### Edge Cases
| Scenario | Behaviour |
|---|---|
| Tagged span is under `charLimit` | Single segment, no split logic runs |
| Single sentence longer than `charLimit` | Hard split at limit, `splitWarning: true` |
| Manual break at very start or end of span | Zero-length chunk discarded silently |
| Two manual breaks adjacent | Single zero-length chunk discarded silently |
| User changes `charLimit` after generation | Existing `"ready"` segments not re-split automatically. Banner shown: *"Segment length setting changed — re-generate affected segments to apply."* |
| User edits text inside a split segment | Segment marked `"stale"`, re-split triggered on next generation |

---

## 8. Voice Role System

### 8.1 Default Cast
```
NARRATOR  — color: #6B7FD4 (cool blue-grey)
ACTOR_1   — color: #E07B54 (warm amber)
ACTOR_2   — color: #5CB85C (sage green)
ACTOR_3   — color: #D4A017 (gold)
ACTOR_4   — color: #C45C8A (rose)
```
Users may add up to **10 roles** in v1 (pragmatic API cost limit).

### 8.2 Role Management UI
- Cast panel in sidebar lists all roles
- Each row: color swatch | editable name | voice picker dropdown | delete button
- "Add Role" button appends a new role with next available color
- Deleting a role: if segments are assigned to it, show warning and offer to reassign or remove tags

### 8.3 Voice Name Persistence
Label changes propagate immediately to:
1. All `VoiceTag` marks in the editor (re-render via Tiptap command)
2. All `Segment` records in the project
3. The exported JSON/HTML

---

## 9. TTS API Abstraction Layer

### 9.1 Provider Interface
All TTS providers implement a common interface. The `capabilities` flag tells the playback engine what highlight granularity is available — the player adapts automatically, no provider-specific code in the UI layer.

```typescript
interface TTSProvider {
  id: string;
  name: string;
  capabilities: ProviderCapabilities;
  voices: () => Promise<Voice[]>;
  generate: (params: GenerateParams) => Promise<GenerateResult>;
}

interface ProviderCapabilities {
  wordTimestamps: boolean;      // Returns per-word timing → word-level highlight sync
  sentenceTimestamps: boolean;  // Returns per-sentence timing (rare — usually derived)
  emotions: boolean;            // Supports emotion param (e.g. MiniMax)
  streaming: boolean;           // Supports streaming response
}

interface GenerateParams {
  text: string;
  voiceId: string;
  settings?: {
    speed?: number;       // 0.5 – 2.0
    pitch?: number;
    emotion?: string;     // provider-specific, only used if capabilities.emotions
    format?: "mp3" | "wav";
  }
}

interface GenerateResult {
  blob: Blob;                        // MP3 audio
  wordTimings: WordTiming[] | null;  // null if provider doesn't support it
}
```

### 9.2 Supported Providers (v1 Targets)

| Provider | Word Timestamps | Emotions | Highlight Mode | Notes |
|---|---|---|---|---|
| **MiniMax Audio** | ✅ `word_info` array | ✅ Yes | **Word-level** | Primary target |
| **ElevenLabs** | ✅ Alignment data | ❌ No | **Word-level** | Rich voice library |
| **OpenAI TTS** | ❌ No | ❌ No | **Sentence-level** | Simple, reliable fallback |
| **Browser SpeechSynthesis** | ✅ `charIndex` events | ❌ No | **Word-level** | Free offline fallback, low quality |

**Highlight mode is determined at playback time from `provider.capabilities.wordTimestamps` — no manual configuration needed.**

### 9.3 API Key Security
Resolved — see §6.9 (API Key Storage, Flow A). Keys encrypted via Web Crypto API (PBKDF2 + AES-GCM), stored in IndexedDB, decrypted into memory only per session.

### 9.4 Generation Pipeline

```
Tagged span in editor
        │
        ▼
① Sentence extraction (splitter.js)
   "The storm broke at dawn. Elena ran to the window. The city was silent."
   → ["The storm broke at dawn.", "Elena ran to the window.", "The city was silent."]
   → ParagraphGroup created, editorFrom/editorTo recorded per sentence
        │
        ▼
② For each sentence (max 2 concurrent, queue remainder):
   sentence.status = "generating"
        │
   TTSProvider.generate(sentence.text, role.voiceAssignment)
        │
   ├─ SUCCESS → GenerateResult { blob, wordTimings }
   │     │
   │     ├─→ [1] blob → IndexedDB("audio_sentences", sentence.id)
   │     │
   │     ├─→ [2] AudioContext.decodeAudioData(blob)
   │     │         sentence.durationMs = buffer.duration * 1000
   │     │         sentence.startMs = sum of prior sentence durations in group
   │     │         sentence.endMs = startMs + durationMs
   │     │
   │     ├─→ [3] IF wordTimings present:
   │     │         map word positions to editorFrom/editorTo via text search
   │     │         sentence.wordTimings = wordTimings (with editor positions)
   │     │
   │     └─→ sentence.status = "ready"
   │
   └─ FAILURE → sentence.status = "error", log errorMessage, continue
        │
        ▼
③ All sentences in group ready → Paragraph Stitching
   stitchParagraph(sentenceBlobs[]) → single AudioBuffer
   → encode to MP3 (lamejs) → stitchedBlob
   → IndexedDB("audio_stitched", group.id)
   → IF outputFolderHandle: write stitchedDiskFilename to disk
   → group.stitchStatus = "ready"
   → group.totalDurationMs, startMs, endMs computed
        │
        ▼
④ Recompute master timeline startMs/endMs for ALL groups (sequential sum)
   Update Pinia store → Playlist panel re-renders
```

### 9.5 Paragraph Stitching & MP3 Encoding

```javascript
async function stitchParagraph(sentenceBlobs) {
  const ctx = new OfflineAudioContext(1, 1, 44100); // sample rate placeholder
  const buffers = await Promise.all(
    sentenceBlobs.map(blob =>
      blob.arrayBuffer().then(ab => ctx.decodeAudioData(ab))
    )
  );
  const sampleRate = buffers[0].sampleRate;
  const totalSamples = buffers.reduce((sum, b) => sum + b.length, 0);
  const stitched = new AudioContext().createBuffer(1, totalSamples, sampleRate);
  let offset = 0;
  for (const buf of buffers) {
    stitched.getChannelData(0).set(buf.getChannelData(0), offset);
    offset += buf.length;
  }
  return stitched; // raw AudioBuffer → encode below
}
```

**MP3 Encoding Decision:**
| Method | Quality | Complexity | Browser Support |
|---|---|---|---|
| **`lamejs`** (recommended) | Consistent ~128kbps | Low (53KB lib) | Universal |
| `MediaRecorder` | Browser-dependent | Medium | Chrome/Firefox/Safari |
| WAV (raw PCM) | Lossless | Trivial | Universal |

**v1 recommendation: `lamejs`** for MP3 output with WAV as a fallback if encoding fails. Adds one small dependency but gives deterministic, portable output.

### 9.6 Rate Limiting & Queue
- Concurrency limiter: max **2 parallel sentence requests** per paragraph group
- Exponential backoff on 429 errors (retry up to 3×, delay: 1s → 2s → 4s)
- Progress display: *"Generating 4 / 12 sentences..."* with per-group progress bars in playlist

### 9.7 Voice Polling & Dropdown

Each provider exposes a `voices()` method that fetches available voices from the API. These are presented as a searchable dropdown in the Cast Panel when assigning a voice to a role.

#### Provider Voice Endpoints
| Provider | Endpoint | Response Shape |
|---|---|---|
| **MiniMax** | `GET /v1/t2a_v2/voice_list` | `{ voices: [{ voice_id, name, gender, language }] }` |
| **OpenAI** | Static list (no API endpoint) | Hardcoded: `alloy, echo, fable, onyx, nova, shimmer` |
| **ElevenLabs** | `GET /v1/voices` | `{ voices: [{ voice_id, name, labels, preview_url }] }` |
| **Browser TTS** | `speechSynthesis.getVoices()` | `SpeechSynthesisVoice[]` — lang, name, localService |

#### Voice Interface
```typescript
interface Voice {
  id: string;           // Provider-specific voice ID
  name: string;         // Display name
  gender?: string;      // "male" | "female" | "neutral" — if available
  language?: string;    // e.g. "en-US"
  previewUrl?: string;  // ElevenLabs provides audio preview URLs
  tags?: string[];      // e.g. ["narrator", "warm", "authoritative"]
}
```

#### Polling Strategy
Voices are **polled once per session per provider** and cached in-memory. They are not persisted to IndexedDB — stale voice lists are a worse problem than a brief load on app open.

```javascript
// In-memory session cache — cleared on tab close
const voiceCache = {}; // { [providerId]: Voice[] }

async function getVoices(provider) {
  if (voiceCache[provider.id]) return voiceCache[provider.id];
  const voices = await provider.voices();
  voiceCache[provider.id] = voices;
  return voices;
}
```

**Polling is triggered when:**
- User opens the Cast Panel (lazy — only fetch if not already cached)
- User switches active provider in Settings
- User clicks a manual "Refresh voices" button (in Cast Panel, for stale list recovery)

**If the API call fails** (network error, bad key):
- Show inline error in the dropdown: *"Could not load voices — check your API key"*
- Offer the "Refresh voices" button to retry
- For OpenAI (static list) — never fails, always available offline

#### Cast Panel Voice Dropdown UX
```
Voice Role: Narrator
──────────────────────────────────────
Provider:  [ MiniMax ▾ ]

Voice:     [ 🔍 Search voices...     ]
           ┌───────────────────────────┐
           │ ● Aria        (Female, EN) │  ← selected
           │   Brian       (Male, EN)   │
           │   Dawn        (Female, EN) │
           │   ···                      │
           └───────────────────────────┘

           [ ▶ Preview ]   ← plays previewUrl if available
                             falls back to generating 1 sentence sample
```

**Dropdown features:**
- **Search/filter** — type to filter by name, gender, or tag
- **Preview button** — plays `previewUrl` directly (ElevenLabs) or triggers a short TTS sample generation (MiniMax, OpenAI) with the current role's first sentence as test text
- **Language filter** — optional filter chip for multilingual projects
- **Selected voice persists** in `VoiceRole.voiceAssignment` — if the voice disappears from the API list on next poll, keep the assignment but show a ⚠️ badge: *"Voice may no longer be available"*

#### Voice Poll — MiniMax Specifics
MiniMax returns system voices and any cloned voices in the same list. Tag system voices with `source: "system"` and cloned voices with `source: "cloned"` for grouping in the dropdown:
```
System Voices ──────────────
  ● Aria (Female, EN)
  ● Brian (Male, EN)
Cloned Voices ──────────────
  ● My Custom Voice
```

### 10.1 Playlist Table
The playlist displays one row per **ParagraphGroup** (not per sentence). Sentences are collapsed inside — they are implementation detail, not user-facing.

| # | Role | Text Excerpt | Sentences | Duration | Start | End | Status | Actions |
|---|---|---|---|---|---|---|---|---|
| 1 | Narrator | "The storm broke at dawn..." | 3 | 0:04.6 | 0:00.0 | 0:04.6 | ✅ Ready | ▶ ↓ 🔄 |
| 2 | Elena | "Where are you going?" | 1 | 0:02.8 | 0:04.6 | 0:07.4 | ✅ Ready | ▶ ↓ 🔄 |
| 3 | The King | "Silence, child." | 1 | 0:01.5 | 0:07.4 | 0:08.9 | ⚠ Error | — 🔄 |

**Column notes:**
- **#**: Document order. Integer per ParagraphGroup.
- **Text Excerpt**: First 60 chars of the group's full text. Click → jumps editor to that span.
- **Sentences**: Count of sentences in the group. Click → expands inline to show sentence rows.
- **Duration / Start / End**: Derived from stitched audio duration + master timeline cumulative sum.
- **Actions**: ▶ preview stitched audio, ↓ download stitched MP3, 🔄 regenerate all sentences + re-stitch.

**Expanded sentence rows** (on click):
```
▼ 1 | Narrator | "The storm broke at dawn..." | 3 sentences | 0:04.6 | ✅
      ├─ 1.1 | "The storm broke at dawn."    | 0:01.8 | 0:00.0 – 0:01.8 | ✅ | ▶ 🔄
      ├─ 1.2 | "Elena ran to the window."    | 0:01.6 | 0:01.8 – 0:03.4 | ✅ | ▶ 🔄
      └─ 1.3 | "The city was silent."        | 0:01.2 | 0:03.4 – 0:04.6 | ✅ | ▶ 🔄
```

### 10.2 Audio Player
- Fixed bar at bottom of playlist pane
- Plays **stitched paragraph MP3s** in order (not raw sentences)
- Waveform visualiser via `AnalyserNode`
- Clicking a playlist row → seeks to that group's `startMs` in master timeline
- "Play All" → plays groups sequentially, firing Playback Sync events throughout

### 10.3 Timestamp Computation
```
Sentence level (built during generation):
  sentence.startMs = sum of durationMs of all prior sentences in group
  sentence.endMs   = sentence.startMs + sentence.durationMs

Group level (built after stitching):
  group.totalDurationMs = sum of all sentence.durationMs in group

Master timeline (rebuilt after each group completes):
  group.startMs = sum of totalDurationMs of all prior groups
  group.endMs   = group.startMs + group.totalDurationMs
```

### 10.4 Playback Sync — Tiered Highlight System

**Playback Sync** is the feature that highlights text in the editor in real time as audio plays. The highlight granularity depends on what the active TTS provider returned.

#### Highlight Tier Selection
```javascript
function getHighlightMode(sentence) {
  if (sentence.wordTimings && sentence.wordTimings.length > 0) {
    return 'word';      // MiniMax, ElevenLabs, Browser SpeechSynthesis
  }
  return 'sentence';    // OpenAI TTS — fallback
}
// Note: 'segment' (whole paragraph) is a last-resort only if both are unavailable
```

#### Tier 1 — Word-Level Highlight (MiniMax, ElevenLabs)
```
Playback currentMs advances
        │
        ▼
Find active sentence: group.startMs + sentence.startMs ≤ currentMs < sentence.endMs
        │
        ▼
Within that sentence, find active word:
  sentence.startMs(abs) + word.startMs ≤ currentMs < sentence.startMs(abs) + word.endMs
        │
        ▼
editor.setWordHighlight(word.editorFrom, word.editorTo)
  → Tiptap decoration: thin underline in role colour, 100ms CSS transition
  → Previous word highlight removed simultaneously
```

#### Tier 2 — Sentence-Level Highlight (OpenAI TTS fallback)
```
Playback currentMs advances
        │
        ▼
Find active sentence by startMs/endMs (relative to group.startMs)
        │
        ▼
editor.setSentenceHighlight(sentence.editorFrom, sentence.editorTo)
  → Tiptap decoration: soft background fill in role colour at 30% opacity
  → Sentence-width, replaces previous sentence highlight
```

#### Editor Highlight Commands (Tiptap Decorations)
Highlights are **decorations**, not marks — they are transient, never saved to document state, and cleared immediately on playback pause or stop.

```javascript
// In StoryEditor.vue — expose these to the player
const highlightWord = (from, to) => {
  editor.value.commands.setHighlightDecoration({ from, to, type: 'word' });
};
const highlightSentence = (from, to) => {
  editor.value.commands.setHighlightDecoration({ from, to, type: 'sentence' });
};
const clearHighlight = () => {
  editor.value.commands.clearHighlightDecoration();
};
```

#### Playback Sync Event Loop
```javascript
// In player.js — runs on requestAnimationFrame during playback
function syncLoop(audioCtx, startedAt, group, sentences) {
  const currentMs = (audioCtx.currentTime - startedAt) * 1000;

  // Find active sentence
  const activeSentence = sentences.find(
    s => currentMs >= s.startMs && currentMs < s.endMs
  );
  if (!activeSentence) return;

  const mode = getHighlightMode(activeSentence);

  if (mode === 'word') {
    const absMs = currentMs - activeSentence.startMs;
    const activeWord = activeSentence.wordTimings.find(
      w => absMs >= w.startMs && absMs < w.endMs
    );
    if (activeWord) highlightWord(activeWord.editorFrom, activeWord.editorTo);

  } else {
    highlightSentence(activeSentence.editorFrom, activeSentence.editorTo);
  }

  requestAnimationFrame(() => syncLoop(audioCtx, startedAt, group, sentences));
}
```

#### Visual Design of Highlights
| Tier | Style | Colour |
|---|---|---|
| Word | Bottom border 2px + subtle background | Role colour, 100% opacity border / 15% fill |
| Sentence | Background fill | Role colour, 30% opacity |
| Both active simultaneously | Word overrides sentence | Word decoration sits above sentence decoration |

When the role colour is applied to highlights, it reinforces the voice identity — the audience sees *whose* voice is speaking while it plays.

---

## 11. Export System

### 11.1 Export Formats

| Format | Contents | Use Case |
|---|---|---|
| **JSON** | Full project model (no blobs) | Backup / share project state |
| **HTML** | Annotated document with `data-voice-role` spans | Archive of tagged script |
| **MP3 Bundle (ZIP)** | All audio blobs + `playlist.json` manifest | Final audio deliverable |
| **CSV** | Segment table (role, text, start, end, duration) | Spreadsheet / subtitles |

### 11.2 ZIP Export Implementation
Use **JSZip** (browser library) to bundle:
```
storyfi_export_[projectTitle]_[date]/
├── playlist.json          ← segment manifest with timestamps
├── audio/
│   ├── 001_narrator.mp3
│   ├── 002_elena.mp3
│   └── 003_the_king.mp3
└── script.html            ← annotated HTML document
```

### 11.3 `playlist.json` Schema
```json
{
  "project": "My Novel Chapter 1",
  "exportedAt": "2026-04-04T12:00:00Z",
  "totalDurationMs": 8900,
  "paragraphs": [
    {
      "order": 1,
      "role": "Narrator",
      "file": "audio/001_narrator_p1.mp3",
      "startMs": 0,
      "endMs": 4600,
      "durationMs": 4600,
      "sentences": [
        { "index": 0, "text": "The storm broke at dawn.",  "startMs": 0,    "endMs": 1800 },
        { "index": 1, "text": "Elena ran to the window.",  "startMs": 1800, "endMs": 3400 },
        { "index": 2, "text": "The city was silent.",      "startMs": 3400, "endMs": 4600 }
      ]
    },
    {
      "order": 2,
      "role": "Elena",
      "file": "audio/002_elena_p1.mp3",
      "startMs": 4600,
      "endMs": 7400,
      "durationMs": 2800,
      "sentences": [
        { "index": 0, "text": "Where are you going?", "startMs": 0, "endMs": 2800 }
      ]
    }
  ]
}
```

---

## 12. State Management Strategy

**No framework store needed for v1.** Use a simple module-level reactive store:

```
AppState (in-memory, JS module)
├── currentProject: Project | null
├── cast: VoiceRole[]
├── segments: Segment[]
├── playbackState: { activeSegmentId, isPlaying, currentMs }
├── generationQueue: string[]   ← segment IDs
└── uiState: { activePanel, selectedRoleId, ... }
```

**Persistence flow:**
```
Any state mutation → debounced 2s → serialize → write to IndexedDB
App load → read from IndexedDB → hydrate AppState → init editor
```

---

## 13. Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| **Framework** | **Vue 3** (Composition API, `<script setup>`) | Official Tiptap integration (`@tiptap/vue-3`), large ecosystem, excellent DevTools, clean SFC syntax. See Q1. |
| **State** | **Pinia** (add in Phase 3) | Lightweight, Vue-native, DevTools integration. Not needed for Phase 1–2; add when generation queue + playback state get complex. |
| **Editor** | **Tiptap v2** via `@tiptap/vue-3` | Custom marks, MD import, JSON state, first-party Vue component |
| **MD Parsing** | `@tiptap/extension-markdown` | Integrated with editor |
| **Styles** | CSS custom properties + PostCSS | No framework bloat |
| **Storage** | `idb` library (IndexedDB wrapper) | Clean async API over raw IndexedDB |
| **File Output** | File System Access API (native browser) | Direct disk writes; `idb` persists the `FileSystemDirectoryHandle` |
| **SW / Caching** | Workbox via `vite-plugin-pwa` | Industry standard; precaching config auto-generated |
| **MP3 Encoding** | `lamejs` | Encode stitched AudioBuffer → MP3. 53KB, deterministic quality. WAV fallback. |
| **ZIP Export** | JSZip | Browser-native bundling, no server |
| **Audio** | Web Audio API (native) | Decoding, duration computation, playback stitching — no library needed |
| **Build Tool** | Vite | Fast HMR, first-class Vue + PWA support |
| **Hosting** | GitHub Pages / Netlify / Cloudflare Pages | Static PWA, free tier |

### Confirmed Dependency List (Phase 1–3)
```bash
# Core
npm install vue@3
npm install -D vite @vitejs/plugin-vue vite-plugin-pwa

# Editor
npm install @tiptap/vue-3 @tiptap/pm @tiptap/starter-kit
npm install @tiptap/extension-markdown

# Storage
npm install idb

# Export + Audio encoding
npm install jszip lamejs

# State (add Phase 3)
npm install pinia
```

---

## 14. Phased Implementation Roadmap

### Phase 1 — Core Shell (Week 1–2)
- [ ] Vite project setup with `vite-plugin-pwa`
- [ ] `manifest.json` + service worker (Workbox precaching)
- [ ] IndexedDB schema via `idb` (projects, sentences, audio_sentences, audio_stitched, api_keys, settings)
- [ ] File System Access API detection + `hasFileSystemAccess()` utility
- [ ] StorageManager API — `getQuotaInfo()` + `requestPersistentStorage()`
- [ ] StorageBar component (sidebar) + progressive warning banners
- [ ] Persistent storage prompt (first project save)
- [ ] Library screen (project list, new project, import MD, storage bar)
- [ ] Editor screen shell with "← Library" nav and URL hash routing (`/#/project/{id}`)
- [ ] Project CRUD (create, list, open, delete) + "Clear Audio" per project
- [ ] App shell layout (sidebar + editor pane + playlist pane)

### Phase 2 — Editor & Tagging (Week 3–4)
- [ ] Tiptap editor integration + MD import
- [ ] `VoiceTag` custom mark extension
- [ ] Floating tag toolbar on text selection
- [ ] Cast panel with role CRUD and color assignment
- [ ] Voice dropdown per role — polled from active provider API
- [ ] In-memory voice cache per session
- [ ] Voice preview button (previewUrl or short TTS sample)
- [ ] Editor state auto-saved to IndexedDB

### Phase 3 — TTS Integration & Storage (Week 5–6)
- [ ] Provider abstraction interface with `capabilities` flag
- [ ] MiniMax Audio provider — parse `word_info` → `WordTiming[]`
- [ ] OpenAI TTS provider — no word timings, sentence-level fallback
- [ ] ElevenLabs provider — parse alignment data → `WordTiming[]`
- [ ] Browser SpeechSynthesis provider — `charIndex` → word highlight
- [ ] Sentence extraction algorithm (`splitter.js`)
- [ ] `ParagraphGroup` + `Sentence` creation from tagged spans
- [ ] `editorFrom` / `editorTo` position mapping per sentence and word
- [ ] Generation queue — max 2 concurrent sentence requests
- [ ] Sentence MP3 blobs → IndexedDB("audio_sentences")
- [ ] Paragraph stitching via Web Audio API + `lamejs` MP3 encoding
- [ ] Stitched blobs → IndexedDB("audio_stitched") + disk (if folder linked)
- [ ] File System Access API — per-project output folder picker (first-gen prompt + Settings)
- [ ] `FileSystemDirectoryHandle` stored on project record in IndexedDB
- [ ] Permission re-request on project open (if handle saved)
- [ ] Sync-on-open divergence check + warning modal (re-write / re-import / re-generate / ignore)
- [ ] Disk write step in generation pipeline + `diskWriteStatus` tracking

### Phase 4 — Playlist, Playback & Sync (Week 7–8)
- [ ] Playlist table — ParagraphGroup rows with expandable sentence rows
- [ ] Master timeline computation (group startMs/endMs sequential sum)
- [ ] Unified audio player — plays stitched group blobs in sequence
- [ ] Waveform visualiser (`AnalyserNode`)
- [ ] Click playlist row → seek to group startMs
- [ ] Click playlist row → jump editor to group span
- [ ] **Playback Sync** — `requestAnimationFrame` sync loop
- [ ] Tier 1: Word-level highlight (MiniMax, ElevenLabs, Browser TTS)
- [ ] Tier 2: Sentence-level highlight fallback (OpenAI TTS)
- [ ] Tiptap highlight decorations (`setHighlightDecoration` command)
- [ ] Clear highlights on pause/stop/seek

### Phase 5 — Export (Week 8)
- [ ] JSON project export/import
- [ ] HTML annotated script export
- [ ] ZIP bundle (JSZip + playlist.json)
- [ ] CSV export

### Phase 6 — Polish (Week 9–10)
- [ ] Offline UX (toasts, status indicators)
- [ ] Settings modal (API keys, default voice mapping)
- [ ] Error states and retry logic
- [ ] PWA install prompt UI
- [ ] Performance audit (Lighthouse ≥ 90 PWA score target)

---

## 15. Key Open Questions (Decide Before Phase 1)

| # | Question | Options | Decision |
|---|---|---|---|
| Q1 | JS framework? | Svelte vs Vanilla vs Vue | `[DECIDED: Vue 3 — Composition API + <script setup>]` |
| Q2 | Untagged text behavior at generation? | Skip / use Narrator default / prompt user | `[DECIDED: Skip — no tag = no audio. Untagged text is treated as script annotations/comments only.]` |
| Q3 | API key storage UX? | localStorage (warn) / per-session only / proxy | `[DECIDED: Client-side encryption via Web Crypto API (PBKDF2 + AES-GCM). No proxy. User prompted on save — choice between plaintext or password-encrypted. Encrypted blob stored in IndexedDB. Decrypted key in memory only, cleared on tab close. See §6.8.]` |
| Q4 | Max project size? | Limit segments? MB cap on audio? | `[DECIDED: No artificial cap. Use available browser quota via StorageManager API. Show live storage bar, warn at 80%/95%, offer "Clear Audio" per project. Request persistent storage on first save. See §6.10.]` |
| Q5 | Multi-project UX? | Tabs / switcher / separate "library" screen | `[DECIDED: One project open at a time. Library screen to switch between projects. v2: Merge/Append — import segments from another project to start or end of current project. See §4 and §19.]` |
| Q6 | Audio stitching? | Client-side (Web Audio) / server concat / export-only | `[DECIDED: Client-side via Web Audio API. Sentence AudioBuffers decoded and concatenated in-browser. Re-encoded to MP3 via lamejs. No server involved. See §9.5.]` |
| Q7 | Segment splitting rule? | Per-paragraph / per-sentence / user-defined | `[DECIDED: User-defined character limit (default 250). Auto-split at last sentence boundary before limit. Manual segment break marker insertable anywhere. See §7.5.]` |
| Q8 | Custom voice names per-provider? | Allow free-text voice ID entry vs. dropdown from API | `[DECIDED: Dropdown populated from live API voice list. Voices polled on provider select/settings open and cached per session. See §9.7.]` |
| Q9 | Output folder UX — when to prompt? | On first generate / in Settings only / per-project | `[DECIDED: Prompt on first generation if no folder set. Configurable in per-project Settings thereafter. Each project has its own output folder. See §6.9.]` |
| Q10 | What if disk file and IndexedDB blob diverge? | Always re-sync on open / warn user / ignore | `[DECIDED: Re-sync on project open. Compare disk file existence against IndexedDB records. Warn user of any divergence with option to re-generate missing audio. See §6.9.]` |

---

## 16. Risk Register

| Risk | Severity | Mitigation |
|---|---|---|
| CORS on TTS APIs | High | Most require server-side proxy. Confirm MiniMax CORS headers. May need a tiny Cloudflare Worker proxy. |
| Safari storage eviction | Medium | Request persistent storage on first save. Warn user if denied. Encourage ZIP export as backup. |
| IndexedDB storage limits | Low | No artificial cap. StorageManager API monitors quota. Progressive warnings at 80%/95%. "Clear Audio" gives user control without data loss. |
| File System Access — Firefox | Medium | Detected at runtime. Show clear fallback UI and ZIP export path. Never hard-depend on it. |
| File System Access — permission expiry | Low | Permissions may reset if browser/OS revokes them. Handle `NotAllowedError` gracefully; re-prompt user. |
| Disk filename collisions | Low | Regenerating a segment overwrites the existing file (same `diskFilename`). Intended behaviour — document clearly. |
| Tiptap mark conflicts | Medium | Test overlapping mark behavior early. Write unit tests for `VoiceTag` mark. |
| MP3 duration accuracy | Low | `decodeAudioData` is reliable. Test with very short clips (<0.5s). |
| API key — forgotten password | Low | Non-recoverable by design. UI warns clearly at save time. User must re-enter API key. |
| API key exposure | Medium | Plaintext option still available for trusted devices. Encryption option prominently highlighted. One-line scope caveat shown in Settings. |
| Bundle size (Tiptap) | Medium | Code-split editor. Tiptap + extensions = ~200KB gzipped. Acceptable. |

---

## 17. Design Direction

**Aesthetic**: Dark, editorial, cinematic. Think: a director's script table at 2am.

**Color Palette:**
```
Background:    #0e0c18  (near-black, cool)
Surface:       #1a1625  (elevated panels)
Border:        #2e2a42
Accent:        #7c5cbf  (deep violet)
Highlight:     #c084fc  (lavender pop)
Text primary:  #f0eeff
Text muted:    #8b85a8
Success:       #4ade80
Warning:       #facc15
Error:         #f87171
```

**Typography:**
- Display: `Playfair Display` (serif, dramatic — for project titles)
- UI: `DM Sans` (clean, modern — for controls and labels)
- Mono: `JetBrains Mono` (for segment IDs, timestamps)

**Key UI Principles:**
- Voice role colors are the primary visual language — they carry meaning, keep them saturated
- Editor pane is always dominant — never let chrome overwhelm the script
- Playlist pane is secondary, collapsible on small viewports
- Transitions: 200ms ease-out — snappy, not flashy

---

## 18. File & Folder Structure (Proposed)

```
storyfi/
├── public/
│   ├── manifest.json
│   ├── sw.js                    ← generated by vite-plugin-pwa
│   └── icons/
├── src/
│   ├── main.js                  ← Vue app entry, mounts App.vue
│   ├── App.vue                  ← root component, layout shell
│   ├── store/
│   │   ├── project.js           ← Pinia store: current project, cast, segments
│   │   ├── playback.js          ← Pinia store: player state
│   │   └── db.js                ← IndexedDB via idb
│   ├── storage/
│   │   ├── filesystem.js        ← File System Access API (folder picker, write, permission)
│   │   ├── audiocache.js        ← IndexedDB blob read/write helpers
│   │   ├── crypto.js            ← Web Crypto API: encryptApiKey, decryptApiKey, deriveKey
│   │   ├── quota.js             ← StorageManager API: getQuotaInfo, requestPersistentStorage
│   │   └── index.js             ← unified storage facade (writes to both targets)
│   ├── editor/
│   │   ├── StoryEditor.vue      ← Tiptap editor component (@tiptap/vue-3)
│   │   ├── extensions/
│   │   │   ├── VoiceTag.js      ← custom Mark extension
│   │   │   └── SegmentBreak.js  ← custom Node: manual segment break marker (§)
│   │   ├── FloatingToolbar.vue  ← role picker + segment break button on text selection
│   │   └── splitter.js          ← splitToChunks() — character-limit split algorithm
│   ├── tts/
│   │   ├── provider.js          ← TTSProvider interface
│   │   ├── minimax.js
│   │   ├── openai.js
│   │   └── browser.js
│   ├── audio/
│   │   ├── player.js            ← Web Audio API player
│   │   └── timestamps.js        ← duration computation
│   ├── export/
│   │   ├── json.js
│   │   ├── html.js
│   │   ├── zip.js               ← JSZip bundle
│   │   └── csv.js
│   ├── components/              ← reusable UI primitives
│   │   ├── RoleChip.vue
│   │   ├── ProgressBar.vue
│   │   ├── StorageBar.vue       ← quota usage bar shown in sidebar
│   │   └── Toast.vue
│   ├── panels/
│   │   ├── SidebarPanel.vue
│   │   ├── CastPanel.vue
│   │   ├── EditorPane.vue
│   │   └── PlaylistPane.vue
│   ├── modals/
│   │   ├── SettingsModal.vue       ← API keys, default voice, output folder picker
│   │   ├── FolderPromptModal.vue   ← first-run folder setup prompt
│   │   └── StorageManagerModal.vue ← per-project audio size + Clear Audio / Delete
│   └── utils/
│       ├── uuid.js
│       ├── debounce.js
│       ├── filesystem.js        ← hasFileSystemAccess(), formatDiskFilename()
│       └── colors.js
├── vite.config.js
├── package.json
└── CLAUDE.md                    ← this file
```

---

## Appendix A: MiniMax Audio Speech — API Notes

**Endpoint**: `POST https://api.minimax.io/v1/t2a_v2`

**Key params:**
```json
{
  "model": "speech-02-hd",
  "text": "...",
  "stream": false,
  "voice_setting": {
    "voice_id": "...",
    "speed": 1.0,
    "vol": 1.0,
    "pitch": 0,
    "emotion": "neutral"
  },
  "audio_setting": {
    "sample_rate": 32000,
    "bitrate": 128000,
    "format": "mp3",
    "channel": 1
  }
}
```
**Response**: base64-encoded MP3 in `data.audio`.  
**CORS**: Verify — likely requires a proxy in browser context.  
**Auth**: `Authorization: Bearer {MINIMAX_API_KEY}` + `GroupId` header.

---

## Appendix B: Future Features (v2+ Backlog)

- **Merge / Append projects**: Import paragraph groups from another project to the start or end of the currently open project. Resolves role name conflicts (rename or merge matching roles). Preserves all audio blobs and timing metadata. See §19 for full spec draft.
- **Scene / Act / Chapter structure**: hierarchical grouping of segments
- **Drag-to-reorder segments** in playlist (overrides document order)
- **Emotion overrides per segment** (happy/sad/angry, etc. where API supports)
- **Waveform annotation**: visual script + audio alignment view
- **SRT/VTT subtitle export**: timed subtitle file — sentence timings already in playlist.json, trivial to convert
- **Word-level SRT**: one subtitle entry per word (for word-highlight providers)
- **Batch re-voice**: swap all segments from one voice to another
- **Cloud sync**: optional Supabase/PocketBase backend for multi-device
- **Cloudflare Worker API proxy**: shield API keys server-side
- **Voice preview panel**: audition voices before assigning to a role
- **Collaboration**: share project JSON link (no backend needed, URL-encoded)

---

## 19. v2 Draft — Project Merge / Append

> **Status**: Draft only. Not scheduled for v1. Captured here to preserve the design thinking and avoid re-solving later.

### Concept
Import all paragraph groups from a **source project** into the currently open **target project**, appending them to either the start or end of the target's editor document. Audio blobs and timing metadata travel with the content — no re-generation required if voices match.

### User Flow
```
Editor (target project open)
        │
        ▼
Toolbar: [ ··· ] → "Append from project..."
        │
        ▼
Library picker — shows all other saved projects
  [ My Novel Ch.1  ]
  [ Podcast Script ]  ← user selects
        │
        ▼
Append position:
  ( ) Append to END of current project   ← default
  ( ) Prepend to START of current project
        │
        ▼
Role Conflict Resolution (if source has roles not in target):
┌────────────────────────────────────────────────────────┐
│  Source project has these roles not in current project │
│                                                        │
│  "Host"  →  [ Create new role "Host"      ▾ ]         │
│  "Guest" →  [ Merge into existing: Elena  ▾ ]         │
│                                                        │
│  [ Cancel ]                  [ Confirm Append ]        │
└────────────────────────────────────────────────────────┘
        │
        ▼
Source paragraph groups inserted into target editor doc
Source sentence blobs copied in IndexedDB to target stores
Master timeline recomputed
Playlist re-renders with appended groups
```

### Role Conflict Resolution Rules
| Scenario | Default Behaviour |
|---|---|
| Source role name matches target role exactly | Auto-merge — same role, same voice assignment |
| Source role name differs, voice ID matches | Suggest merge (same voice, different label) |
| Source role name differs, voice ID differs | Create new role by default |
| Source has more roles than target's 10-role cap | Block append, show error with count |

### Data Operations
```javascript
async function appendProject(targetId, sourceId, position = 'end') {
  const source = await db.getProject(sourceId);
  const target = await db.getProject(targetId);

  // 1. Resolve role conflicts → role mapping { sourceRoleId → targetRoleId }
  const roleMap = await resolveRoles(source.cast, target.cast);

  // 2. Re-index paragraph group orders
  const offset = position === 'end' ? target.paragraphGroups.length : 0;
  const newGroups = source.paragraphGroups.map((g, i) => ({
    ...g,
    id: uuid(),                          // new ID in target project
    roleId: roleMap[g.roleId],           // remapped role
    order: position === 'end'
      ? target.paragraphGroups.length + i + 1
      : i + 1,                          // prepend shifts existing orders up
  }));

  // 3. Copy sentence records + audio blobs to target stores
  for (const group of newGroups) {
    const sourceSentences = await db.getSentencesByGroup(group.originalId);
    for (const s of sourceSentences) {
      const blob = await db.getAudioBlob('audio_sentences', s.id);
      const newSentenceId = uuid();
      await db.putSentence({ ...s, id: newSentenceId, paragraphGroupId: group.id });
      if (blob) await db.putAudioBlob('audio_sentences', newSentenceId, blob);
    }
    const stitchedBlob = await db.getAudioBlob('audio_stitched', group.originalId);
    if (stitchedBlob) await db.putAudioBlob('audio_stitched', group.id, stitchedBlob);
  }

  // 4. Insert groups into target, re-order existing groups if prepending
  // 5. Inject tagged spans into Tiptap editor doc at correct position
  // 6. Recompute master timeline
  // 7. Save target project
}
```

### What Does NOT Transfer
- Source project API config (target keeps its own)
- Source project settings (charLimit, output folder)
- Source audio blobs for roles that were merged (target role's existing audio untouched)

### Edge Cases
| Scenario | Handling |
|---|---|
| Source has no generated audio | Appends text + tags only, all sentences `status: "pending"` |
| Source and target use different providers | Role conflict screen shows voice mismatch warning |
| Append would exceed storage quota | Pre-check blob sizes, warn user before confirming |
| User appends same project twice | Allowed — creates duplicate paragraph groups with new IDs |
