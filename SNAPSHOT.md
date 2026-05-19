# Storyfi — Implementation Snapshot
> Last updated: 2026-05-19
> Current version: v2.2 + iOS background audio + player fixes

---

## What Storyfi Is
A professional, browser-native multi-voice audio production studio. Transforms Markdown scripts into polished audio using high-end TTS engines (MiniMax, ElevenLabs, OpenAI). Features a "Studio" editorial interface with real-time sentence-level synchronisation, per-character performance controls, and a draggable multi-pane workspace. Built with Vue 3 + Tiptap + Pinia + IndexedDB.

---

## Tech Stack
| Layer | Choice |
|---|---|
| Framework | Vue 3, Composition API, `<script setup>` |
| Build | Vite 6 + `vite-plugin-pwa` (Workbox) |
| Editor | Tiptap v2 via `@tiptap/vue-3` |
| State | Pinia (`project.js` + `generation.js` + `playback.js`) |
| Storage | IndexedDB via `idb` library |
| File output | File System Access API (per-project folder) |
| PWA | vite-plugin-pwa + Workbox |
| Audio engine | lamejs (gapless 128kbps CBR MP3) |
| Playback | `<audio>` element (iOS background-safe) + Web Audio API (waveform/decode only) |
| iOS session | Looping silent WAV + MediaSession API + Wake Lock API |
| Drag & drop | vuedraggable@next (SortableJS wrapper) |
| Hosting | Cloudflare Pages (wrangler.jsonc → `assets.directory: ./dist`) |
| Fonts | Fraunces (display), Inter (UI), JetBrains Mono (mono) |

---

## Project Structure

