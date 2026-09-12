# Storyfi

**Multi-voice audio production from Markdown — browser-native PWA.**

Storyfi transforms a script written in Markdown into a fully produced, multi-character audio file. Each paragraph of dialogue is assigned to a voice role, sent to a TTS engine, and stitched into a single gapless MP3 — all in the browser, no server required.

Current version: **v3.1.0**
Live at: **https://storyfi.izzysoft.workers.dev/**

---

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

```bash
npm run build    # production build → ./dist
npm run preview  # preview production build locally
```

---

## What It Does

1. **Create a Solution** — every Project (script) lives inside a Solution, which groups related Projects together (e.g. chapters of a book)
2. **Import** a Markdown script into a Project (or type directly in the editor)
3. **Tag** text spans with voice roles (NARRATOR, MAR-VELL, etc.) via the BubbleMenu, or automatically via ⚡ Auto-tag
4. **Assign voices** — choose a TTS provider and voice for each role in the Cast panel
5. **Generate** — each tagged paragraph is sent to the TTS engine, audio cached in IndexedDB
6. **Play** — timeline playback with waveform visualisation and sentence-level highlight sync + follow mode
7. **Export** — stitched gapless MP3 saved to your chosen output folder via File System Access API, or **Compile Book** a whole Solution's Projects into one combined ZIP

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Vue 3, Composition API, `<script setup>` |
| Build | Vite 6 + `vite-plugin-pwa` (Workbox) |
| Editor | Tiptap v2 — custom `VoiceTag` Mark + `SegmentBreak` Node |
| State | Pinia — `project.js`, `generation.js`, `playback.js` |
| Persistence | IndexedDB via `idb`, File System Access API for MP3 output |
| Audio | `<audio>` element (iOS background-safe) + Web Audio API for waveform/decode |
| Encoding | `lamejs` — gapless 128kbps CBR MP3 stitching |
| Drag & drop | `vuedraggable@next` (cast role reordering) |
| Hosting | Cloudflare Pages |
| Fonts | Fraunces · Inter · JetBrains Mono |

**TTS Providers:** MiniMax · OpenAI · ElevenLabs · Browser SpeechSynthesis (no API key)

---

## Project Structure

```
storyfi/
├── index.html
├── vite.config.js
├── wrangler.jsonc
├── public/
│   ├── manifest.json
│   └── icons/
└── src/
    ├── main.js
    ├── App.vue
    ├── views/
    │   ├── LibraryView.vue        — Solution grid, version number, new-Solution flow
    │   ├── SolutionView.vue       — Projects within one Solution, reorder, Compile Book
    │   └── EditorView.vue         — Desktop dockable workspace + Mobile layout
    ├── panels/
    │   ├── CastPanel.vue          — Role CRUD, voice picker, Auto-tag button
    │   └── PlaylistPane.vue       — Sentence rows, checkboxes, follow mode, player bar
    ├── editor/
    │   ├── StoryEditor.vue        — Tiptap editor, BubbleMenu, MD import, decorations
    │   ├── autoTagger.js          — [LABEL] pattern scanner → tagging operations queue
    │   ├── splitter.js            — Sentence extraction, extractTaggedSpans()
    │   └── extensions/
    │       ├── VoiceTag.js        — Custom Mark: role colour highlights
    │       └── SegmentBreak.js    — Custom Node: manual segment break (§)
    ├── store/
    │   ├── db.js                  — IndexedDB schema (projects + solutions stores)
    │   ├── project.js             — Active project state, cast mutations
    │   ├── generation.js          — Group build, TTS queue, stitch, sentence ops
    │   └── playback.js            — Transport, RAF loop, waveform, highlight sync
    ├── composables/
    │   ├── usePanelLayout.js      — Panel layout + useTheme()
    │   ├── usePanelDrag.js
    │   ├── useMobileLayout.js
    │   └── useOnlineStatus.js
    ├── tts/
    │   ├── provider.js
    │   ├── minimax.js
    │   ├── openai.js
    │   ├── elevenlabs.js
    │   └── browser.js             — Web Speech API (no API key needed)
    ├── audio/
    │   ├── stitcher.js
    │   └── timestamps.js
    ├── storage/
    │   ├── crypto.js
    │   ├── filesystem.js
    │   ├── quota.js
    │   └── synccheck.js
    ├── export/
    │   └── exporter.js            — ZIP/JSON/HTML/CSV export + compileSolution() (Compile Book)
    ├── modals/
    │   ├── SettingsModal.vue
    │   ├── FolderPromptModal.vue
    │   ├── SyncWarningModal.vue
    │   └── ExportModal.vue
    ├── utils/
    │   ├── defaultName.js         — nextDefaultName() — "Solution 1", "Project 1", ...
    │   ├── relativeDate.js
    │   ├── waveform.js            — pseudoWaveform() card art
    │   ├── uuid.js
    │   ├── debounce.js
    │   └── colors.js
    └── components/
        ├── DockablePanel.vue
        ├── AudioPlayerBar.vue     — Waveform, transport, scrub, follow mode toggle
        ├── ProjectCard.vue        — Shared Project card (Solution view)
        ├── StorageBar.vue
        ├── Toast.vue
        └── ConfirmModal.vue
```

---

## Features

