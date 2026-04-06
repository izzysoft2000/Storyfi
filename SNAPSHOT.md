# Storyfi — Implementation Snapshot
> Read this file at the start of every session before touching any code.
> Update this file at the end of every session.
> Last updated: 2026-04-06
> Current phase: Phase 4 complete — Phase 5 next

---

## What Storyfi Is
A browser-native PWA that imports Markdown scripts, lets users tag text selections with voice roles, generates MP3 audio via TTS APIs (MiniMax, OpenAI, Browser), stitches sentences into paragraph audio files, and writes them to a user-chosen disk folder. Built with Vue 3 + Tiptap + Pinia + IndexedDB.

---

## Tech Stack
| Layer | Choice |
|---|---|
| Framework | Vue 3, Composition API, `<script setup>` |
| Editor | Tiptap v2 via `@tiptap/vue-3` |
| State | Pinia (project.js + generation.js + playback.js stores) |
| Storage | IndexedDB via `idb` library |
| File output | File System Access API (per-project folder) |
| Build | Vite + vite-plugin-pwa |
| MP3 encoding | Direct blob concat (Phase 3); lamejs deferred to Phase 6 |
| Playback | Web Audio API (`AudioContext` + `AudioBufferSourceNode`) |
| Fonts | Playfair Display (display), DM Sans (UI), JetBrains Mono (mono) |

---

## Project Structure

```
storyfi/
├── index.html
├── vite.config.js
├── package.json
├── public/
│   └── manifest.json
└── src/
    ├── main.js                        — Vue app entry, Pinia init
    ├── App.vue                        — root component, hash router (#/project/:id), global CSS tokens
    ├── views/
    │   ├── LibraryView.vue            — project list, create, import MD, delete, clear audio
    │   └── EditorView.vue             — 3-panel shell (sidebar | editor | playlist)
    ├── panels/
    │   ├── CastPanel.vue              — voice role CRUD, inline name edit, voice picker modal
    │   └── PlaylistPane.vue           — group rows, sentence sub-rows, AudioPlayerBar docked at bottom
    ├── editor/
    │   ├── StoryEditor.vue            — Tiptap editor, BubbleMenu tagging, MD import, highlight decorations
    │   ├── splitter.js                — sentence extraction, char-limit splitting, extractTaggedSpans()
    │   └── extensions/
    │       ├── VoiceTag.js            — custom Mark: highlights tagged text with role colour
    │       └── SegmentBreak.js        — custom Node: manual segment break marker (§)
    ├── store/
    │   ├── db.js                      — IndexedDB schema (6 stores), saveProject strips Vue Proxy
    │   ├── project.js                 — Pinia: active project, cast mutations, auto-save debounced 2s
    │   ├── generation.js              — Pinia: build groups, sentence queue, stitch, disk write
    │   └── playback.js                — Pinia: transport state, RAF loop, highlight sync
    ├── tts/
    │   ├── provider.js                — registry, voice cache, withConcurrency(), withRetry()
    │   ├── minimax.js                 — MiniMax T2A v2, hex decode, GroupId as query param
    │   ├── openai.js                  — OpenAI TTS, binary MP3, no word timings
    │   └── browser.js                 — SpeechSynthesis, preview only, no MP3 export
    ├── audio/
    │   ├── timestamps.js              — getBlobDurationMs() 3-tier, computeSentenceTimings(), formatDuration()
    │   └── stitcher.js                — stitchBlobs() blob concat, WAV encoder fallback
    ├── storage/
    │   ├── db.js                      — (see store/db.js — same file)
    │   ├── crypto.js                  — Web Crypto API: PBKDF2+AES-GCM key encryption
    │   ├── filesystem.js              — File System Access API: pickFolder, write, read, exists
    │   ├── quota.js                   — StorageManager: getQuotaInfo(), requestPersistentStorage()
    │   └── synccheck.js               — disk vs IDB divergence detection on project open
    ├── modals/
    │   ├── SettingsModal.vue          — API key entry per provider, active provider selector
    │   ├── FolderPromptModal.vue      — first-generation output folder prompt, per-project
    │   └── SyncWarningModal.vue       — repair options: re-write / re-import / mark for regen
    ├── components/
    │   ├── StorageBar.vue             — quota bar with 80%/95% warnings
    │   ├── Toast.vue                  — global toast stack
    │   ├── ConfirmModal.vue           — reusable confirm dialog
    │   └── AudioPlayerBar.vue         — player transport: play/pause, stop, progress scrub, time display
    └── utils/
        ├── uuid.js                    — crypto.randomUUID()
        ├── debounce.js                — debounce(fn, ms)
        └── colors.js                 — ROLE_COLORS[], nextRoleColor(), hexAlpha()
```