```
storyfi/
├── index.html
├── vite.config.js
├── wrangler.jsonc
├── package.json
├── public/
│   └── manifest.json
└── src/
    ├── main.js                        — Vue app entry, Pinia init
    ├── App.vue                        — root component, hash router (#/project/:id), global CSS tokens
    ├── views/
    │   ├── LibraryView.vue            — project grid + New Project card
    │   └── EditorView.vue             — dockable workspace shell: toolbar, columns, status bar
    ├── panels/
    │   ├── CastPanel.vue              — voice role CRUD, per-role provider/voice/performance/model
    │   └── PlaylistPane.vue           — group rows, sentence sub-rows, Generate/Export toolbar, AudioPlayerBar
    ├── editor/
    │   ├── StoryEditor.vue            — Tiptap editor, BubbleMenu tagging, MD import, highlight decorations
    │   ├── splitter.js                — sentence extraction, extractTaggedSpans()
    │   ├── autoTagger.js              — [LABEL] pattern scanner → tagging operations queue
    │   └── extensions/
    │       ├── VoiceTag.js            — custom Mark: pill highlights (left-border + bg tint)
    │       └── SegmentBreak.js        — custom Node: manual segment break marker (§)
    ├── store/
    │   ├── db.js                      — IndexedDB schema (v2: +voice_previews)
    │   ├── project.js                 — Pinia: active project, cast mutations, defaultVoiceAssignment()
    │   ├── generation.js              — Pinia: build groups, sentence queue, stitch, disk write
    │   └── playback.js                — Pinia: transport state, RAF loop, highlight sync, iOS audio session
    ├── tts/
    │   ├── provider.js                — registry, voice cache, withConcurrency(), withRetry()
    │   ├── minimax.js                 — MiniMax T2A v2, per-role model, hex decode
    │   ├── openai.js                  — OpenAI TTS, binary MP3, no word timings
    │   ├── elevenlabs.js              — ElevenLabs, alignment → WordTiming[]
    │   └── browser.js                 — SpeechSynthesis, live playback, no MP3 export
    ├── audio/
    │   ├── timestamps.js              — getBlobDurationMs() 3-tier, formatDuration()
    │   └── stitcher.js                — lamejs gapless MP3 encode
    ├── storage/
    │   ├── crypto.js                  — Web Crypto API: PBKDF2+AES-GCM key encryption
    │   ├── filesystem.js              — File System Access API: pickFolder, write, read, exists
    │   ├── quota.js                   — StorageManager: getQuotaInfo(), requestPersistentStorage()
    │   └── synccheck.js               — disk vs IDB divergence detection on project open
    ├── modals/
    │   ├── SettingsModal.vue          — API key entry per provider, active provider selector (tabs)
    │   ├── FolderPromptModal.vue      — first-generation output folder prompt, per-project
    │   ├── SyncWarningModal.vue       — repair options: re-write / re-import / mark for regen
    │   └── ExportModal.vue            — ZIP/JSON/HTML/CSV export with live progress bar
    ├── components/
    │   ├── StorageBar.vue             — quota bar; compact prop for status bar inline mode
    │   ├── Toast.vue                  — global toast stack
    │   ├── ConfirmModal.vue           — reusable confirm dialog
    │   ├── AudioPlayerBar.vue         — waveform canvas, transport, scrub, time display
    │   └── DockablePanel.vue          — panel wrapper: title bar, ⠿ drag handle, bar-right slot
    ├── export/
    │   └── exporter.js                — exportZip / exportJSON / exportHTML / exportCSV
    ├── composables/
    │   ├── useOnlineStatus.js         — shared reactive online/offline state
    │   ├── usePanelLayout.js          — panel layout state + useTheme() (light/dark)
    │   ├── usePanelDrag.js            — ghost element, drag state, drop zone detection
    │   └── useMobileLayout.js         — isMobile, activePanel, isSwitching
    └── utils/
        ├── uuid.js                    — crypto.randomUUID()
        ├── debounce.js
        └── colors.js                  — ROLE_COLORS[], nextRoleColor(), hexAlpha()
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
    model:   string,                  // MiniMax model string
  }
}

ParagraphGroup {
  id, roleId, roleLabel, color, order, spanKey,
  sentences: Sentence[],
  sentenceIds: string[],
  stitchStatus: "pending"|"stitching"|"ready"|"error",
  stitchedAudioKey, stitchedDiskFilename,
  totalDurationMs, startMs, endMs,
  livePlayback: boolean               // true = browser TTS, no stored audio
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

## MiniMax Models
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

Emotion payload rule — omit field entirely when empty string:
```javascript
...(settings?.emotion ? { emotion: settings.emotion } : {}),
```

---

## Design Tokens (Studio Theme)
```css
--color-bg:           #1a1418;    /* warm dark brown-purple */
--color-surface:      #221b20;
--color-surface-soft: #2a222a;    /* raised surfaces, waveform thumb */
--color-surface-raised: #302428;
--color-border:       rgba(255,255,255,0.06);
--color-accent:       #ff8e6e;    /* coral */
--color-text:         #f4ecec;
--color-text-muted:   #a08c92;
--font-display:       'Fraunces', Georgia, serif;
--font-ui:            'Inter', -apple-system, sans-serif;
--font-mono:          'JetBrains Mono', monospace;
```

Light mode overrides (`[data-theme="light"]`):
```css
--color-bg: #f5f0f2;  --color-surface: #ffffff;
--color-surface-soft: #ede6e9;  --color-border: rgba(0,0,0,0.10);
--color-accent: #d4522a;  --color-text: #1a1418;
--color-text-muted: #7a5a62;  --color-on-accent: #ffffff;
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
Direct DOM style mutation during mousemove. No `ref()` update → no Vue re-render → no crash.

### 5. getBlobDurationMs() — 3-tier with timeouts
Tier 1: HTML `<audio>`. Tier 2: `AudioContext` with 5s `Promise.race`. Tier 3: size estimate.

### 6. generation.js — all imports static, none dynamic
No `await import()` inside async loops. Dynamic imports in concurrent tasks cause silent hangs.

### 7. Playlist pane layout — flexbox not CSS grid
`display: flex; flex-direction: row`. CSS grid with reactive `gridTemplateColumns` is unreliable with Vue scoped styles.

### 8. Web Audio objects — never in Pinia reactive state
`AudioContext`, `AudioBuffer[]`, `HTMLAudioElement` in module-level `let` vars in `playback.js`. Vue Proxy-wrapping breaks `suspended` state and `onended` callbacks.

### 9. Playback highlight decorations — transient, never saved
Driven by `editor.view.dispatch(tr.setMeta(...))`. Never written to Tiptap JSON doc.

