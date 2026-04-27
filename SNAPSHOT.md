# Storyfi — Implementation Snapshot
> Read this file at the start of every session before touching any code.
> Update this file at the end of every session.
> Last updated: 2026-04-26 (session 9)
> Current phase: v2.0 — Playback sync, sentence selection, follow mode, deploy pipeline

---

## What Storyfi Is
A professional, browser-native multi-voice audio production studio. Transforms Markdown scripts into polished audio using high-end TTS engines (MiniMax, ElevenLabs, OpenAI). Features a "Cinema Noir" editorial interface with real-time word-level synchronisation, per-character performance controls, and a draggable multi-pane workspace. Built with Vue 3 + Tiptap + Pinia + IndexedDB.

---

## Tech Stack
| Layer | Choice |
|---|---|
| Framework | Vue 3, Composition API, `<script setup>` |
| Build | Vite 6 |
| Editor | Tiptap v2 via `@tiptap/vue-3` |
| State | Pinia (project.js + generation.js + playback.js) |
| Storage | IndexedDB via `idb` library |
| File output | File System Access API (per-project folder) |
| PWA | vite-plugin-pwa + Workbox |
| Audio engine | lamejs (gapless 128kbps CBR MP3) |
| Playback | Web Audio API (`AudioContext` + `AudioBufferSourceNode`) |
| Drag & drop | vuedraggable@next (SortableJS wrapper) |
| Hosting | Cloudflare Pages |
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
    │   ├── LibraryView.vue            — project grid + New Project card; no import/new buttons in header
    │   └── EditorView.vue             — dockable workspace shell: toolbar, columns, status bar
    ├── panels/
    │   ├── CastPanel.vue              — voice role CRUD, per-role provider/voice/performance/model settings (no header — in DockablePanel)
    │   └── PlaylistPane.vue           — group rows, sentence sub-rows, Generate/Export toolbar, AudioPlayerBar
    ├── editor/
    │   ├── StoryEditor.vue            — Tiptap editor, BubbleMenu tagging, MD import, highlight decorations (no toolbar — in DockablePanel bar-right)
    │   ├── splitter.js                — sentence extraction, char-limit splitting, extractTaggedSpans()
    │   └── extensions/
    │       ├── VoiceTag.js            — custom Mark: highlights tagged text with role colour
    │       └── SegmentBreak.js        — custom Node: manual segment break marker (§)
    ├── store/
    │   ├── db.js                      — IndexedDB schema (v2: +voice_previews), saveProject strips Vue Proxy
    │   ├── project.js                 — Pinia: active project, cast mutations, defaultVoiceAssignment(), reorderCast()
    │   ├── generation.js              — Pinia: build groups, sentence queue, stitch, disk write
    │   └── playback.js                — Pinia: transport state, RAF loop, highlight sync
    ├── tts/
    │   ├── provider.js                — registry, voice cache, withConcurrency(), withRetry()
    │   ├── minimax.js                 — MiniMax T2A v2, per-role model, hex decode, GroupId as query param
    │   ├── openai.js                  — OpenAI TTS, binary MP3, no word timings
    │   └── browser.js                 — SpeechSynthesis, preview only, no MP3 export
    ├── audio/
    │   ├── timestamps.js              — getBlobDurationMs() 3-tier, computeSentenceTimings(), formatDuration()
    │   └── stitcher.js                — lamejs gapless MP3 encode
    ├── storage/
    │   ├── crypto.js                  — Web Crypto API: PBKDF2+AES-GCM key encryption
    │   ├── filesystem.js              — File System Access API: pickFolder, write, read, exists
    │   ├── quota.js                   — StorageManager: getQuotaInfo(), requestPersistentStorage()
    │   └── synccheck.js               — disk vs IDB divergence detection on project open
    ├── modals/
    │   ├── SettingsModal.vue          — API key entry per provider, active provider selector
    │   ├── FolderPromptModal.vue      — first-generation output folder prompt, per-project
    │   ├── SyncWarningModal.vue       — repair options: re-write / re-import / mark for regen
    │   └── ExportModal.vue            — ZIP/JSON/HTML/CSV export with live progress bar
    ├── components/
    │   ├── StorageBar.vue             — quota bar; compact prop for status bar inline mode
    │   ├── Toast.vue                  — global toast stack
    │   ├── ConfirmModal.vue           — reusable confirm dialog
    │   ├── AudioPlayerBar.vue         — player transport: play/pause, stop, progress scrub, time display
    │   └── DockablePanel.vue          — panel wrapper: title bar, ⠿ drag handle, bar-right slot, drop zones
    ├── export/
    │   └── exporter.js                — exportZip / exportJSON / exportHTML / exportCSV
    ├── composables/
    │   ├── useOnlineStatus.js         — shared reactive online/offline state (navigator.onLine + events)
    │   ├── usePanelLayout.js          — panel layout state, mutations, localStorage persistence
    │   └── usePanelDrag.js            — ghost element, drag state, drop zone detection (non-reactive DOM)
    └── utils/
        ├── uuid.js                    — crypto.randomUUID()
        ├── debounce.js                — debounce(fn, ms)
        └── colors.js                 — ROLE_COLORS[], nextRoleColor(), hexAlpha()
```

---

## IndexedDB Schema (storyfi_db v2)
```
projects        keyPath: "id"          — Project record incl. paragraphGroups[].sentences[]
sentences       keyPath: "id"          — Sentence records, index: paragraphGroupId
audio_sentences keyPath: "sentenceId"  — Raw sentence MP3 Blobs
audio_stitched  keyPath: "groupId"     — Stitched paragraph MP3 Blobs
api_keys        keyPath: "providerId"  — Encrypted API key records
settings        keyPath: "key"         — appPreferences, activeProvider
voice_previews  keyPath: "key"         — Cached preview MP3 Blobs, key: "{providerId}_{voiceId}"
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
  outputFolderName,
  outputFolderPromptDismissed,
  persistenceGranted
}

VoiceRole {
  id: string,                         // uuid() — never index-based (Bug Fix #11)
  label: string,
  color: string,
  voiceAssignment: VoiceAssignment    // never null (Bug Fix #12)
}

VoiceAssignment {
  providerId: string,                 // 'minimax' | 'openai' | 'elevenlabs' | 'browser'
  voiceId:    string | null,
  voiceName:  string | null,
  settings: {
    speed:   number,                  // 0.5 – 2.0
    pitch:   number,                  // -12 – 12 (not sent to OpenAI)
    volume:  number,                  // 0.0 – 2.0 (default 1.0)
    emotion: string,                  // '' | 'neutral' | 'happy' | 'sad' | 'angry'
    model:   string,                  // MiniMax model string (see models below)
  }
}

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
  editorFrom, editorTo,
  wordTimings: WordTiming[] | null,   // { word, start_ms, end_ms } from MiniMax
  splitWarning
}
```

---

## MiniMax Models (all 8 current)
```
speech-2.8-hd     — Premium  (latest, best quality)
speech-2.8-turbo  — Standard (latest turbo)
speech-2.6-hd     — Premium  ← default for new roles
speech-2.6-turbo  — Standard
speech-02-hd      — Standard (legacy)
speech-02-turbo   — Budget   (legacy)
speech-01-hd      — Budget   (legacy)
speech-01-turbo   — Budget   (cheapest)
```

Default for new roles: `speech-2.6-hd`

Emotion payload rule — omit field entirely when empty string:
```javascript
...(settings?.emotion ? { emotion: settings.emotion } : {}),
```

---

## Critical Bug Fixes — DO NOT REVERT

### 1. saveProject() — strips Vue Proxy before IDB write
```javascript
const { outputFolderHandle, ...serializable } = project
const plain = JSON.parse(JSON.stringify(serializable))
await db.put('projects', { ...plain, outputFolderHandle, updatedAt: Date.now() })
```

### 2. MiniMax audio is HEX encoded, not base64
```javascript
const isHex = /^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length % 2 === 0
return isHex ? hexToBlob(trimmed) : base64ToBlob(trimmed)
```

### 3. MiniMax GroupId — query param not header (CORS)
```javascript
const url = groupId
  ? `https://api.minimax.io/v1/t2a_v2?GroupId=${groupId}`
  : `https://api.minimax.io/v1/t2a_v2`