---

## IndexedDB Schema (storyfi_db v1)
```
projects        keyPath: "id"          — Project record incl. paragraphGroups[].sentences[]
sentences       keyPath: "id"          — Sentence records, index: paragraphGroupId
audio_sentences keyPath: "sentenceId"  — Raw sentence MP3 Blobs
audio_stitched  keyPath: "groupId"     — Stitched paragraph MP3 Blobs
api_keys        keyPath: "providerId"  — EncryptedKeyRecord (plaintext in Phase 3)
settings        keyPath: "key"         — appPreferences, activeProvider
```

---

## Data Model (key interfaces)

```typescript
Project {
  id, title, createdAt, updatedAt,
  sourceMarkdown, editorState,        // Tiptap JSON doc
  cast: VoiceRole[],
  paragraphGroups: ParagraphGroup[],
  audioSizeBytes,
  outputFolderHandle,                  // FileSystemDirectoryHandle | null
  outputFolderName,                    // display string
  outputFolderPromptDismissed,
  persistenceGranted
}

VoiceRole { id, label, color, voiceAssignment: { voiceId, voiceName, providerId, settings } }

ParagraphGroup {
  id, roleId, roleLabel, color, order, spanKey,
  sentences: Sentence[],
  sentenceIds: string[],
  stitchStatus: "pending"|"stitching"|"ready"|"error",
  stitchedAudioKey, stitchedDiskFilename,
  totalDurationMs, startMs, endMs
}

Sentence {
  id, paragraphGroupId, roleId, text, sentenceIndex,
  status: "pending"|"generating"|"ready"|"error"|"stale",
  audioKey, durationMs, startMs, endMs,
  editorFrom, editorTo,                // ProseMirror doc positions
  wordTimings: WordTiming[] | null,    // from MiniMax word_info: { word, start_ms, end_ms }
  splitWarning
}
```

---

## Critical Bug Fixes — DO NOT REVERT

### 1. saveProject() — strips Vue Proxy before IDB write
```javascript
// store/db.js
const { outputFolderHandle, ...serializable } = project
const plain = JSON.parse(JSON.stringify(serializable))
await db.put('projects', { ...plain, outputFolderHandle, updatedAt: Date.now() })
```
Vue reactive Proxy objects cannot be structured-cloned by IndexedDB. JSON round-trip strips them.

### 2. MiniMax audio is HEX encoded, not base64
```javascript
// tts/minimax.js — audioDataToBlob()
const isHex = /^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length % 2 === 0
return isHex ? hexToBlob(trimmed) : base64ToBlob(trimmed)
```
MiniMax T2A v2 returns `data.audio` as a hex string. `atob()` on hex = corrupt audio.

### 3. MiniMax GroupId — query param not header (CORS)
```javascript
// tts/minimax.js
const url = groupId
  ? `${BASE_URL}/t2a_v2?GroupId=${encodeURIComponent(groupId)}`
  : `${BASE_URL}/t2a_v2`
```
MiniMax blocks `GroupId` as a request header from browsers. Query param works.

### 4. Resizable pane — pure DOM, no Vue reactive state during drag
```javascript
// views/EditorView.vue
function onResize(e) {
  // Direct DOM — zero Vue involvement during mousemove
  wrapperEl.value.style.flexBasis = newWidth + 'px'
}
function stopResize() {
  // No reactive update — DOM already correct, nothing for Vue to patch
}
```
Updating a `ref()` on every mousemove triggers rapid Vue re-renders → `__vnode null` crash.

### 5. getBlobDurationMs() — 3-tier with timeouts
```javascript
// audio/timestamps.js
// Tier 1: HTML <audio> element (most reliable for MP3)
// Tier 2: AudioContext with 5s Promise.race timeout
// Tier 3: size-based estimate (blob.size / 16000 * 1000)
```
`AudioContext.decodeAudioData()` can return a never-resolving promise on MiniMax MP3s.

### 6. generation.js — all imports static, none dynamic
All `import` statements are at the top level. No `await import()` inside async loops.
Dynamic imports inside concurrent async tasks cause silent module resolution hangs.

### 7. Playlist pane layout — flexbox not CSS grid
```css
/* views/EditorView.vue */
.editor-shell { display: flex; flex-direction: row; }
.playlist-wrapper { flex-shrink: 0; flex-grow: 0; flex-basis: 300px; }
```
CSS grid with dynamic `gridTemplateColumns` via `:style` is unreliable with Vue scoped styles.