### 10. decodeAudioData — 10s timeout
```javascript
const audioBuf = await Promise.race([
  _audioCtx.decodeAudioData(arrayBuf),
  new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 10_000)),
])
```

### 11. Role IDs use uuid(), never array index
`actor_${cast.length}` reuses IDs after deletion. `uuid()` is collision-proof.

### 12. voiceAssignment is never null
`addRole()` and `createBlankProject()` always call `defaultVoiceAssignment()`. CastPanel `normalizeRoles` watcher backfills null voiceAssignment and missing settings keys on older saves.

### 13. unsetVoiceTag — must extendMarkRange first
```javascript
editor.chain().focus().extendMarkRange('voiceTag').unsetVoiceTag().run()
```

### 14. Named ref callback in v-for (not inline arrow)
```javascript
// WRONG: :ref="el => { editorRef.value = el || null }"
// CORRECT:
function setEditorRef(el) { if (editorRef) editorRef.value = el ?? null }
// In template: :ref="setEditorRef"
```

### 15. Column resize: width = mouseX − leftEdge, not offsetWidth
`offsetWidth` on `flex-basis: 0px` returns 0 before layout settles.

### 16–18. Column resize system
- Max width = `container.offsetWidth - 180 - 5` (not hardcoded 700px)
- `_activeResize = ref(null)` drives `colStyle` — not direct DOM manipulation
- Left-column snapshots (`_leftSnapshots`) pin unsaved-width columns during drag

### 19. AudioPlayerBar play button disabled after generation
`hasReadyAudio = playback.hasAudio || props.groups.some(g => g.stitchStatus === 'ready')`

### 20. waveformData getter not reactive
```javascript
// WRONG: () => _waveformData
// CORRECT: (state) => state.waveformVersion > 0 ? _waveformData : null
```
Getter must depend on a reactive state property to recompute.

### 21. New tag above existing groups missing from playlist
`watch(taggedSpans, ...)` in EditorView calls `gen.buildGroupsFromDoc()` on every tagging change.

### 22–28. Mobile UI bugs
- `swipeDelta` reference after swipe removal
- Mobile toolbar CSS classes defined but never styled
- Edge touch guard blocked ← back button (exempts interactive elements)
- iOS keyboard not shown switching to Edit mode (sync `.focus()` in gesture handler)
- `tagMode` watcher fires before editor DOM exists (split into two watchers)
- `_moveCount` dead variable in column resize
- BubbleMenu overflow CSS parse error

### 29–33. Auto-tag & splitter bugs
- Empty cast early-return in `buildAutoTagOperations`
- Paragraph boundary gap of 2 in `extractTaggedSpans` (desktop/mobile count mismatch)
- Playlist subentry wrong scroll (char offset vs ProseMirror position)
- Segments split mid-paragraph by char limit (removed auto-splitting)
- One group per paragraph causing redundant header+subentry

### RECURRING BUG — onAutoTag MUST be async
**This fix gets lost every time `EditorView.vue` is edited. Check first.**
```javascript
async function onAutoTag() {
  for (const label of labels) await store.addRole(label)
  await nextTick()   // ← REQUIRED before applyAutoTag
  for (const label of firstPass.unmatched) {
    if (!alreadyExists) { await store.addRole(clean); newRolesAdded++ }
  }
  if (newRolesAdded > 0) await nextTick()
}
```
`store.addRole()` is async (IndexedDB write). Without `await nextTick()` the tag pass runs before Vue has updated the roles array.

---

## iOS Background Audio (playback.js)

### Architecture
All playback goes through an `HTMLAudioElement` (`_audioEl`) — not `AudioBufferSourceNode`. The `<audio>` element continues playing when iOS screen locks; `AudioContext` gets suspended.

### Module-level vars (non-reactive)
```javascript
let _audioEl      = null   // HTMLAudioElement
let _audioBlobUrl = null   // current Object URL (revoked on group change)
let _blobs        = []     // raw MP3 blobs indexed parallel to _buffers
let _wakeLock     = null   // WakeLockSentinel
let _silentBlobUrl = null  // cached 1s silent WAV blob URL (never revoked)
```

