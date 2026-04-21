# Storyfi

**Multi-voice audio production from Markdown — browser-native PWA.**

Storyfi transforms a script written in Markdown into a fully produced, multi-character audio file. Each paragraph of dialogue is assigned to a voice role, sent to a TTS engine, and stitched into a single gapless MP3 — all in the browser, no server required.

---

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

```bash
npm run build      # production build
npm run preview    # preview production build locally
```

Deployed at **https://storyfi.izzysoft.workers.dev/** via Cloudflare Pages.

---

## What It Does

1. **Import** a Markdown script (or type directly in the editor)
2. **Tag** text spans with voice roles (NARRATOR, MAR-VELL, etc.) — manually via the BubbleMenu, or automatically via ⚡ Auto-tag from script
3. **Assign voices** — choose a TTS provider and voice for each role in the Cast panel
4. **Generate** — each tagged span is sent to the TTS engine, audio is cached in IndexedDB
5. **Play** — timeline playback with waveform visualisation and sentence-level highlighting
6. **Export** — stitched gapless MP3 saved to your chosen output folder via File System Access API

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Vue 3, Composition API, `<script setup>` |
| Build | Vite 6 + `vite-plugin-pwa` (Workbox) |
| Editor | Tiptap v2 — custom `VoiceTag` Mark + `SegmentBreak` Node |
| State | Pinia — `project.js`, `generation.js`, `playback.js` |
| Persistence | IndexedDB via `idb`, File System Access API for MP3 output |
| Audio | Web Audio API + `lamejs` (gapless 128kbps CBR MP3 stitching) |
| Drag & drop | `vuedraggable@next` (cast role reordering) |
| Hosting | Cloudflare Pages |
| Fonts | Playfair Display · DM Sans · JetBrains Mono |

**TTS Providers supported:** MiniMax · OpenAI · ElevenLabs · Browser SpeechSynthesis (offline fallback)

---

## Project Structure

```
storyfi/
├── index.html                         — PWA meta tags, apple-touch-icon, viewport-fit=cover
├── vite.config.js                     — Vite + VitePWA plugin
├── public/
│   ├── manifest.json                  — PWA manifest (display: standalone)
│   └── icons/                         — 192px + 512px app icons
└── src/
    ├── main.js                        — Vue + Pinia init
    ├── App.vue                        — Hash router (#/project/:id), global CSS tokens
    ├── views/
    │   ├── LibraryView.vue            — Project grid, New Project card, PWA install hint
    │   └── EditorView.vue             — Desktop dockable workspace + Mobile swipe layout
    ├── panels/
    │   ├── CastPanel.vue              — Role CRUD, voice picker, ⚡ Auto-tag button
    │   └── PlaylistPane.vue           — Group rows, Generate/Export, AudioPlayerBar + waveform
    ├── editor/
    │   ├── StoryEditor.vue            — Tiptap editor, BubbleMenu, MD import, decorations
    │   ├── autoTagger.js              — [LABEL] pattern scanner → tagging operations queue
    │   ├── splitter.js                — Sentence extraction, char-limit splitting, extractTaggedSpans()
    │   └── extensions/
    │       ├── VoiceTag.js            — Custom Mark: role colour highlights
    │       └── SegmentBreak.js        — Custom Node: manual segment break (§)
    ├── store/
    │   ├── db.js                      — IndexedDB schema (projects, audio, voice_previews, settings)
    │   ├── project.js                 — Active project state, cast mutations, auto-save (2s debounce)
    │   ├── generation.js              — Group build, TTS queue, concurrency limit, stitch, disk write
    │   └── playback.js                — Transport, RAF loop, waveform data, highlight sync
    ├── composables/
    │   ├── usePanelLayout.js          — Dockable column layout, drag-to-reorder, localStorage persist
    │   ├── usePanelDrag.js            — Ghost element drag, drop zone detection
    │   ├── useMobileLayout.js         — Mobile breakpoint detection, panel swipe, cast drawer
    │   └── useOnlineStatus.js         — navigator.onLine watcher
    ├── tts/
    │   ├── provider.js                — Provider registry, concurrency limiter
    │   ├── minimax.js                 — MiniMax T2A v2 (hex audio, GroupId as query param)
    │   ├── openai.js                  — OpenAI TTS
    │   ├── elevenlabs.js              — ElevenLabs TTS
    │   └── browser.js                 — Web Speech API fallback
    ├── audio/
    │   ├── stitcher.js                — lamejs MP3 stitching, gapless CBR
    │   └── timestamps.js              — Per-sentence start/end Ms from stitch
    ├── storage/
    │   ├── crypto.js                  — PBKDF2 + AES-GCM API key encryption
    │   ├── filesystem.js              — File System Access API (folder picker, MP3 write)
    │   ├── quota.js                   — StorageManager quota display
    │   └── synccheck.js               — Disk↔IDB divergence detection on project open
    ├── modals/
    │   ├── SettingsModal.vue          — Provider config, API keys (encrypted in IDB)
    │   ├── FolderPromptModal.vue      — Output folder picker
    │   ├── SyncWarningModal.vue       — Disk divergence warning
    │   └── ExportModal.vue            — Export options
    └── components/
        ├── DockablePanel.vue          — Draggable panel shell with title bar + slots
        ├── AudioPlayerBar.vue         — Waveform canvas, transport controls, scrub
        ├── StorageBar.vue             — IndexedDB quota display
        ├── Toast.vue                  — Notification toasts
        └── ConfirmModal.vue           — Reusable confirm dialog
```