```

### 4. Resizable pane — pure DOM, no Vue reactive state during drag
Direct DOM style mutation during mousemove. No `ref()` update → no Vue re-render → no `__vnode null` crash.

### 5. getBlobDurationMs() — 3-tier with timeouts
Tier 1: HTML `<audio>`. Tier 2: `AudioContext` with 5s `Promise.race`. Tier 3: size estimate.

### 6. generation.js — all imports static, none dynamic
No `await import()` inside async loops. Dynamic imports in concurrent tasks cause silent hangs.

### 7. Playlist pane layout — flexbox not CSS grid
`display: flex; flex-direction: row` on shell. CSS grid with reactive `gridTemplateColumns` is unreliable with Vue scoped styles.

### 8. Web Audio objects — never in Pinia reactive state
`AudioContext`, `AudioBufferSourceNode`, `AudioBuffer[]` in module-level `let` vars in `playback.js`. Vue Proxy-wrapping breaks `suspended` state and `onended` callbacks.

### 9. Playback highlight decorations — transient, never saved
Driven by `editor.view.dispatch(tr.setMeta(...))`. Never written to Tiptap JSON doc. Never triggers auto-save debounce.

### 10. decodeAudioData — 10s timeout
```javascript
const audioBuf = await Promise.race([
  _audioCtx.decodeAudioData(arrayBuf),
  new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 10_000)),
])
```

### 11. Role IDs use uuid(), never array index
```javascript
// store/project.js — addRole()
const id = uuid()  // was: `actor_${idx}` — caused double-delete after add+delete cycle
```
`actor_${cast.length}` reuses IDs after deletion. Example: delete Actor 1 (len→2), add new role → gets id `actor_2`, colliding with existing Actor 2. `deleteRole` filters by id, removing both. uuid() is collision-proof.

### 12. voiceAssignment is never null
`addRole()` and `createBlankProject()` always call `defaultVoiceAssignment()`. CastPanel has `watch(roles, normalizeRoles, { immediate: true })` that patches roles loaded from older saves (backfills null voiceAssignment and any missing settings keys including `model`).

```javascript
// store/project.js
function defaultVoiceAssignment() {
  return {
    providerId: 'minimax', voiceId: null, voiceName: null,
    settings: { speed: 1.0, pitch: 0, volume: 1.0, emotion: '', model: 'speech-2.6-hd' },
  }
}
```

### 13. unsetVoiceTag — must extendMarkRange first
Without a text selection (cursor-only mode), `unsetVoiceTag()` alone only operates at the cursor point and leaves the mark visible. Always extend to the full mark range first:
```javascript
editor.chain().focus().extendMarkRange('voiceTag').unsetVoiceTag().run()
```
`extendMarkRange('voiceTag')` walks outward from the cursor to the mark boundaries before unsetting. Works correctly for both cursor-only and text-selection modes.

---

## CastPanel — Drag to Reorder
Cast roles are reorderable via drag-and-drop using `vuedraggable@next`.

- `⠿` drag handle on each card — invisible at rest, fades in on card hover
- `ghost-class="role-card--ghost"` — faint dashed purple tint at drop target
- `animation: 180` — smooth SortableJS slide animation
- `reorderableCast` writable computed: getter returns `store.cast`, setter calls `store.reorderCast(newOrder)`
- `store.reorderCast(newOrder)` replaces `project.value.cast` and calls `markDirty()`
- Cast order is cosmetic only — generation order is driven by document position, not cast order

---

## CastPanel — Performance Settings (⚙️ gear icon)

| Field | Shown when | Notes |
|---|---|---|
| Speed | Always | Range 0.5–2.0 |
| Volume | Always | Range 0.0–2.0, default 1.0 |
| Pitch | Not OpenAI | Range -12–12 |
| Model | MiniMax only | All 8 models, grouped by generation with cost badge |
| Emotion | MiniMax only | Includes "— None —" (`value=""`) to omit from API payload |

Model cost badge colours: purple = Premium, muted = Standard, green = Budget.
`MODEL_TIERS` map in CastPanel drives badge label + colour class.
`normalizeRoles` watcher backfills `model` (and all keys) for old saves.

---

## BubbleMenu — Two Modes (StoryEditor.vue)

`shouldShowBubble` triggers on text selection **or** cursor inside a voiceTag mark.

**Selection mode** (`hasSelection = true`):
- "Tag as:" label + all role chips
- "✕ Remove" if selection is already tagged
- "§" segment break button

**Cursor-in-tag mode** (`hasSelection = false`, cursor inside mark):
- "Tagged span:" label
- "✕ Remove" only — role chips and § hidden

`hasSelection` computed reads `editor.state.selection.{from, to}` directly.
Remove always uses `extendMarkRange('voiceTag')` before `unsetVoiceTag()` (Bug Fix #13).

---

## LibraryView — Current UX
- Header contains brand + Install App pill only — no action buttons
- Project grid uses `repeat(auto-fill, minmax(300px, 1fr))`
- "New Project" card is always the last grid cell — dashed border, "+" icon, accent on hover
- Empty state: grid renders with just the New card (no separate branch)
- MD import lives in the Editor toolbar only (StoryEditor.vue) — removed from Library entirely

---

## Voice Preview System (CastPanel)

Preview buttons appear in two places:
- **Role card** — small ▶ next to the assigned voice chip. Only shown when a voice is assigned.
- **Voice picker modal** — ▶ on each voice row, fades in on hover.

Three button states: ▶ idle, spinner (generating), ■ playing. Clicking ■ stops. While one voice loads, all other buttons are disabled.

**Cache:** `voice_previews` IDB store (schema v2). Key: `{providerId}_{voiceId}`.
Preview text: `"Hello. How does this sound to you?"` — always uses default settings so the cache key stays stable.
Cost: ~24KB per voice. 130 MiniMax voices ≈ 3MB if all previewed.

**Cached indicator:** Cached = accent purple at 65% opacity (always visible). Uncached = muted gray (fades in on hover). Tooltip: "Play preview (cached)" vs "Generate preview".

`cachedPreviewIds` — `Set<voiceId>` loaded on picker open via `getAllVoicePreviewKeys()`, filtered by provider prefix. Updated live on new generation.

`_previewAudio` — module-level `Audio` element, not reactive. Cleaned up on picker close.

New db.js exports: `getVoicePreview`, `saveVoicePreview`, `deleteVoicePreview`, `getAllVoicePreviewKeys`.

---

## Voice Picker — Language & Gender Filters

Two filter rows sit between the search input and the voice list.

**Language pills** — derived from `availableLanguages` computed (English first, rest alpha). Only shown when more than one language is present. Clicking active pill returns to All.

**Gender pills** — always shown: Both / ♂ Male / ♀ Female.

All three filters (language + gender + search text) combine with AND logic.
Both filters reset when the picker opens.

**Language badges on each row:**
- `EN` badge — very faint (opacity 0.45)
- Non-English badge — `--color-highlight` purple (opacity 0.75), visually distinct
- Gender badge — faint, same style as EN

18 language codes: `en fr es de it ru ja ko zh yue pt ar hi id nl pl tr uk`
`LANG_LABELS` map provides short code (badge/pill) + full name (tooltip).

---

## Online / Offline Status

`src/composables/useOnlineStatus.js` — module-level shared `ref(navigator.onLine)`. Window events registered once on first consumer mount, removed on last unmount.

**Status bar** (bottom of workspace — v1.2 moved from sidebar):
```
[████░ 3.1MB / 10GB  Manage]   ·   ● Saved   ● Online
```
Saved dot and online dot sit in the status bar flex row alongside the compact StorageBar.

**On connection change:**
- Drop → warning toast 5s: "You're offline — audio generation unavailable"
- Return → success toast 2.5s: "Back online"

**Disabled when offline:** ▶ Generate button, 🔄 per-group regenerate buttons.
**Always works offline:** editor, tagging, cached audio playback, export, settings.
Voice preview generation fails gracefully offline; cached previews still play.

---

## Dockable Panel System (v1.2)

### Architecture
Three draggable panels — **Cast**, **Playlist**, **Editor** — arranged in dynamic columns.
Fixed **Toolbar** at top, fixed **Status Bar** at bottom. Both immovable.

### New files
| File | Role |
|---|---|
| `src/composables/usePanelLayout.js` | Layout state (columns + widths), localStorage persistence, mutations |
| `src/composables/usePanelDrag.js` | Ghost element (raw DOM), drag events, drop zone detection |
| `src/components/DockablePanel.vue` | Panel wrapper: title bar, ⠿ handle, `#bar-right` slot, horizontal drop zones |