### iOS session unlock pattern
`loadAndPlay()` must call `_audioEl.play()` synchronously (before any `await`) with a looping 1-second silent WAV. iOS expires the user-gesture context at the first `await`. The silent WAV loops indefinitely, keeping the session alive during async `decodeAudioData()`. When `_startGroupAtOffset()` sets the real blob as `src`, the loop stops automatically.

```javascript
// In loadAndPlay() — synchronous, before any await:
if (!_audioEl) _audioEl = new Audio()
_audioEl.loop = true
_audioEl.src  = getSilentBlobUrl()
_audioEl.play().catch(() => {})
```

### _stopSourceNode() must NOT call pause()
Calling `pause()` between the silent unlock and real playback closes the iOS audio session. Only `_cleanup()` and `_onPlaybackEnded()` call `_audioEl.pause()`.

### RAF progress tracking
```javascript
// Use _audioBlobUrl presence (not paused/ended) — iOS briefly marks paused during load
if (_audioEl && _audioBlobUrl) {
  this.currentMs = _segmentOffsetMs + _audioEl.currentTime * 1000
} else if (_audioCtx) {
  this.currentMs = _segmentOffsetMs + Math.max(0, _audioCtx.currentTime - _startedAtCtx) * 1000
}
```
`_startedAtCtx` is set in both paths so AudioContext is always a valid fallback.

### Browser TTS pause bug
`speechSynthesis.cancel()` fires `onend`/`onerror` synchronously. `_browserGeneration` must be incremented BEFORE calling `cancel()` in `pause()`, otherwise `speakNext` advances to the next sentence.

### Browser TTS highlight
`_syncHighlight` bypasses the time-based `findCurrentSentence()` for `_browserLive` groups — those groups have no per-sentence timing. Uses `currentSentenceId` directly (set by `speakNext`).

### Browser TTS seek
`seekforward`/`seekbackward` MediaSession handlers call `_seekBrowserTts(±1)` first. Browser TTS has no audio timeline, so ±10s maps to ±1 sentence. Falls back to `seekToMs` for non-browser-TTS groups.

### In-group seek (same group while playing)
Sets `_audioEl.currentTime` directly without reloading `src`. Reloading `src` on iOS resets `currentTime` to 0 before `canplay` fires, causing seeks to restart the segment.

```javascript
if (offset.groupIdx === this.currentGroupIdx && _audioEl && _audioBlobUrl && !_audioEl.ended) {
  _segmentOffsetMs = offset.startMs
  _audioEl.currentTime = offsetInGroup / 1000
  this.currentMs = ms
  return
}
```

### MediaSession
Registered in `_setupMediaSession(title)`. Provides lock screen Now Playing widget on iOS. `setPositionState` pushed every ~1s from the RAF loop.

---

## Segment Architecture

**One paragraph = one sentence in a group.** No char-limit auto-splitting.

```
[NARRATOR]     → pendingRole = NARRATOR (autoTagger section-ownership model)
  Para 1       → sentence 1 in group 1
  Para 2       → sentence 2 in group 1
[MAR-VELL]     → new group
  Para 3       → sentence 1 in group 2
```

Consecutive same-role paragraphs → one `ParagraphGroup` with multiple `Sentence` records. Manual § break splits into a new group.

---

## Auto-Tag Architecture

### Section-ownership model
`pendingRole` persists across block boundaries. Everything from `[Label1]` to the next `[Label2]` is tagged as Label1. Italic nodes (stage directions) are skipped but don't reset `pendingRole`.

### Empty cast path
When cast is empty, `onAutoTag` does a raw `doc.descendants` regex scan to discover labels, creates roles via `store.addRole(label)`, then runs the standard tag pass after `await nextTick()`.

### Files
- `src/editor/autoTagger.js` — `buildAutoTagOperations(editor, roles, options?)`
- `src/panels/CastPanel.vue` — ⚡ button
- `src/editor/StoryEditor.vue` — `applyAutoTagOps`, `applyAutoTag`, `syncGroups` in `defineExpose`
- `src/views/EditorView.vue` — `onAutoTag()` (must be async)

---

## Dockable Panel System

### Layout model
```javascript
// localStorage: 'storyfi_panel_layout_v1'
{
  columns: [{ id, panels: ('cast'|'playlist'|'editor')[] }, ...],
  columnWidths: { [colId]: number }
}
```

