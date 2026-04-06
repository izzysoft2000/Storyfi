# Storyfi — Phase 1 Scaffold

Multi-voice audio production from Markdown. Progressive Web App.

## Quick Start

```bash
npm install
npm run dev
```

Then open http://localhost:5173

## Build for production

```bash
npm run build
npm run preview
```

## Phase 1 — What's included

- ✅ Vite + Vue 3 + Pinia project setup
- ✅ PWA manifest + Workbox service worker (via `vite-plugin-pwa`)
- ✅ IndexedDB schema (6 stores: projects, sentences, audio_sentences, audio_stitched, api_keys, settings)
- ✅ File System Access API utilities (folder picker, permission, read/write)
- ✅ StorageManager API (quota display, persistent storage request)
- ✅ Library screen (create, list, open, delete, clear audio per project)
- ✅ Editor screen shell (three-panel layout: sidebar | editor | playlist)
- ✅ Hash-based routing (`/#/project/:id`)
- ✅ Pinia project store with auto-save (debounced 2s)
- ✅ Toast notification system
- ✅ Confirm modal (reusable)
- ✅ StorageBar with progressive quota warnings
- ✅ Design system: dark cinematic theme, Playfair Display + DM Sans + JetBrains Mono

## Coming in Phase 2 — Editor & Tagging

- Tiptap v2 editor integration + Markdown import
- `VoiceTag` custom Mark extension
- `SegmentBreak` custom Node (manual segment break marker)
- Floating toolbar on text selection (role picker + break button)
- Cast panel: role CRUD, colour picker, editable names

## Project Structure

```
src/
├── main.js              — Vue app entry, Pinia init
├── App.vue              — Root component, hash router, global CSS tokens
├── store/
│   ├── db.js            — IndexedDB (idb) schema + all data helpers
│   └── project.js       — Pinia store: active project state + mutations
├── storage/
│   ├── quota.js         — StorageManager API (quota info, persist, formatBytes)
│   └── filesystem.js    — File System Access API (folder picker, read, write)
├── utils/
│   ├── uuid.js          — crypto.randomUUID() wrapper
│   ├── debounce.js      — Debounce utility
│   └── colors.js        — Default role colours + nextRoleColor() + hexAlpha()
├── components/
│   ├── StorageBar.vue   — Quota bar with warnings (used in Library + Sidebar)
│   ├── Toast.vue        — Global toast notifications
│   └── ConfirmModal.vue — Reusable confirm dialog
└── views/
    ├── LibraryView.vue  — Project list, create, import MD, delete, clear audio
    └── EditorView.vue   — Three-panel shell (editor + playlist stubs for Phase 2+)
```

## Design Tokens (CSS custom properties)

| Token | Value | Use |
|---|---|---|
| `--color-bg` | `#0e0c18` | Page background |
| `--color-surface` | `#1a1625` | Panels, cards |
| `--color-border` | `#2e2a42` | Borders, dividers |
| `--color-accent` | `#7c5cbf` | Primary actions |
| `--color-highlight` | `#c084fc` | Hover accent |
| `--color-text` | `#f0eeff` | Primary text |
| `--color-text-muted` | `#8b85a8` | Secondary text |
| `--font-display` | Playfair Display | Titles, project names |
| `--font-ui` | DM Sans | All UI chrome |
| `--font-mono` | JetBrains Mono | Timestamps, metadata |

## Architecture Decisions

All decisions are documented in `CLAUDE.md` (see project root).
Key decisions for this phase:
- **Framework**: Vue 3, Composition API, `<script setup>`
- **State**: Pinia (project store) — auto-save debounced 2s
- **Routing**: Hash-based (`/#/project/:id`) — no vue-router
- **Storage**: IndexedDB via `idb` + File System Access API (hybrid)
- **PWA**: Workbox via `vite-plugin-pwa`, `generateSW` strategy