### 8. Web Audio objects — never in Pinia reactive state
`AudioContext`, `AudioBufferSourceNode`, and `AudioBuffer[]` live in module-level `let` variables
in `playback.js`, never in Pinia `state()`. Vue Proxy-wrapping these causes silent failures:
suspended state becomes unreachable, `onended` callbacks are lost.
Same principle as Bug Fix #4. The pattern:
```javascript
// store/playback.js — at module scope, outside defineStore()
let _audioCtx = null
let _source = null
let _buffers = []
// Pinia state() only holds serialisable reactive values: isPlaying, currentMs, etc.
```

### 9. Playback highlight decorations — transient, never saved
`playbackHighlightPlugin` state is driven entirely by `editor.view.dispatch(tr.setMeta(...))`.
It is never written to the Tiptap JSON document and therefore never triggers the 2s auto-save
debounce. Cleared explicitly on pause/stop/playback end.
```javascript
// store/playback.js
editor.view.dispatch(
  editor.state.tr.setMeta(playbackHighlightKey, { from, to, type: 'word' })
)
```

### 10. decodeAudioData — 10s timeout in playback store
Same pattern as Bug Fix #5. Wrapped in `Promise.race` with a 10s timeout.
MiniMax MP3s can cause never-resolving `decodeAudioData` promises.
```javascript
const audioBuf = await Promise.race([
  _audioCtx.decodeAudioData(arrayBuf),
  new Promise((_, rej) => setTimeout(() => rej(new Error('decodeAudioData timeout')), 10_000)),
])
```

---

## Generation Pipeline (Phase 3)
```
User clicks Generate
  → check API key in IndexedDB (prompt Settings if missing)
  → check output folder (FolderPromptModal if first time)
  → extractTaggedSpans(doc) → buildGroupsFromDoc()
  → pendingSentences = all sentences with status "pending"|"error"
  → withConcurrency(tasks, 2):
      for each sentence:
        provider.generate() → hex/base64 → Blob
        saveAudioSentence(id, blob) → IndexedDB
        getBlobDurationMs(blob) → 3-tier
        updateSentence(id, { status: "ready", durationMs, wordTimings })
        maybeStitchGroup() → if all sentences ready:
          stitchBlobs([...blobs]) → single Blob (direct concat)
          saveAudioStitched(groupId, blob) → IndexedDB
          writeFileToFolder(handle, diskFilename, blob) → disk
          updateGroup(id, { stitchStatus: "ready", totalDurationMs })
  → recomputeMasterTimeline(groups)
  → saveProject() (strips Vue Proxy via JSON)
```

---

## Playback Pipeline (Phase 4)
```
User clicks ▶ Play All (or per-group ▶ button)
  → playback.loadAndPlay(gen.groups, startGroupIdx)
      → create AudioContext (must be in user gesture handler)
      → for each group: getAudioStitched(id) → arrayBuffer()
        → Promise.race(decodeAudioData, 10s timeout) → AudioBuffer
        → build groupOffsets[]: { groupId, groupIdx, startMs, endMs, hasAudio }
      → _startGroup(startGroupIdx)
          → AudioBufferSourceNode.start(0, offsetSec)
          → src.onended → _startGroup(next)
          → _startRaf()

RAF tick (60fps):
  → currentMs = _segmentOffsetMs + (audioCtx.currentTime - _startedAtCtx) * 1000
  → findCurrentSentence(group, groupLocalMs)
  → if sentence.wordTimings: computeWordEditorPositions() [cached per sentence]
      → sequential indexOf within sentence.editorFrom/editorTo range
      → find word whose start_ms ≤ sentenceLocalMs < end_ms
      → editorRef.highlightWord(from, to)
  → else: editorRef.highlightSentence(from, to)

Seek:
  → playback.seekToMs(ms) / seekToGroup(idx)
  → _startGroupAtOffset(groupIdx, offsetMs)
  → src.start(0, offsetSec)

Stop/unmount:
  → _stopSourceNode() (src.onended = null, src.stop())
  → _stopRaf()
  → editorRef.clearHighlight()
```

---

## Playback Store (playback.js)

### Reactive state (Pinia)
```
isPlaying, isPaused, isLoading, loadError
currentGroupIdx       — index into groupOffsets[] and _groups[]
currentSentenceId     — for playlist row highlighting
currentMs             — master timeline position in ms (updated every RAF tick)
totalMs               — total decoded duration
groupOffsets[]        — [{ groupId, groupIdx, startMs, endMs, hasAudio }]
```

