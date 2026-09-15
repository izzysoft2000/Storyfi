![Demo App](images/Animation.gif)

# Storyfi

**Multi-voice audio production from Markdown — browser-native PWA.**

Storyfi transforms a script written in Markdown into a fully produced, multi-character audio file. Each paragraph of dialogue is assigned to a voice role, sent to a TTS engine, and stitched into a single gapless MP3 — all in the browser, no server required.

Current version: **v3.2.8**
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
    │   ├── SolutionsView.vue      — Solution grid, version number, new-Solution flow
    │   ├── ProjectsView.vue       — Projects within one Solution, reorder, Compile Book
    │   └── EditorView.vue         — Desktop dockable workspace + Mobile layout
    ├── panels/
    │   ├── CastPanel.vue          — Role CRUD, voice picker, Auto-tag button
    │   └── PlaylistPane.vue       — Sentence rows, checkboxes, follow mode, player bar
    ├── editor/
    │   ├── StoryEditor.vue        — Tiptap editor, BubbleMenu, MD import, decorations
    │   ├── autoTagger.js          — [LABEL] pattern scanner → tagging operations queue
    │   ├── splitter.js            — Sentence extraction, extractTaggedSpans()
    │   ├── splitBrParagraphs.js   — Splits <br>-joined import paragraphs into separate <p>s
    │   └── extensions/
    │       ├── VoiceTag.js        — Custom Mark: role colour highlights
    │       ├── SegmentBreak.js    — Custom Node: manual segment break (§)
    │       └── PermissiveEmphasis.js — Bold/Italic with punctuation-tolerant input rules
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
- ProjectsView's header reuses the Editor's `ws-toolbar` nav bar language: back arrow (left), Solution title click-to-rename inline (center), theme toggle (right) — same visual system across both screens
- Below 600px, the title switches from the desktop grid's fixed-width boxed input to the Editor's mobile treatment: the title flexes to fill the row and the rename input becomes an underline instead of a boxed field (`@media (max-width: 600px)` in ProjectsView.vue, mirroring EditorView's `.m-title`/`.m-title-input`)
- Deleting a Solution cascades to delete its member Projects (and their audio) — there's no "unlink to standalone" limbo to land in

### Editor
- Tiptap v2 rich text editor with Markdown import — imports with `breaks: true`, then `splitParagraphsOnBr()` (`editor/splitBrParagraphs.js`) splits any resulting `<br>`-joined paragraph into separate `<p>`s, one per source line. Without this, a script written with single line breaks and no blank lines between them (the common case) gets merged into one paragraph by CommonMark's default rules, which breaks Auto-Tag's per-paragraph stage-direction detection below. Tables/lists are untouched — they're separate DOM structures from marked's block-level parsing regardless of `breaks`.
- **VoiceTag** mark — highlights text with role colour (pill style: left-border + bg tint)
- **Comment** mark (`editor/extensions/Comment.js`) — marks a whole paragraph/line as "seen but never voiced" (production notes, meta markers like `— End of Episode 1 —`), without relying on the italic-stage-direction heuristic to guess right. Renders as muted gray text. Mutually exclusive with VoiceTag — applying either always clears the other on that range (`excludes` on both marks, enforced bidirectionally by ProseMirror). Only ever applies to whole paragraphs, never a partial span: the BubbleMenu/mobile "💬 Comment" action always expands the selection out to the full textblock(s) it touches before applying the mark. Comment-marked text is excluded from Playlist/segment generation exactly like plain untagged text.
- **SegmentBreak** node — manual split point (§)
- BubbleMenu: role chips + 💬 Comment + ↗ Jump to Playlist + ✕ Remove (removes whichever of VoiceTag/Comment is active)
- Table support (`@tiptap/extension-table` family, pinned to 2.27.2)
- **PermissiveBold/PermissiveItalic** (`editor/extensions/PermissiveEmphasis.js`) — override Tiptap's stock `**`/`*`/`__`/`_` input rules, which only trigger after whitespace or start-of-line. A lookbehind also accepts common leading punctuation (`"'"‘([{-–—`) so bold/italic typed right inside a quote mark (`"**Wait.**" she said.`) actually applies instead of silently never triggering.

### Auto-Tagging
- Scans document for `[LABEL]` patterns
- Section-ownership model — `pendingRole` carries across paragraphs until next label
- Creates missing cast members from unmatched labels
- **Full stage-direction paragraphs** (a paragraph that is entirely one italic run, e.g. `*He turns away.*`) auto-tag to **Narrator** instead of being skipped — creates the Narrator role first if the cast doesn't have one. `pendingRole` is left untouched, since a direction doesn't change who's speaking next.
- **Inline italic emphasis** mixed into an otherwise plain paragraph (e.g. `I *really* mean it.`) is tagged the same as the surrounding text, not silently dropped — only a *whole* italic paragraph counts as a stage direction
- **`[COMMENT]`** is a reserved label, used exactly like a role label (`[JOSE]`) but never added to the cast — everything from a `[COMMENT]` label until the next `[LABEL]` is marked with the Comment mark instead of voiced. This always wins over the full-italic-stage-direction heuristic, so a meta marker like `*— End of Episode 1 —*` can be explicitly excluded instead of being guessed at.
- Table cells excluded from scanning
- Reports unmatched labels as a toast
- **No `[LABEL]`s found** → prompts to tag the entire script as Narrator in one click (single-voice narration, PocketFM-style)
- **Voice inheritance** — any cast role newly created by Auto-Tag (including both Narrator paths above) silently reuses a matching-label role's voice from up to 8 of the current Solution's most-recently-updated other Projects, if one exists and has a voice picked. Never overwrites a voice the user already set.

### Cast Panel
- Up to 10 roles per project
- Per-role: colour, label, TTS provider, voice picker with preview
- Language + gender filter pills; drag-to-reorder roles
- Per-role MiniMax model selector (all 8 models) + emotion, speed, pitch, volume
- New Project's 3 default cast members (Narrator/Actor 1/Actor 2) read the Settings default provider (`activeProvider`), not a hardcoded MiniMax — matches how `addRole()` already inherited it for roles added later

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

### Silent SW auto-update can race an in-flight IndexedDB write
`App.vue` reloads the page as soon as a new build is detected (see §12/PWA lifecycle) — but reloading closes the IndexedDB connection, and a `db.put`/`transaction` call caught mid-flight throws `InvalidStateError: The database connection is closing`, which reads as "can't create a Solution/Project" with no obvious cause. `db.js` tracks in-flight writes (`hasPendingWrites()`, wrapping every write function in `withWrite()`); `App.vue`'s update watcher polls it (5s cap) before calling `updateServiceWorker(true)`. Any new write function added to `db.js` needs the same `withWrite()` wrapper or this protection silently stops covering it. `getDB()` also resets its cached connection via `openDB`'s `terminated` callback, so a connection that dies for any other reason self-heals on the next call instead of failing forever.

### App icon changes need a manual cache-bust
`public/manifest.json`'s icon `src`s and `index.html`'s `<link rel="icon">`/`apple-touch-icon` carry a `?v=X.X.X` query tied to `package.json`'s version — bump all three together whenever `public/icons/*.png` changes. Workbox precaches the bare file path, so the query isn't for the service worker; it's so installed PWA shortcuts actually notice the icon changed. Windows in particular snapshots the icon into a shell-cached `.ico` at install time and won't refresh it on a plain uninstall/reinstall — a version-bumped URL is the only lever available from the app side. Even then, a truly stuck OS icon cache may need `ie4uinit.exe -show` or an Explorer restart on the user's end.

---

## Known Limitations / Backlog

- iOS: File System Access API unavailable — falls back to ZIP export
- MiniMax API requires a CORS proxy for browser calls (Cloudflare Worker planned)
- Google Drive integration (requires Worker for OAuth token exchange)
- SRT/VTT subtitle export
- `book.json` (Compile Book) has no sentence-level text/timing yet — only paragraph-group level, since raw Project records don't store sentence text
- Solution export as `.epub`/eBook — text-only (chapters from each Project's content), no audio; would reuse `jszip` and need a headless ProseMirror/Tiptap serializer (schema + `DOMSerializer`, no mounted editor) to turn stored `editorState` into chapter HTML