### Layout model (`usePanelLayout`)
```javascript
// localStorage key: 'storyfi_panel_layout_v1'
{
  columns: [
    { id: string, panels: ('cast'|'playlist'|'editor')[] },
    ...
  ],
  columnWidths: { [colId]: number }  // undefined = flex:1
}
```
Default: `[{ id:'col-left', panels:['cast','playlist'] }, { id:'col-right', panels:['editor'] }]`

Mutations: `movePanel(panelId, targetColId, index)`, `insertInNewColumn(panelId, refColId, side)`, `setColumnWidth(colId, px)`, `resetLayout()`
Empty columns auto-removed after every mutation. Layout validated on load (all 3 panels must be present).

### Drag system (`usePanelDrag`) — Bug Fix #4 pattern
All mouse state is non-reactive module-level vars. Only `draggingPanelId` and `activeDropZone` are reactive refs (consumed by templates for highlight classes).

Ghost element: raw `document.createElement` div, CSS-variable styled, `position:fixed`, `pointerEvents:none`, follows cursor via `style.left/top` on every `mousemove`.

Drop zone detection: `querySelectorAll('[data-drop-zone]')` on every `mousemove`, checks `getBoundingClientRect()` against cursor position. No `mouseenter`/`mouseleave` — position-based is more reliable.

Drop zone types:
- `{ type: 'in-col', colId, index }` — insert in column at index (horizontal lines between panels)
- `{ type: 'new-col', refColId, side: 'left'|'right' }` — create new column (vertical lines at column edges)

### DockablePanel
- `⠿` drag handle in title bar — opacity 0 at rest, 0.75 on card hover
- `#bar-right` slot for per-panel toolbar items
- Horizontal drop zones (6px, `dz--h`) appear above/below panel during drag
- Panel dims to `opacity: 0.35` while being dragged
- `startDrag(panelId, event, onDrop)` called on handle `mousedown`

### EditorView workspace shell
**Global toolbar** (fixed top, 40px):
```
← Library  |  [Project Title]                    ⊞ Reset Layout  |  ⚙ Settings
```

**Editor panel bar-right slot:**
```
⠿ Editor    ↑ Import  |  B  I  |  §  [N chars]
```

**Playlist panel toolbar** (inside panel, not in DockablePanel bar):
```
▶ Generate   ↓ Export
```

**Status bar** (fixed bottom, 30px):
```
[████░ 3.1MB / 10GB  Manage]   ●  ● Saved   ● Online
```
StorageBar uses `compact` prop for inline horizontal layout.

**Column resize — `_activeResize` reactive ref approach:**

All resize state is non-reactive module-level vars. `_activeResize = ref(null)` is the single reactive driver — `colStyle` reads it to return live drag widths. No direct DOM style manipulation.

```javascript
// Non-reactive vars (Bug Fix #4 pattern)
let _colResizing   = false
let _colResizeId   = null
let _colLeftEdge   = 0      // active column's getBoundingClientRect().left
let _colLastW      = 0      // updated every onMove, used on mouseup (not offsetWidth)
let _leftSnapshots = {}     // { colId: renderedWidth } for all columns LEFT of handle

const _activeResize = ref(null) // { colId, width } — drives colStyle during drag
```

**`colStyle(colId)` logic:**
1. If `_activeResize.value.colId === colId` → fixed at drag width
2. If `_activeResize` is set AND this column is LEFT of active → use `_leftSnapshots[colId]` (snapshot from drag-start), fallback to `columnWidths`, then flex
3. If `_activeResize` is set AND this column is RIGHT of active → `flexGrow:1` (absorbs change)
4. No active resize → use `columnWidths` if saved, else `flexGrow:1`

**Width formula:** `width = clientX - column.getBoundingClientRect().left` — avoids all `offsetWidth` timing issues. Column left edge captured once at `mousedown`, never changes during drag.

**Max width:** `container.offsetWidth - 180 - 5` (container minus min other-col width minus handle). Hardcoded `700` was too small for wide screens and caused the "jump to left" bug.

**`onUp` persistence:**
```javascript
// Spread snapshots first (pins left-side columns even if they had no saved width)
const newWidths = { ...layout.value.columnWidths, ..._leftSnapshots }
// Clear widths for columns to the RIGHT (they remain flexible)
layout.value.columns.forEach((col, idx) => {
  if (idx > resizedIdx) delete newWidths[col.id]
})
newWidths[_colResizeId] = _colLastW
layout.value = { ...layout.value, columnWidths: newWidths }
```