### Non-reactive module-level vars (Web Audio — Bug Fix #8)
```
_audioCtx             AudioContext
_buffers[]            AudioBuffer[] indexed parallel to _groups
_source               Current AudioBufferSourceNode
_startedAtCtx         audioCtx.currentTime at last source.start()
_segmentOffsetMs      master ms offset of current group's start
_rafId                requestAnimationFrame handle
_groups               paragraphGroups[] snapshot at loadAndPlay() time
_wordPositionCache    Map<sentenceId, WordPosition[] | false>
_editorRef            StoryEditor component ref (set by EditorView on mount)
```

### Key actions
```
loadAndPlay(groups, startGroupIdx)   — decode all IDB blobs, start playback
pause() / resume() / stop()
seekToGroup(idx) / seekToMs(ms)
setEditorRef(ref)                    — called by EditorView.vue in onMounted
togglePlayPause()
```

### Getters
```
progress              0–1 fraction through totalMs
hasAudio              totalMs > 0
currentTimeDisplay    formatDuration(currentMs)
totalTimeDisplay      formatDuration(totalMs)
```

---

## StoryEditor Highlight API (Phase 4)

Exposed via `defineExpose` — called by `playback.js` RAF loop:

```javascript
highlightWord(from, to)      // gold underline decoration — MiniMax word timings
highlightSentence(from, to)  // purple wash decoration — OpenAI / fallback
clearHighlight()             // removes all playback decorations
getEditor()                  // returns raw Tiptap Editor instance (for word pos computation)
```

CSS classes (in global unscoped `<style>` in StoryEditor.vue):
```css
.playback-highlight--sentence { background: rgba(124, 92, 191, 0.22) }
.playback-highlight--word     { background: rgba(251,191,36,0.22); border-bottom: 2px solid rgba(251,191,36,0.80) }
```

---

## AudioPlayerBar (components/AudioPlayerBar.vue)

Props: `groups: ParagraphGroup[]`
Uses `usePlaybackStore()` directly.

Controls:
- Stop button (■) — disabled when stopped
- Play/Pause button (▶/⏸) — primary accent circle; shows spinner during load
- Progress track — click or drag to scrub via `playback.seekToMs(ms)`
- Time display: `currentTimeDisplay / totalTimeDisplay`
- Error banner: shown when `playback.loadError` is set

Visibility in PlaylistPane: `v-if="hasReadyAudio || playback.isPlaying || playback.isPaused"`

---

## Sync-on-Open (Q10)
On every project open:
- Compare `audio_stitched` IDB blobs vs disk files in output folder
- Divergence types: `missing_from_disk` | `missing_from_idb` | `missing_both`
- Modal offers: Re-write to disk / Re-import from disk / Mark for regeneration / Ignore
- Ignored divergences show ⚠ icon on playlist row (yellow, `diskDivergences` map in gen store)

---

## TTS Providers
| Provider | Highlight mode | Word timings | Notes |
|---|---|---|---|
| MiniMax | Word-level | ✅ `word_info` array: `{ word, start_ms, end_ms }` | Primary. Hex audio. GroupId as query param. |
| OpenAI | Sentence-level | ❌ | Binary MP3. Direct CORS. |
| Browser | Word-level | Via `charIndex` | Preview only. No MP3 export. |

---

## Voice List
MiniMax: 130+ static voices (full catalogue from platform.minimax.io/docs/faq/system-voice-id).
Fetched live from API is blocked by CORS on `groupid` header — static list used instead.
Voices loaded on Cast Panel open, cached in session memory.

---

## Routing
Hash-based: `/#/` → LibraryView, `/#/project/:id` → EditorView.
No vue-router. `window.addEventListener('hashchange')` in App.vue.

---

## Phase Completion Status
| Phase | Feature                                      | Status      |
|-------|----------------------------------------------|-------------|
| 1     | PWA shell, Library screen, IndexedDB schema  | ✅ Complete |
| 1     | StorageBar, quota management                 | ✅ Complete |
| 2     | Tiptap editor, MD import, VoiceTag mark      | ✅ Complete |
| 2     | SegmentBreak node, BubbleMenu, CastPanel     | ✅ Complete |
| 3     | MiniMax/OpenAI/Browser TTS providers         | ✅ Complete |
| 3     | Sentence splitting, stitching, disk output   | ✅ Complete |
| 3     | Playlist: group rows + sentence expansion    | ✅ Complete |
| 3     | Sync-on-open divergence detection            | ✅ Complete |
| 3     | Resizable playlist pane                      | ✅ Complete |
| 4     | Audio player (play/pause/stop, scrub)        | ✅ Complete |
| 4     | Playback sync: word/sentence highlighting    | ✅ Complete |
| 5     | Export: ZIP, JSON, HTML, CSV                 | ✅ Complete |
| 6     | PWA install prompt, final polish, lamejs     | ⬜ Pending  |