---

## Features

### Editor
- Tiptap v2 rich text editor with Markdown import
- **VoiceTag** mark — highlights text with role colour, stores `roleId`/`roleLabel`/`color`
- **SegmentBreak** node — manual split point (§) respecting sentence boundaries
- BubbleMenu on text selection: role chips + ⚡ Auto-tag + § break
- Character count display

### Auto-Tagging
- Scans document for `[LABEL]` patterns (e.g. `[NARRATOR]`, `[MAR-VELL]`)
- Case-insensitive match against cast roles
- Merge mode — leaves existing tags untouched
- Selection-scoped auto-tag from the BubbleMenu
- Reports unmatched labels as a toast
- Queue-based application (one tag at a time via `setTimeout(0)`) so each fires through normal Tiptap `onUpdate` path

### Cast Panel
- Up to 10 roles per project
- Per-role: colour dot, label, TTS provider, voice selector with preview
- Language + gender filter pills in voice picker
- Online/offline status per provider
- Drag-to-reorder roles
- ⚡ Auto-tag from script button

### Generation Pipeline
- Segments mapped to ParagraphGroups → Sentences
- Concurrent TTS requests (configurable limit)
- Per-sentence status: pending → generating → ready / error
- Automatic retry on failure
- IndexedDB audio cache (avoids re-generating unchanged segments)
- Stitch sentences → group MP3 → master timeline

### Playback
- Web Audio API decode + playback
- Waveform visualisation (RMS downsampled to 200 bars)
- Purple played / muted unplayed / playhead line
- Canvas scrub to seek
- Sentence-level highlight sync via `requestAnimationFrame`

### Workspace (Desktop)
- 3 dockable panels: Cast | Editor | Playlist
- Drag-to-reorder within and between columns
- Resizable columns (mousedown on resize handle)
- Layout persisted to `localStorage`
- Reset Layout button

### Mobile UI
- Detects viewport < 768px
- Full-screen swipe between Editor ↔ Playlist (50px threshold, rubber-band at edges)
- Cast as slide-in drawer from left
- Bottom tab bar: 🎭 Cast | ↑ B I § (editor actions) | ✏️ Editor | ▶ Playlist
- Last panel remembered in `localStorage`
- Safe area insets gated behind `@media (display-mode: standalone)`

### PWA
- Installable on iOS (Add to Home Screen) and Android/Chrome
- `display: standalone` in manifest
- `viewport-fit=cover` for edge-to-edge display
- `apple-touch-icon` + Apple PWA meta tags
- Chrome install prompt captured via `beforeinstallprompt`
- iOS install hint banner (dismissible, shown once)

### Security
- API keys encrypted client-side: PBKDF2 key derivation + AES-GCM encryption
- Keys stored encrypted in IndexedDB, never in plaintext

---

## Design Tokens

```css
--color-bg:          #0e0c18   /* page background */
--color-surface:     #1a1625   /* panels, cards */
--color-border:      #2e2a42   /* borders, dividers */
--color-accent:      #7c5cbf   /* primary actions */
--color-highlight:   #c084fc   /* hover accent */
--color-text:        #f0eeff   /* primary text */
--color-text-muted:  #8b85a8   /* secondary text */
--color-success:     #4ade80
--color-warning:     #facc15
--color-error:       #f87171

--font-display:  'Playfair Display'  /* titles, project names */
--font-ui:       'DM Sans'           /* all UI chrome */
--font-mono:     'JetBrains Mono'    /* timestamps, metadata */
```

---

## Architecture Notes

### Why no server?
All TTS calls go directly from the browser to provider APIs using user-supplied API keys. No backend, no auth layer, no data leaves the device except TTS requests.

### Audio pipeline
```
Tagged spans → ParagraphGroups → Sentences
     ↓
TTS queue (concurrent, cached in IDB)
     ↓
Per-group MP3 stitch (lamejs, gapless CBR)
     ↓
Master timeline (startMs / endMs per group)
     ↓
Web Audio API decode → playback → waveform
```

### Cross-component doc reading (important)
Tiptap's `editor.state.doc` passed through Vue's component proxy loses custom mark types. All ProseMirror doc reads for group building use `syncGroups(buildFn, charLimit)` — a method exposed via `defineExpose` that runs `buildFn(editor.value.state.doc)` inside StoryEditor's own closure, never crossing the component boundary.

### Auto-tag queue pattern
`buildAutoTagOperations()` returns operations without applying them. `applyAutoTagOps()` in StoryEditor runs the `setTimeout(0)` queue entirely inside StoryEditor's closure, using `capturedEditor = editor.value` captured at call time. This avoids the dual-mount re-render issue where `editorRef` could point to a different instance by the time the async queue completes.

---

## Known Limitations / Backlog

- Mobile: File System Access API not available on iOS — export goes to Downloads
- ElevenLabs: no streaming (full audio on completion)
- No undo/redo for voice tag operations
- Google Drive integration requires a Cloudflare Worker proxy (in backlog)
- Scene/Act/Chapter hierarchy not yet implemented
- Auto-scroll teleprompter during playback (in backlog)

---

## Development Notes

See `SNAPSHOT.md` for the full session-by-session implementation history, bug fixes, and architecture decisions. Start every Claude session by attaching `SNAPSHOT.md`.
