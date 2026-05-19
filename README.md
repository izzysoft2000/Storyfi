# Storyfi

**Multi-voice audio production from Markdown — browser-native PWA.**

Storyfi transforms a script written in Markdown into a fully produced, multi-character audio file. Each paragraph of dialogue is assigned to a voice role, sent to a TTS engine, and stitched into a single gapless MP3 — all in the browser, no server required.

Current version: **v2.2**
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

1. **Import** a Markdown script (or type directly in the editor)
2. **Tag** text spans with voice roles (NARRATOR, MAR-VELL, etc.) via the BubbleMenu, or automatically via ⚡ Auto-tag
3. **Assign voices** — choose a TTS provider and voice for each role in the Cast panel
4. **Generate** — each tagged paragraph is sent to the TTS engine, audio cached in IndexedDB
5. **Play** — timeline playback with waveform visualisation and sentence-level highlight sync + follow mode
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
    │   ├── LibraryView.vue        — Project grid, version number
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
    │   ├── db.js                  — IndexedDB schema
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
    ├── modals/
    │   ├── SettingsModal.vue
    │   ├── FolderPromptModal.vue
    │   ├── SyncWarningModal.vue
    │   └── ExportModal.vue
    └── components/
        ├── DockablePanel.vue
        ├── AudioPlayerBar.vue     — Waveform, transport, scrub, follow mode toggle
        ├── StorageBar.vue
        ├── Toast.vue
        └── ConfirmModal.vue
```

---

## Features

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
- Scene/Act/Chapter hierarchy
- SRT/VTT subtitle export