---

## Phase 5 — Export (Completed)

**Status: ✅ Fully Implemented and Tested**

### Delivered Features
- Full Export ZIP containing:
  - One MP3 per ready paragraph group with clean filenames (`02_narrator_a4f2b91c.mp3`)
  - `playlist.json` manifest (title, timeline, sentences, wordTimings preserved)
  - `script.html` annotated script with embedded audio players (relative paths)
  - `timings.csv` with per-sentence start/end/duration
- Standalone exports for `playlist.json`, `script.html`, and `timings.csv`
- Progress feedback during ZIP generation
- Safe filename sanitization
- Only exports groups with `stitchStatus === 'ready'`
- Clean error handling and empty-state in ExportModal
- JSZip integration for reliable cross-browser ZIP creation

### Files Finalized This Phase
- `src/export/exporter.js` — core export engine
- `src/modals/ExportModal.vue` — UI + wiring
- Integration fixes in `EditorView.vue` and `PlaylistPane.vue`

### Testing Notes
- ZIP downloads correctly with all files
- `script.html` opens with functional audio players
- No console errors
- Progress bar works (fast on small projects — expected)

---

### New Critical Bug Fixes Added

### 11. ExportModal — `fmt` helper must be defined in `<script setup>`
```js
// ExportModal.vue
import { formatDuration } from '@/audio/timestamps.js'
const fmt = (ms) => formatDuration(ms)


### Export formats
All four formats read from `gen.groups` + `store.project` — no new IDB schema needed.

**ZIP** (`jszip` or native CompressionStream)
- One MP3 per group, named `{order:02}_{roleLabel}_{groupId}.mp3`
- `playlist.json` manifest (see JSON below)
- `script.html` annotated doc (see HTML below)
- Trigger: browser `<a download>` with Object URL

**JSON manifest** (`playlist.json`)
```json
{
  "title": "project title",
  "exportedAt": "ISO timestamp",
  "totalDurationMs": 12345,
  "groups": [
    {
      "order": 1, "roleLabel": "Narrator", "color": "#...",
      "file": "01_narrator_xxxx.mp3",
      "totalDurationMs": 3400,
      "startMs": 0, "endMs": 3400,
      "sentences": [
        { "index": 0, "text": "...", "startMs": 0, "endMs": 1200,
          "wordTimings": [...] }
      ]
    }
  ]
}
```

**HTML** (`script.html`)
- Full project title + export date in `<head>`
- Each paragraph group: role badge + full sentence text, colour-coded
- Audio player `<audio src="./01_narrator_xxxx.mp3">` per group
- Self-contained (no external deps)

**CSV** (`timings.csv`)
- Columns: `group_order, role, sentence_index, text, start_ms, end_ms, duration_ms`
- One row per sentence

### Implementation notes
- JSZip is the easiest cross-browser approach; `StreamSaver.js` for large exports
- Check if JSZip is already in `package.json` before adding
- Export button in PlaylistPane toolbar is already wired: `@export="onExport"` → `EditorView.onExport()`
- Replace the `toastRef.value?.show('Export coming in Phase 5', 'info')` stub in EditorView

---

## Open Questions
| Q | Question | Decision |
|---|---|---|
| Q6 | Audio stitching | ✅ Client-side blob concat |
| Q9 | Folder prompt timing | ✅ First generate + per-project settings |
| Q10 | IDB/disk divergence | ✅ Re-sync on open with modal |
| — | lamejs for re-encoding | Deferred to Phase 6 |
| — | Cloudflare Worker proxy for MiniMax | Deferred to Phase 6 |
| — | ZIP library choice (JSZip vs native) | Decide Phase 5 |

---

## How to Start a New Session
1. Attach or paste this `SNAPSHOT.md`
2. Say what you want to work on
3. Reference the relevant section above
4. Claude reads this file first, then proceeds without needing chat history

## How to End a Session
Ask Claude: "Update SNAPSHOT.md for this session" — Claude generates the updated file.