### Column resize
All resize state in module-level vars. `_activeResize = ref(null)` is the single reactive driver. Width formula: `width = clientX - column.getBoundingClientRect().left`. Left-column widths snapshotted at `mousedown` into `_leftSnapshots`, persisted on `mouseup`.

---

## Mobile UI

### isSwitching guard
`useMobileLayout.setActivePanel()` sets `isSwitching = true` for 320ms. Both `scrollHighlightIntoView` (editor) and `scrollIntoContainer` (playlist) bail if `isSwitching` is true — prevents iOS panel-track misalignment during the 280ms slide animation.

### Safe scroll pattern
```javascript
function scrollIntoContainer(containerEl, targetEl) {
  const offset = targetEl.getBoundingClientRect().top
    - containerEl.getBoundingClientRect().top
    - containerEl.getBoundingClientRect().height / 2
    + targetEl.getBoundingClientRect().height / 2
  containerEl.scrollBy({ top: offset, behavior: 'smooth' })
}
```

### Edit/Tag mode
- Tag mode default; Edit mode shows keyboard
- `.focus()` must be called synchronously in the gesture handler (not in a watcher)
- Playback locks to Tag mode: `watch(isPlaybackActive, v => { if (v) mobileTagMode.value = true })`

---

## Waveform Visualisation

- `_waveformData` — module-level `Float32Array | null`
- `buildWaveformData(buffers, bars)` — RMS-downsamples all decoded buffers, normalises 0→1
- `waveformVersion` reactive counter drives getter reactivity (plain `() => _waveformData` never recomputes)
- `getDrawColors()` — reads CSS vars + `data-theme` attribute each frame for light/dark support
- Bars grow from `baseline = H - (DOT_R + 4)` upward; dot playhead sits on baseline
- Flat track (browser TTS / no data): 3px rounded bar, dot on midline

---

## Feature Status
| Area | Feature | Status |
|---|---|---|
| Core | PWA shell, Library, IndexedDB | ✅ |
| Core | Tiptap editor, VoiceTag, SegmentBreak | ✅ |
| Core | MiniMax/OpenAI/ElevenLabs/Browser TTS | ✅ |
| Core | Sentence stitching, disk output, divergence repair | ✅ |
| Core | Resizable dockable workspace | ✅ |
| Playback | Web Audio waveform, seek, scrub | ✅ |
| Playback | Word highlight (MiniMax/ElevenLabs) | ✅ |
| Playback | Sentence highlight fallback (OpenAI/Browser) | ✅ |
| Playback | Follow mode (auto-expand + scroll) | ✅ |
| Playback | iOS background audio (`<audio>` element) | ✅ |
| Playback | Wake Lock (screen-on while playing) | ✅ |
| Playback | MediaSession (lock screen Now Playing) | ✅ |
| Playback | Browser TTS pause fix (generation stamp) | ✅ |
| Playback | Browser TTS highlight fix (currentSentenceId) | ✅ |
| Playback | Browser TTS seek (sentence-level skip) | ✅ |
| Playback | Progress bar continuous update (audioBlobUrl guard) | ✅ |
| Export | ZIP / JSON / HTML / CSV | ✅ |
| Export | Cloudflare Pages deploy | ✅ |
| UI | Studio theme (warm palette, coral accent) | ✅ |
| UI | Light/Dark mode toggle | ✅ |
| UI | Cast drag-to-reorder, MiniMax model selector | ✅ |
| UI | Voice preview with IDB cache + language/gender filters | ✅ |
| UI | Mobile full-screen panels + bottom nav | ✅ |
| UI | Auto-tag with section-ownership model | ✅ |
| UI | Sentence-level checkboxes + Re-Generate/Delete | ✅ |
| Backlog | MiniMax CORS proxy (Cloudflare Worker) | ⬜ |
| Backlog | Google Drive integration (requires Worker) | ⬜ |
| Backlog | Scene/Act/Chapter hierarchy | ⬜ |
| Backlog | SRT/VTT subtitle export | ⬜ |
| Backlog | Auto-scroll teleprompter | ⬜ |