**editorRef binding:** uses named function `setEditorRef(el)` instead of inline arrow in `v-for` (Bug Fix #14).

### Bug Fix #14 — named ref callback in v-for (not inline arrow)
```javascript
// WRONG — inline arrow in v-for gets stale closure on teardown:
// :ref="el => { editorRef.value = el || null }"

// CORRECT — named function, stable reference:
function setEditorRef(el) {
  if (editorRef) editorRef.value = el ?? null
}
// In template: :ref="setEditorRef"
```
Vue calls ref callbacks with `null` on component unmount. Inline arrows inside `v-for` have a closure-capture timing bug where the reactive scope is partially destroyed before the cleanup call fires. Named functions avoid this.

### Bug Fix #15 — Column resize: width = mouseX − leftEdge, not offsetWidth
`offsetWidth` on a `flex-basis: 0px` column can return 0 or incorrect values before layout settles. Computing `width = clientX - col.getBoundingClientRect().left` is always correct — the column's left edge never moves during a drag.

### Bug Fix #16 — Column resize: hardcoded 700px max caused jump-to-left
`Math.min(700, ...)` clamped columns wider than 700px (editor with `flexGrow:1` was ~750px) to 700px on first `mousemove`. Max is now `container.offsetWidth - 180 - 5`.

### Bug Fix #17 — Column resize: _activeResize ref, not direct DOM manipulation
Setting `el.style.flexBasis` directly during drag was overwritten by Vue re-renders triggered by `activeDropZone` changes. `_activeResize = ref(null)` drives `colStyle` so Vue applies the drag width as the authoritative value.

### Bug Fix #18 — Column resize: left-side column snapshots
When dragging a right handle in a 3-column layout where left-side columns have no saved `columnWidths` entry (e.g., newly created via drag), those columns were `flexGrow:1` during the drag and expanded alongside the right column. Fix: capture `getBoundingClientRect().width` for all left-side columns at `mousedown` into `_leftSnapshots`, use them in `colStyle` to pin those columns, persist them to `columnWidths` on `mouseup`.

### Bug Fix #19 — AudioPlayerBar play button disabled after generation
`playback.hasAudio` is only true after `loadAndPlay()` decodes buffers. Button was disabled even when generated audio existed in IDB. Fixed with `hasReadyAudio = playback.hasAudio || props.groups.some(g => g.stitchStatus === 'ready')`.

### Bug Fix #20 — waveformData getter always returned null
Pinia getters only recompute when their `state` dependencies change. `() => _waveformData` had no state dependency so was never recomputed. Fix: `(state) => state.waveformVersion > 0 ? _waveformData : null` — getter now depends on `waveformVersion` and recomputes when it increments.

### Bug Fix #21 — New tag above existing groups missing from playlist
`gen.buildGroupsFromDoc()` was only called at Generate time. Tags added above existing generated groups never updated `gen.groups` order. Fix: `watch(taggedSpans, ...)` in EditorView calls `gen.buildGroupsFromDoc(doc, charLimit)` on every tagging change, guarded by `gen.groups.length > 0`. `buildGroupsFromDoc` preserves `stitchStatus === 'ready'` groups and only reorders/adds pending ones.

---
```
--color-bg         #0e0c18      --font-display  'Playfair Display'
--color-surface    #1a1625      --font-ui       'DM Sans'
--color-border     #2e2a42      --font-mono     'JetBrains Mono'
--color-accent     #7c5cbf
--color-highlight  #c084fc
--color-text       #f0eeff
--color-text-muted #8b85a8
--color-success    #4ade80
--color-warning    #facc15
--color-error      #f87171
```

---

## Waveform Visualisation (AudioPlayerBar)

Waveform canvas replaces the thin `player-track` progress div entirely. 52px tall, full panel width, scrubable.

**`playback.js` additions:**
- `_waveformData` — module-level `Float32Array | null` (non-reactive — never Proxy-wrap typed arrays)
- `WAVEFORM_BARS = 200` — downsample target
- `buildWaveformData(buffers, bars)` — pure function: merges channels (averaged), RMS-downsamples to `bars` values, normalises 0→1. Called after all buffers decoded in `loadAndPlay`.
- `waveformVersion: 0` — reactive state, incremented on each rebuild, drives getter reactivity
- `waveformData` getter — `(state) => state.waveformVersion > 0 ? _waveformData : null`
  - **Must depend on `state.waveformVersion`** — a plain `() => _waveformData` getter has no reactive dependency and always returns null (Bug Fix #20).
- `_waveformData = null` reset in `_cleanup()`

**`AudioPlayerBar.vue`:**
- `<canvas ref="canvasEl">` — DPR-aware, redraws via `watch(() => [playback.progress, playback.waveformVersion], drawWaveform)`
- `ResizeObserver` on parent redraws on panel resize
- Colours: purple played (`#7c5cbf`), muted unplayed (`rgba(255,255,255,0.12)`), light-purple playhead (`#a78bfa`)
- Placeholder: 40 sine-wave-height bars at 50% opacity before waveform decoded (`v-if="!playback.waveformData"`)
- Scrub: `mousedown`/`touchstart` on canvas → `seekToMs()` or repositions `currentMs` if stopped
- Controls row: `[time] [Stop] [Play] [time]` — single row, no separate progress row

---

## Phase / Feature Status
| Area | Feature | Status |
|---|---|---|
| Core | PWA shell, Library, IndexedDB | ✅ |
| Core | Tiptap editor, VoiceTag, SegmentBreak | ✅ |
| Core | MiniMax/OpenAI/ElevenLabs/Browser TTS | ✅ |
| Core | Sentence splitting, lamejs stitching, disk output | ✅ |
| Core | Playlist + sync-on-open divergence repair | ✅ |
| Core | Resizable dual-pane workspace | ✅ |
| Phase 4 | Web Audio playback, seek, scrub | ✅ |
| Phase 4 | Word highlight (MiniMax/ElevenLabs) | ✅ |
| Phase 4 | Sentence highlight fallback (OpenAI) | ✅ |
| Phase 5 | ZIP / JSON / HTML / CSV export | ✅ |
| Phase 6 | Cloudflare Pages deployment | ✅ |
| Polish | CastPanel — all CSS tokens, no hardcoded hex | ✅ |
| Polish | Per-role MiniMax model selector (all 8 models) | ✅ |
| Polish | Emotion "None" option to unset | ✅ |
| Polish | Volume slider (0–2.0) in advanced settings | ✅ |
| Polish | Library New Project card, header cleanup | ✅ |
| Polish | Cast drag-to-reorder (vuedraggable@next) | ✅ |
| Polish | BubbleMenu cursor-in-tag mode (Remove only) | ✅ |
| Polish | Voice preview with IDB cache (db v2) | ✅ |
| Polish | Cached preview visual indicator (purple = cached) | ✅ |
| Polish | Voice picker language + gender filter pills | ✅ |
| Polish | Language & gender badges on voice rows | ✅ |
| Polish | Online/offline status dot + toast + disabled states | ✅ |
| v1.2 | Dockable panel system (drag, ghost, drop zones, columns) | ✅ |
| v1.2 | Panel layout localStorage persistence | ✅ |
| v1.2 | Column resize handles — full directional snapshot system | ✅ |
| v1.2 | Global toolbar (nav + title + app controls) | ✅ |
| v1.2 | Editor toolbar in DockablePanel bar-right slot | ✅ |
| v1.2 | Status bar (StorageBar compact + Saved + Online) | ✅ |
| Bug #11 | Role ID collision (uuid vs index) | ✅ |
| Bug #12 | voiceAssignment null crash on add/delete | ✅ |
| Bug #13 | unsetVoiceTag needs extendMarkRange first | ✅ |
| Bug #14 | Named ref callback in v-for (not inline arrow) | ✅ |
| Bug #15 | Column resize width = mouseX − leftEdge (not offsetWidth) | ✅ |
| Bug #16 | Column resize 700px max too small (now dynamic) | ✅ |
| Bug #17 | Column resize via _activeResize ref (not direct DOM) | ✅ |
| Bug #18 | Left-column snapshots for unsaved-width columns | ✅ |
| Bug #19 | AudioPlayerBar disabled after generation (hasReadyAudio) | ✅ |
| Bug #20 | waveformData getter not reactive (must depend on waveformVersion) | ✅ |
| Bug #21 | New tag above existing groups missing from playlist until Generate | ✅ |
| v1.2 | Waveform visualisation in AudioPlayerBar | ✅ |
| v1.3 | Mobile panel toolbar CSS (m-panel-toolbar, m-tool-btn, etc.) | ✅ |
| v1.3 | Offline globe 🌐 replaces floating status dots | ✅ |
| v1.3 | Swipe-between-panels removed — bottom tab nav only | ✅ |
| v1.3 | Edge swipe prevention (CSS overscroll-behavior-x + JS edge guard) | ✅ |
| v1.3 | BubbleMenu overflow dropdown (first 3 chips + +N ▾) | ✅ |
| v1.3 | Mobile editor toolbar hijack on text selection | ✅ |
| v1.3 | Edit/Tag mode toggle pill — Tag mode default, keyboard suppressed | ✅ |
| v1.3 | Auto-scroll editor to playback highlight (scrollIntoView) | ✅ |
| v1.3 | Play → force Tag mode; Edit mode locked during playback | ✅ |
| v1.3 | SettingsModal tabs = active provider selector (dropdown removed) | ✅ |
| Bug #22 | swipeDelta referenced in setActivePanel after swipe removal | ✅ |
| Bug #23 | Mobile toolbar CSS classes defined in template but never styled | ✅ |
| Bug #24 | Edge touch guard blocked ← back button (exempts interactive elements) | ✅ |
| Bug #25 | iOS keyboard not shown switching to Edit mode (sync focusEditor in gesture) | ✅ |
| Bug #26 | tagMode watcher fires before editor DOM exists (split into two watchers) | ✅ |
| Bug #27 | _moveCount not defined — dead variable in column resize onMove | ✅ |
| Bug #28 | BubbleMenu overflow CSS parse error (.bubble-divider selector eaten) | ✅ |
| v1.4 | Edit mode as default on mobile (was Tag mode) | ✅ |
| v1.4 | Auto-tag: create missing cast members from unmatched [LABEL]s | ✅ |
| v1.4 | Auto-tag: empty cast raw-scan path (buildAutoTagOperations bails on empty roles) | ✅ |
| v1.4 | Auto-tag: section-ownership model — pendingRole carries across paragraphs | ✅ |
| v1.4 | Auto-tag: italic text (stage directions) skipped, pendingRole carries through | ✅ |
| v1.4 | Auto-tag button always visible in CastPanel (removed v-if="roles.length > 0") | ✅ |
| v1.4 | Auto-tag toast: "in script" vs "in selection" context-aware message | ✅ |
| v1.4 | Mobile toolbar: ✕ Remove tag pinned before role chips | ✅ |
| v1.4 | Mobile toolbar: active role chip highlighted when cursor inside tagged text | ✅ |
| v1.4 | Playlist: segment count in toolbar header | ✅ |
| v1.4 | splitter.js: merge same-role spans across paragraph boundaries (+space) | ✅ |
| Bug #29 | Auto-tag empty cast: buildAutoTagOperations early-return on roles.length=0 | ✅ |
| Bug #30 | Desktop/mobile segment count mismatch — paragraph boundary gap of 2 in extractTaggedSpans | ✅ |
| v1.5 | Playlist subentry click → highlight + scroll + cursor in editor (desktop + mobile) | ✅ |
| v1.5 | Mobile: subentry tap switches to Editor panel then highlights after transition (320ms) | ✅ |
| v1.5 | StoryEditor: expose placeCursor(pos) for programmatic cursor placement | ✅ |
| v1.5 | PlaylistPane: sentence rows clickable, emit focus-sentence { from, to } | ✅ |
| v1.6 | Playlist subentry wrong scroll — editorFrom offset by paragraph boundary gaps | ✅ |
| v1.6 | Segment structure: paragraph = segment, no char-limit auto-splitting | ✅ |
| v1.6 | Playlist: consecutive same-role paragraphs grouped under one header | ✅ |
| v1.6 | Tiptap table extensions added (pinned @2.27.2) | ✅ |
| v1.6 | Auto-tagger + label scan skip table cells (return false on table node) | ✅ |
| Bug #31 | Playlist subentry jumps wrong — char offset vs ProseMirror position | ✅ |
| Bug #32 | Segments split mid-paragraph by char limit — removed auto-splitting | ✅ |
| Bug #33 | One group per paragraph causing redundant header+subentry display | ✅ |
| v2.0 | Playlist: sentence-level checkboxes + Re-Generate/Delete selected sentences | ✅ |
| v2.0 | Follow mode toggle (amber) in player bar — auto-expand + scroll + highlight active sentence | ✅ |
| v2.0 | Browser TTS highlight sync: currentSentenceId set directly in speakNext | ✅ |
| v2.0 | seekToMs boundary fix (ms < o.endMs) — sentence click no longer plays prev group | ✅ |
| v2.0 | Timing write-back to group.sentences[i] — highlight advances through multi-sentence groups | ✅ |
| v2.0 | Paused scrub: seekToMs stays paused, calls _syncHighlight | ✅ |
| v2.0 | Cold scrub: AudioPlayerBar loads from nearest group index | ✅ |
| v2.0 | ctx.setTransform instead of ctx.scale — playhead offset drift fixed | ✅ |
| v2.0 | Sentence click: seekToMs(group.startMs + s.startMs) instead of seekToGroup | ✅ |
| v2.0 | _startedAtCtx + _segmentOffsetMs anchored per-sentence in browser speakNext | ✅ |
| v2.0 | onAutoTag: async + await addRole + await nextTick (RECURRING BUG — must not be lost) | ✅ |
| v2.0 | generation.js: regenerateSentences + deleteSentences | ✅ |
| v2.0 | Deploy HTML: local storyfi-deploy.html, opens in browser, one-click deploy | ✅ |
| v2.0 | Deploy server: git pull --rebase before write+build+push — no more conflicts | ✅ |
| v2.0 | CORS: Access-Control-Allow-Origin * on deploy endpoint | ✅ |
| Backlog | Scene/Act/Chapter hierarchy | ⬜ |
| Backlog | Cloudflare Worker — TTS proxy + OAuth (MiniMax CORS fix) | ⬜ |
| Backlog | Google Drive integration (requires Worker) | ⬜ |
| Backlog | GitHub sync endpoint on Worker | ⬜ |
| Backlog | Auto-scroll teleprompter during playback | ⬜ |
| Backlog | SRT/VTT subtitle export | ⬜ |
| v1.3 | Mobile UI — swipe panels, bottom nav, safe area, PWA meta | ✅ |
| Backlog | Cloudflare Worker — OAuth proxy + MiniMax API proxy | ⬜ |
| Backlog | Google Drive integration (requires Worker for token exchange) | ⬜ |

---

## Backlog Notes

### Mobile UI
Swipe left/right to cycle panels (Editor → Cast → Playlist). Dot indicators + tappable.
Detected via `window.matchMedia('(max-width: 768px)')`. Desktop layout completely unaffected.
`showDirectoryPicker()` not supported on iOS (any browser) — falls back to ZIP export automatically via existing `hasFileSystemAccess()` guard. Build mobile before Google Drive — Drive is more valuable on mobile.

### Cloudflare Worker + Google Drive
One Worker solves two long-standing backlog items:
- `/api/minimax` — proxies TTS requests, hides API key from browser bundle
- `/api/oauth/google` — handles OAuth 2.0 token exchange, holds client secret server-side
- `/api/drive/upload` — accepts blob, writes to user's Google Drive

Pure client-side OAuth is insecure (client secret would be in JS bundle). Worker is required.
Google Drive is the natural "save files" answer on iOS where File System Access API is unavailable.
Build order: Mobile UI → Cloudflare Worker → Google Drive.

---
1. Attach or paste this `SNAPSHOT.md`
2. Say what you want to work on
3. Claude reads this file first, then proceeds without needing chat history

## How to End a Session
Ask Claude: "Update SNAPSHOT.md for this session" — Claude generates the updated file.

---

## Auto-Tag Feature (COMPLETED)

### Overview
Two entry points: ⚡ **Auto-tag from script** button in CastPanel (full doc), ⚡ **Auto-tag** in BubbleMenu (selection only). Both merge with existing tags (skips already-tagged spans) and report unmatched labels as a toast. `[LABEL]` text left untagged; only speech text after it gets voiceTag mark applied.

### Files
- `src/editor/autoTagger.js` — `buildAutoTagOperations(editor, roles, options?)` returns `{ operations, found, unmatched }`
- `src/panels/CastPanel.vue` — ⚡ button, `defineEmits(['auto-tag'])`
- `src/editor/StoryEditor.vue` — `applyAutoTagOps(operations, onComplete)` + `applyAutoTag(roles)` + `syncGroups(buildFn, charLimit)` in `defineExpose`
- `src/views/EditorView.vue` — `onAutoTag()`, `onDocUpdated()`, `applyAutoTagQueue()`

### Architecture — Key Rules
1. `buildAutoTagOperations` returns ops, never applies them directly
2. `applyAutoTagOps` runs the entire setTimeout queue inside StoryEditor's own closure
3. `capturedEditor = editor.value` captured at call start — stable across async re-renders
4. `onComplete(doc, json)` — BOTH live doc and JSON come from capturedEditor
5. `syncGroups(buildFn, charLimit)` — reads `editor.value.state.doc` inside StoryEditor's closure; never cross-component boundary

### Critical bugs resolved
- **Split-node labels:** `[NARRATOR]` with code mark is a separate node with no text after `]`. Fix: `pendingRole` in `buildAutoTagOperations` — if [LABEL] has no taggable text, hold the role and apply it to the NEXT sibling text node.
- **Dual StoryEditor instance:** StoryEditor mounts twice during project load. The `capturedEditor` fix ensures the correct (marks-applied) editor is used throughout the queue.
- **`getEditor()` spam:** `isBold`/`isItalic` computed properties called `getEditor()` on every update — 80+ calls during a queue. Replaced with `ref(false)`.
- **Vue proxy stripping marks:** docs passed through `emit()` lost voiceTag marks. All group rebuilds now use `syncGroups` or `applyAutoTagOps` which read the doc inside StoryEditor's closure.

---

## Mobile UI (COMPLETED)

### Architecture
`useMobileLayout.js` composable — detects `isMobile` (< 768px), manages `activePanel` ('editor'|'playlist'), `castOpen` drawer state, swipe gesture handling. Last panel persisted to `localStorage` key `storyfi_mobile_last_panel`.

### Layout — Portrait
- Fixed 48px top bar: `← | Title | ⚙`
- Full-screen swipeable panel track (`200vw` wide, `translateX(-N*100vw)`)
- Cast slide-in drawer (`position: fixed`, left edge)
- 56px bottom bar: `[🎭 Cast] [context actions] [✏️ Editor] [▶ Playlist]`
- Context actions: Editor → `↑ B I §` | Playlist → empty (buttons already in panel)

### Swipe
- Axis lock: vertical scroll wins if `|dy| > |dx|`
- 50px threshold to commit panel switch
- Rubber-band resistance (×0.35) at edge panels
- `translateX(calc(-N*100vw + Δpx))` — uses `vw` not `%` (% is relative to track width)

### Safe Area — Final Solution
- `html, body, #app { height: 100vh }` — fills viewport in standalone PWA
- `@media (display-mode: standalone)` gates all `env(safe-area-inset-*)` usage
- No safe-bottom filler div needed — iPhone 12 mini has no visible home indicator pill in PWA mode
- `viewport-fit=cover` in `index.html` required for env() to work in standalone
- Apple meta tags in `index.html`: `apple-mobile-web-app-capable`, `apple-touch-icon`, etc.

### Files Changed
- `src/composables/useMobileLayout.js` (new)
- `src/views/EditorView.vue` — mobile layout branch + safe area CSS
- `src/views/LibraryView.vue` — mobile grid fix, safe area, PWA install hint
- `src/App.vue` — `height: 100vh`, removed duplicate `beforeinstallprompt` handler
- `public/manifest.json` — removed `orientation: landscape-primary`
- `index.html` — `viewport-fit=cover`, Apple PWA meta tags

### Key Debug Finding
Tested via debug button: `standalone (media): true`, `env(safe-area-bottom): 29px`, `innerH - view: 0px`. Layout was always correct — the perceived gap was the home indicator zone. Removed the filler since iPhone 12 mini PWA has no visible pill.

---

## v1.3 Mobile Polish — Sessions 4 & 5 (2026-04-21)

### Files changed
| File | What changed |
|---|---|
| `src/views/EditorView.vue` | Panel toolbar CSS, offline globe, Edit/Tag mode toolbar, swipe removal, edge guard, _moveCount fix, playback lock |
| `src/composables/useMobileLayout.js` | All swipe code removed, simplified trackStyle + setActivePanel |
| `src/editor/StoryEditor.vue` | showBubble prop, tagMode prop, selection-change emit, overflow dropdown, exposed tag actions, auto-scroll, focusEditor |
| `src/App.vue` | overscroll-behavior-x: none, onEdgeTouch guard, fixed duplicate onMounted |
| `src/modals/SettingsModal.vue` | Tabs = active provider (dropdown removed), tab click sets activeProvider, tab syncs on open |

---

### Edit / Tag Mode Toggle

**Architecture:**
- `mobileTagMode = ref(true)` in EditorView — Tag mode is default
- `:tag-mode="mobileTagMode"` passed to StoryEditor as prop
- StoryEditor watches `tagMode` prop + watches `editor` (for initial mount)
- `applyTagMode(val)` sets/removes `inputmode="none"` on ProseMirror DOM

**iOS keyboard rules (critical):**
- `inputmode="none"` on the `contenteditable` suppresses keyboard but keeps selection working
- `.focus()` only raises keyboard when called **synchronously within a user gesture**
- `onSwitchToEditMode()` calls `editorRef.value?.focusEditor?.()` in the same click handler — NOT in a watcher (watchers are async, iOS ignores them)
- `focusEditor` exposed from StoryEditor: `() => editor.value?.view?.dom?.focus()` (raw DOM focus, not Tiptap commands.focus())

**Three toolbar states (mobile only):**
```
Tag mode (default):  [✏ ☝] | divider | Narrator | Actor 1 | ... → scroll → | ✕ | ⚡
Edit mode:           [✏ ☝] | divider | ↑ Import | B  I  §  (dimmed until selection) | charCount
Locked (playing):    [✏ ☝] (disabled, 0.35 opacity) | role chips...
```

**Playback lock:**
```javascript
const isPlaybackActive = computed(() => playback.isPlaying || playback.isPaused)
watch(isPlaybackActive, (active) => { if (active) mobileTagMode.value = true })
```
Toggle disabled + `.m-mode-toggle--locked` class while playing or paused.

---

### Auto-scroll to Playback Highlight (StoryEditor)

```javascript
function scrollHighlightIntoView(from) {
  try {
    const view = editor.value.view
    const domInfo = view.domAtPos(from)
    const node = domInfo.node.nodeType === Node.TEXT_NODE
      ? domInfo.node.parentElement : domInfo.node
    node.scrollIntoView({ behavior: 'smooth', block: 'center' })
  } catch (_) { /* domAtPos can throw for out-of-bound positions */ }
}
```
Called at the end of both `highlightWord(from, to)` and `highlightSentence(from, to)` in `defineExpose`.

---

### SettingsModal — Tabs as Provider Selector

Old: Tabs (view switcher) + separate Active Provider dropdown below = duplication.
New: Tabs do double duty. Clicking a tab = selecting that provider.

```html
@click="activeTab = p.id; activeProvider = p.id"
```
On `open()`: `activeTab.value = savedProvider` so the correct tab pre-selects.
Active tab has `●` dot prefix via CSS `::before` to signal it's the "selected" state.
Hint line below tabs: *"The open tab is your active provider."*

---

### Bug #27 — _moveCount (EditorView column resize)
Dead variable referenced in `onMove` inside `onColResizeStart`. Was used for an early throttling experiment, never declared, empty if-block. Removed entirely — no behaviour change.

---

### Google Drive / Cloudflare Worker (discussed, not built)
Planned sequence when Worker is ready:
1. `/api/minimax` — proxy TTS, hide API key
2. `/api/oauth/google` — token exchange
3. `/api/drive/upload` — blob → Drive
4. MD import from Drive picker
5. Project save/load as `.storyfi` JSON (solves iOS no-File-System-Access)
6. Audio/ZIP export to Drive

---

### How to Start Next Session
1. Attach updated `SNAPSHOT.md` + a zip containing all patched files
2. Key files to include in zip: `EditorView.vue`, `StoryEditor.vue`, `useMobileLayout.js`, `App.vue`, `SettingsModal.vue`
3. Say what you want to work on — Claude reads SNAPSHOT first

---

## v1.4 Auto-tag & Splitter Improvements (session 6 — 2026-04-22)

### Files changed
| File | What changed |
|---|---|
| `src/views/EditorView.vue` | Edit mode default, ✕ before chips, activeRoleId chip highlight, enhanced onAutoTag, context-aware toasts, playback lock |
| `src/editor/autoTagger.js` | Section-ownership model (pendingRole persists across paragraphs), italic skip |
| `src/editor/splitter.js` | extractTaggedSpans merges same-role spans across paragraph boundaries |
| `src/editor/StoryEditor.vue` | activeRoleId emitted in selection-change, onSelectionUpdate |
| `src/panels/CastPanel.vue` | Auto-tag always visible (v-if removed), Auto-tag button creates missing cast |
| `src/panels/PlaylistPane.vue` | Segment count in playlist toolbar |

---

### Auto-tag Overhaul

**Section-ownership model (autoTagger.js):**
Old: `pendingRole` reset at every paragraph boundary → only text on same line as [LABEL] got tagged.
New: `pendingRole` persists across block boundaries. Everything from `[Label1]` to `[Label2]` is tagged as Label1.

```javascript
// OLD — resets at every paragraph
if (!node.isText) {
  if (!node.isInline) pendingRole = null  // ← was here
  return
}
// NEW — just skip, don't reset
if (!node.isText) return
```

**Italic skip (stage directions):**
```javascript
const isItalic = node.marks.some(m => m.type.name === 'italic')
if (isItalic) return  // don't tag, pendingRole still carries through
```

**Empty cast path:**
`buildAutoTagOperations` early-returns when `roles.length === 0`. When cast is empty, `onAutoTag` now does a raw `doc.descendants` regex scan to discover labels, creates roles via `store.addRole(label)`, then runs the standard tag pass.

---

### splitter.js — Paragraph Boundary Merge (Bug #30)

**Problem:** `extractTaggedSpans` only merged spans where `current.to === pos` exactly. A ProseMirror paragraph boundary adds 2 positions (close + open tag), so same-role text in adjacent paragraphs became two separate spans. This caused desktop/mobile segment count to differ by 1 (platform-specific paragraph structure from MD import).

**Fix:**
```javascript
const contiguous   = current?.to === pos
const paraAdjacent = current?.to + 2 === pos

if (current && current.roleId === roleId && (contiguous || paraAdjacent)) {
  current.text += (paraAdjacent ? ' ' : '') + node.text  // space for para boundary
  current.to    = pos + node.nodeSize
}
```

---

### Mobile Toolbar — Active Role Chip

When cursor is inside tagged text, the matching role chip shows as filled (role colour background, white text). Driven by `activeRoleId` emitted from `onSelectionUpdate` in StoryEditor:

```javascript
onSelectionUpdate: ({ editor }) => {
  const isTagged = editor.isActive('voiceTag')
  emit('selection-change', {
    hasSelection:      from !== to,
    selectionIsTagged: isTagged,
    activeRoleId:      isTagged ? (editor.getAttributes('voiceTag').roleId ?? null) : null,
  })
}
```

---

### Files needed in next session zip
- `src/views/EditorView.vue`
- `src/editor/StoryEditor.vue`
- `src/editor/autoTagger.js`
- `src/editor/splitter.js`
- `src/panels/CastPanel.vue`
- `src/panels/PlaylistPane.vue`
- `src/modals/SettingsModal.vue`
- `src/composables/useMobileLayout.js`
- `src/App.vue`

---

## v1.5 Playlist Subentry Navigation (session 7 — 2026-04-22)

### Files changed
| File | What changed |
|---|---|
| `src/panels/PlaylistPane.vue` | Sentence rows clickable, emit focus-sentence, hover tint CSS |
| `src/views/EditorView.vue` | onFocusSentence handler, 320ms transition wait on mobile, focus-sentence wired to both PlaylistPane instances |
| `src/editor/StoryEditor.vue` | placeCursor(pos) exposed in defineExpose |

---

### Playlist Subentry → Editor Navigation

**Desktop flow:**
Click subentry → `highlightSentence(from, to)` decoration → `placeCursor(to)` → BubbleMenu appears at end of span → user hits ✕ Remove to untag

**Mobile flow:**
Tap subentry → `setActivePanel('editor')` → `await 320ms` (panel transition is 280ms) → `highlightSentence` + `placeCursor(to)` → toolbar shows ✕ because `selectionIsTagged` fires

**Why 320ms and not nextTick:**
`nextTick` fires after Vue's DOM update but before the CSS slide transition (`0.28s cubic-bezier`) completes. The editor scroll resets to top during animation, clobbering `scrollIntoView`. 320ms guarantees the panel has fully arrived.

**Cursor at `to` not `to-1`:**
Tiptap's `shouldShowBubble` checks `isActive('voiceTag')` — this works at the boundary position (`to`) as well as inside the mark. Placing at `to` feels more natural (cursor after the span) and still triggers the bubble.

```javascript
async function onFocusSentence({ from, to }) {
  if (isMobile.value && activePanel.value !== 'editor') {
    setActivePanel('editor')
    await new Promise(r => setTimeout(r, 320))
  }
  editorRef.value?.highlightSentence(from, to)
  editorRef.value?.placeCursor(to)
}
```

---

### Cloudflare Worker / GitHub / Cost Notes (discussed, not built)
- Cloudflare Workers free tier: 100k requests/day — fine for personal + shared PWA use
- TTS proxy Worker: users supply own API keys → Cloudflare cost stays near zero regardless of traffic
- GitHub MCP not available in claude.ai web (requires OAuth GitHub App — not supported yet)
- GitHub sync via Worker + Google Drive is viable but deprioritised until TTS Worker is built
- Sharing Cloudflare Pages URL publicly: effectively free (static hosting + user-owned API keys)

---

### Files needed in next session zip
- `src/views/EditorView.vue`
- `src/editor/StoryEditor.vue`
- `src/editor/autoTagger.js`
- `src/editor/splitter.js`
- `src/panels/CastPanel.vue`
- `src/panels/PlaylistPane.vue`
- `src/modals/SettingsModal.vue`
- `src/composables/useMobileLayout.js`
- `src/App.vue`

---

## v1.6 Segment Grouping & Table Support (session 8 — 2026-04-22)

### Files changed
| File | What changed |
|---|---|
| `src/editor/splitter.js` | Removed paragraph merging + char-limit splitting; paragraph = segment |
| `src/store/generation.js` | Consecutive same-role spans grouped into one playlist group |
| `src/editor/autoTagger.js` | `return false` on table nodes — skips entire table subtree |
| `src/editor/StoryEditor.vue` | Table extensions added + dark-theme table CSS |
| `src/views/EditorView.vue` | Empty-cast label scan skips table cells |

---

### Segment Architecture (final model)

**One paragraph = one segment.** No char-limit auto-splitting.

```
[NARRATOR]              → pendingRole = NARRATOR (autoTagger)
  Para 1                → span 1, segment 1
  Para 2                → span 2, segment 2
  Para 3                → span 3, segment 3
[MAR-VELL]              → pendingRole = MAR-VELL
  Para 4                → span 4, segment 4
```

**Playlist grouping:** `buildGroupsFromDoc` merges consecutive same-role spans into one group. Each paragraph = one sentence within the group. Result: one group header per [LABEL] section, numbered subentries per paragraph.

**Manual splitting:** User inserts § break in editor to split a paragraph into multiple segments.

**No char-limit:** `splitTaggedSpan` now only splits on `SEGMENT_BREAK_TOKEN` (§). Char-limit parameter kept in signature for API compatibility but ignored.

---

### Bug #31 — Playlist Subentry Wrong Scroll Position

**Root cause:** `editorFrom = span.from + textOffset` — when spans were merged across paragraph boundaries, each boundary added 2 ProseMirror positions (close + open node) not present in the merged text string. Sentence 2 was off by 2 per boundary crossed.

**Fix:** Removed paragraph merging from `extractTaggedSpans`. Each paragraph is its own span with its own `from`/`to`. Text offset = ProseMirror offset exactly. `charRangeToDocPositions` machinery not needed.

---

### Tiptap Table Support

```bash
npm install @tiptap/extension-table@2.27.2 @tiptap/extension-table-row@2.27.2 @tiptap/extension-table-cell@2.27.2 @tiptap/extension-table-header@2.27.2
```

Extensions added to StoryEditor: `Table.configure({ resizable: false })`, `TableRow`, `TableHeader`, `TableCell`.

Table cells excluded from auto-tag via `return false` on `table` node type in `doc.descendants()` — ProseMirror skips entire subtree when callback returns false.

---

### Files needed in next session zip
- `src/views/EditorView.vue`
- `src/editor/StoryEditor.vue`
- `src/editor/autoTagger.js`
- `src/editor/splitter.js`
- `src/store/generation.js`
- `src/panels/CastPanel.vue`
- `src/panels/PlaylistPane.vue`
- `src/modals/SettingsModal.vue`
- `src/composables/useMobileLayout.js`
- `src/App.vue`

---

## v2.0 Playback Sync, Sentence Selection & Deploy Pipeline (session 9 — 2026-04-26)

### Files changed this session
| File | What changed |
|---|---|
| `src/store/playback.js` | seekToMs 3-way split, paused scrub, browser speakNext anchoring, follow mode, findCurrentSentence fallback |
| `src/store/generation.js` | timing write-back to group.sentences[i], regenerateSentences, deleteSentences |
| `src/components/AudioPlayerBar.vue` | ctx.setTransform fix, cold scrub loadAndPlay, follow toggle button (amber) |
| `src/panels/PlaylistPane.vue` | sentence-level checkboxes, follow watcher, sentence-row--active CSS |
| `src/views/EditorView.vue` | onAutoTag async fix, onDeleteSelected/onRegenerateSelected use sentence IDs |
| `/opt/storyfi-deploy/main.go` | git pull --rebase added before file write step |

---

### ⚠️ RECURRING BUG — onAutoTag MUST be async

**Every time EditorView.vue is extracted from a zip this fix gets lost. CHECK FIRST.**

```js
async function onAutoTag() {
  ...
  for (const label of labels) await store.addRole(label)
  await nextTick()   // ← REQUIRED before applyAutoTag
  ...
  for (const label of firstPass.unmatched) {
    if (!alreadyExists) { await store.addRole(clean); newRolesAdded++ }
  }
  if (newRolesAdded > 0) await nextTick()
  ...
}
```

---

### Deploy Pipeline (FULLY OPERATIONAL)

**End-of-session workflow:**
1. Claude generates `storyfi-deploy.html` with all changed files baked in as base64
2. Izzy downloads → opens in browser (file://) → clicks Deploy
3. VPS: `git pull --rebase` → write files → `npm run build` → `git push`
4. Site live at `https://storyfi.izzysoft.com`

**Endpoint:** `POST https://storyfi.izzysoft.com/deploy-api/deploy`
**Token:** `3011a2ee76ed37c9cde81fa528ac5840bc53d60f5f9e7523abbdeb2798d35c90`
**Health:** `GET https://storyfi.izzysoft.com/deploy-api/health`
**CORS:** `Access-Control-Allow-Origin: *` (allows file:// and claude.ai)
**Go binary:** `/opt/storyfi-deploy/storyfi-deploy`
**Service:** `systemctl status storyfi-deploy`
**Repo:** `/root/storyfi` → builds to `/var/www/storyfi.izzysoft.com`
**Node:** `/root/.nvm/versions/node/v20.20.2/bin/`

---

### Playback Architecture (v2.0 final)

**seekToMs — 3 cases:**
- `isPlaying` → seek + keep playing (`_startGroupAtOffset`)
- `isPaused` → `_stopSourceNode`, update position vars, `_syncHighlight()`, stay paused
- stopped → update `currentMs`/`currentGroupIdx` only

**Browser TTS per-sentence:**
- `speakNext()` sets `currentSentenceId = sentence.id` and re-anchors `_startedAtCtx` at each utterance
- No time-based guessing — sentence boundaries drive both highlight and follow scroll

**Timing write-back (critical):**
- `maybeStitchGroup` writes `startMs/endMs` to BOTH `sentences.value[id]` AND `group.sentences[i]`
- `_syncHighlight` reads from `group.sentences[i]` — must be populated or highlight jumps to last sentence

**Follow mode:**
- `playback.followMode` (bool, default true) in playback store
- Toggle button in AudioPlayerBar — amber when on
- PlaylistPane watches `currentSentenceId` → auto-expands group, scrolls row into view
- Active sentence: amber left border + background (`sentence-row--active`)

**Sentence selection:**
- `selectedIds` = Set of sentence IDs (not group IDs)
- Group checkbox = toggle all sentences in group (indeterminate when partial)
- Re-Generate → `gen.regenerateSentences(ids)` — resets only selected, re-stitches group
- Delete → `gen.deleteSentences(ids)` + untags editor ranges via `removeTagsInRanges`

---

### How to start a new session (IMPORTANT)

**Always upload a zip + SNAPSHOT.md.** Extract the zip ONCE at session start and
work from those files for the entire session.

**Session start ritual:**
```bash
cd /tmp && unzip -o /mnt/user-data/uploads/Storyfi_vX_X.zip -d /tmp/storyfi/
```
Then work exclusively on files in `/tmp/storyfi/` via `str_replace` and `view`.

**The golden rule — NEVER re-extract mid-session.**
Re-extracting individual files (e.g. `unzip -p Storyfi.zip src/views/EditorView.vue`)
resets that file to the stale zip version and silently drops any patches made this session.
This was the root cause of every RECURRING BUG.

**End of session:**
1. Generate `storyfi-deploy.html` from the patched files in `/tmp/storyfi/`
2. Izzy downloads → opens in browser → clicks Deploy
3. VPS: git pull → write files → npm build → git push → live
4. Update SNAPSHOT.md

**If no zip is available** (quick follow-up session):
Ask Izzy to paste specific files from:
`https://raw.githubusercontent.com/izzysoft2000/Storyfi/main/src/...`