### Solutions & Projects
- **Solution** = an ordered group of Projects (e.g. chapters of a book). It's the only top-level container in the Library — there is no standalone/ungrouped Project list.
- A Project can only be created inside a Solution; new Solutions and Projects default to auto-incrementing names ("Solution 1", "Project 1", ...) so creating one is a single click
- Library grid shows Solutions only: title, Project count, combined audio size, merged cast avatars across member Projects
- Inside a Solution: sort by Name/Newest/Oldest, or by manual **Book Order** with ↑/↓ reorder — Book Order is what **Compile Book** uses
- **Compile Book** bundles every member Project's stitched audio into one ZIP, numbered chapter subfolders + a `book.json` manifest with cumulative book-wide timing
- Editor shows a "📚 Solution Title ›" breadcrumb in place of a separate Library button — it *is* the back control, taking you straight to that Project's Solution
- Deleting a Solution cascades to delete its member Projects (and their audio) — there's no "unlink to standalone" limbo to land in

### Editor
- Tiptap v2 rich text editor with Markdown import
- **VoiceTag** mark — highlights text with role colour (pill style: left-border + bg tint)
- **SegmentBreak** node — manual split point (§)
- BubbleMenu: role chips + ↗ Jump to Playlist + ✕ Remove
- Table support (`@tiptap/extension-table` family, pinned to 2.27.2)

### Auto-Tagging
- Scans document for `[LABEL]` patterns
- Section-ownership model — `pendingRole` carries across paragraphs until next label
- Creates missing cast members from unmatched labels
- Italic text (stage directions) skipped; table cells excluded
- Reports unmatched labels as a toast
- **No `[LABEL]`s found** → prompts to tag the entire script as Narrator in one click (single-voice narration, PocketFM-style)
- **Voice inheritance** — any cast role newly created by Auto-Tag (including the Narrator fallback above) silently reuses a matching-label role's voice from up to 8 of the current Solution's most-recently-updated other Projects, if one exists and has a voice picked. Never overwrites a voice the user already set.

### Cast Panel
- Up to 10 roles per project
- Per-role: colour, label, TTS provider, voice picker with preview
- Language + gender filter pills; drag-to-reorder roles
- Per-role MiniMax model selector (all 8 models) + emotion, speed, pitch, volume

### Generation Pipeline
- Paragraph = segment; consecutive same-role paragraphs grouped under one playlist header
- Browser TTS fast-path (no API key, live SpeechSynthesis, no MP3 storage)
- Sentence-level checkboxes — Re-Generate or Delete individual sentences
- `regenerateSentences(ids)` / `deleteSentences(ids)` — untags editor ranges on delete

### Playback
- **`<audio>` element** for all non-browser-TTS groups — continues playing when iOS screen locks
- **Wake Lock API** — prevents screen from dimming while audio plays (iOS 16.4+)
- **MediaSession API** — lock screen Now Playing widget with play/pause/seek controls
- Looping silent WAV trick unlocks iOS audio session synchronously in the user gesture
- Waveform canvas (DPR-aware, light/dark colour-aware, `ctx.setTransform`)
- `seekToMs` — 3-way: playing (seek+play), paused (reposition only), stopped (set position)
- Follow mode — auto-expands group, scrolls active sentence into view
- Browser TTS: `currentSentenceId` set per utterance; `_seekBrowserTts` skips by sentence

### Workspace (Desktop)
- 3 dockable panels: Cast | Editor | Playlist; drag to reorder/split/merge columns
- Column resize handles with left-column snapshot system
- Status bar: StorageBar + Saved dot + Online dot

### Mobile UI
- Full-screen panels with bottom tab bar: Cast | Edit | Play
- Edit/Tag mode toggle; playback locks to Tag mode
- `isSwitching` guard prevents scroll conflicts during panel transitions

---

## Architecture Notes

### iOS Background Audio (critical)
`loadAndPlay()` synchronously calls `_audioEl.play()` with a looping 1-second silent WAV before any `await`. This keeps the iOS audio session alive during async `decodeAudioData()`. `_stopSourceNode()` never calls `pause()` — only `_cleanup()` and `_onPlaybackEnded()` do. Changing `_audioEl.src` to the real blob URL stops the silent loop without closing the session.

### Timing write-back (critical)
`maybeStitchGroup` writes `startMs`/`endMs` to BOTH `sentences.value[id]` (flat lookup) AND `group.sentences[i]` (array objects). `_syncHighlight` reads from `group.sentences[i]`. Both must be in sync or highlight jumps to the last sentence.

### Web Audio objects — never in Pinia reactive state
`AudioContext`, `AudioBuffer[]`, `HTMLAudioElement` live in module-level `let` vars in `playback.js`. Vue Proxy-wrapping breaks `suspended` state and `onended` callbacks.

### onAutoTag MUST be async
`store.addRole()` reads from IndexedDB (async). `onAutoTag` must `await` every `addRole` call and `await nextTick()` before running `applyAutoTag`. Without this: "No [LABEL] patterns found" fires immediately after "Added N cast members". **This fix gets lost easily — check first after any EditorView.vue edit.**

---

## Known Limitations / Backlog

- iOS: File System Access API unavailable — falls back to ZIP export
- MiniMax API requires a CORS proxy for browser calls (Cloudflare Worker planned)
- Google Drive integration (requires Worker for OAuth token exchange)
- SRT/VTT subtitle export
- `book.json` (Compile Book) has no sentence-level text/timing yet — only paragraph-group level, since raw Project records don't store sentence text
- Solution export as `.epub`/eBook — text-only (chapters from each Project's content), no audio; would reuse `jszip` and need a headless ProseMirror/Tiptap serializer (schema + `DOMSerializer`, no mounted editor) to turn stored `editorState` into chapter HTML
