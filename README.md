# Storyfi

**Multi-voice audio production from Markdown — browser-native PWA.**

Storyfi transforms a script written in Markdown into a fully produced, multi-character audio file. Each paragraph of dialogue is assigned to a voice role, sent to a TTS engine, and stitched into a single gapless MP3 — all in the browser, no server required.

Current version: **v2.1**
Live at: **https://storyfi.izzysoft.workers.dev/**

---

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

```bash
npm run build      # production build → /var/www/storyfi.izzysoft.com
npm run preview    # preview production build locally
```

---

## What It Does

1. **Import** a Markdown script (or type directly in the editor)
2. **Tag** text spans with voice roles (NARRATOR, MAR-VELL, etc.) — manually via the BubbleMenu, or automatically via ⚡ Auto-tag from script
3. **Assign voices** — choose a TTS provider and voice for each role in the Cast panel
4. **Generate** — each tagged span is sent to the TTS engine, audio is cached in IndexedDB
5. **Play** — timeline playback with waveform visualisation and sentence-level highlighting + follow mode
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
| Hosting | Cloudflare Pages (storyfi.izzysoft.workers.dev) |
| VPS | Debian 12 + Nginx (storyfi.izzysoft.com) — deploy server |
| Fonts | Playfair Display · DM Sans · JetBrains Mono |

**TTS Providers supported:** MiniMax · OpenAI · ElevenLabs · Browser SpeechSynthesis (no API key)

---

## Deploy Pipeline

Changes are deployed via a one-click HTML deploy page generated at the end of each dev session.

| Component | Detail |
|---|---|
| Deploy server | Go binary at `/opt/storyfi-deploy/storyfi-deploy` on VPS |
| Endpoint | `POST https://storyfi.izzysoft.com/deploy-api/deploy` |
| Health | `GET https://storyfi.izzysoft.com/deploy-api/health` |
| Auth | Bearer token in `Authorization` header |
| Flow | `git pull --rebase` → write files → `npm run build` → `git push` |
| Service | `systemctl status storyfi-deploy` |

**End-of-session workflow:**
1. Claude generates `storyfi-deploy.html` with all changed files baked in as base64
2. Open in browser → click Deploy
3. VPS writes files, builds, pushes to GitHub
4. Site goes live in ~30 seconds

---

## Project Structure

```
storyfi/
├── index.html
├── vite.config.js
├── public/
│   ├── manifest.json
│   └── icons/
└── src/
    ├── main.js
    ├── App.vue
    ├── views/
    │   ├── LibraryView.vue        — Project grid, version number (top-right)
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
    │   └── playback.js            — Transport, RAF loop, waveform, highlight sync, follow mode
    ├── composables/
    │   ├── usePanelLayout.js
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
- **VoiceTag** mark — highlights text with role colour
- **SegmentBreak** node — manual split point (§)
- BubbleMenu: role chips + ↗ Jump to Playlist + ✕ Remove
- Table support (`@tiptap/extension-table` family, pinned to 2.27.2)

### Auto-Tagging
- Scans document for `[LABEL]` patterns
- Case-insensitive match against cast roles
- Label-match fallback when roleIds are stale (new UUIDs after cast rebuild)
- Table cells excluded from tagging
- Reports unmatched labels as a toast

### Cast Panel
- Up to 10 roles per project
- Per-role: colour, label, TTS provider, voice picker with preview
- Language + gender filter pills (scrollable, max 3.5 rows)
- New character inherits provider from last cast member
- Drag-to-reorder roles

### Generation Pipeline
- Paragraph = segment; consecutive same-role paragraphs grouped
- Browser TTS fast-path (no API key, no blob, live SpeechSynthesis)
- Sentence-level checkboxes — Re-Generate or Delete individual sentences
- `regenerateSentences(ids)` — resets only selected, re-stitches group
- `deleteSentences(ids)` — removes sentences + untags editor ranges
- Orphaned role guard with label-match fallback

### Playback
- Web Audio API + SpeechSynthesis for browser groups
- Waveform canvas (`ctx.setTransform` — no scale drift)
- **seekToMs** — 3-way: playing (seek+play), paused (reposition only), stopped (set position)
- Cold scrub: loads from nearest group
- **Follow mode** — amber toggle in player bar; auto-expands group, scrolls active sentence
- Sentence-level highlight sync (`sentence-row--active`: amber left border)
- Browser TTS: `currentSentenceId` set per utterance for accurate highlight

### Workspace (Desktop)
- 3 dockable panels: Cast | Editor | Playlist
- Generate + Export buttons in Playlist panel drag bar
- Selection header: (N) count, total time, ↺ Re-Generate, ✕ Delete
- ↗ Jump to Playlist button in BubbleMenu

### Mobile UI
- Full-screen panels with bottom tab bar: Cast | Edit | Play
- Follow mode auto-expands and scrolls on mobile too

---

## Architecture Notes

### Timing write-back (critical)
`maybeStitchGroup` writes `startMs`/`endMs` to BOTH `sentences.value[id]` (flat lookup)
AND `group.sentences[i]` (array objects). `_syncHighlight` reads from `group.sentences[i]`.
Both must be kept in sync or highlight jumps to the last sentence.

### Browser TTS highlight
`speakNext()` sets `currentSentenceId = sentence.id` and re-anchors `_startedAtCtx`
at each utterance boundary. No time-based guessing needed.

### onAutoTag MUST be async
`store.addRole()` reads from IndexedDB (async). `onAutoTag` must `await` every
`addRole` call and `await nextTick()` before running `applyAutoTag`.
Without this: "No [LABEL] patterns found" fires immediately after "Added N cast members".

---

## Known Limitations / Backlog

- Mobile: File System Access API not available on iOS
- Google Drive integration (requires Cloudflare Worker proxy)
- Scene/Act/Chapter hierarchy
- Auto-scroll teleprompter during playback
- Pause/resume mid-sentence not reliable for browser TTS (SpeechSynthesis limitation)

---

## Development Notes

See `SNAPSHOT.md` for full session-by-session implementation history, bug fixes, and architecture decisions. Start every Claude session by attaching `SNAPSHOT.md` + a zip of the latest source.

**Session start ritual:**
```bash
cd /tmp && unzip -o /mnt/user-data/uploads/Storyfi_vX_X.zip -d /tmp/storyfi/
```
Extract ONCE. Work in place. Never re-extract individual files mid-session.
