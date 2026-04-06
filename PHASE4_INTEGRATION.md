# Phase 4 — Integration Guide
# Changes needed in 3 existing files

================================================================================
## 1. src/editor/StoryEditor.vue
================================================================================

### A. Add these imports at the top of <script setup>

```javascript
// Add alongside existing @tiptap imports
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
```

### B. Define the plugin OUTSIDE the component (before the <script setup> block,
###    or at module scope inside <script setup> above the component logic).
###    Never inside useEditor() — the Plugin must be a stable object reference.

```javascript
// ─── Playback highlight plugin ─────────────────────────────────────────────
// Applies transient ProseMirror decorations during audio playback.
// State is driven by setMeta() — never persisted to Tiptap's document.

const playbackHighlightKey = new PluginKey('playbackHighlight')

const playbackHighlightPlugin = new Plugin({
  key: playbackHighlightKey,

  state: {
    // Default: no highlight
    init: () => ({ from: null, to: null, type: null }),

    apply(tr, prev) {
      // getMeta returns:
      //   { from, to, type }  — new highlight
      //   null                — clear highlight
      //   undefined           — no-op (normal doc changes)
      const meta = tr.getMeta(playbackHighlightKey)
      if (meta !== undefined) {
        return meta ?? { from: null, to: null, type: null }
      }
      // Map positions through any document changes so decorations don't drift
      if (prev.from != null && tr.docChanged) {
        return {
          ...prev,
          from: tr.mapping.map(prev.from),
          to:   tr.mapping.map(prev.to),
        }
      }
      return prev
    },
  },

  props: {
    decorations(state) {
      const { from, to, type } = this.getState(state)
      if (from == null || to == null || from >= to) return DecorationSet.empty

      const cls = type === 'word'
        ? 'playback-highlight playback-highlight--word'
        : 'playback-highlight playback-highlight--sentence'

      return DecorationSet.create(state.doc, [
        Decoration.inline(from, to, { class: cls }),
      ])
    },
  },
})
```

### C. Add playbackHighlightPlugin to the extensions array in useEditor()

```javascript
// Inside useEditor({ extensions: [ ... ] })
// Add at the END of the extensions array so it doesn't conflict with VoiceTag:
extensions: [
  // ... existing extensions (StarterKit, VoiceTag, SegmentBreak, etc.) ...
  // ADD:
  Extension.create({
    name: 'playbackHighlight',
    addProseMirrorPlugins() {
      return [playbackHighlightPlugin]
    },
  }),
],
```

NOTE: If you don't want to wrap it in Extension.create(), you can also pass it
via the editor's `editorProps.plugins` option — either works.

### D. Add expose methods (at the bottom of <script setup>, after editor is created)

```javascript
// ─── Playback highlight API (called by playback.js store) ─────────────────

function highlightWord(from, to) {
  if (!editor.value?.view) return
  editor.value.view.dispatch(
    editor.value.state.tr.setMeta(playbackHighlightKey, { from, to, type: 'word' })
  )
}

function highlightSentence(from, to) {
  if (!editor.value?.view) return
  editor.value.view.dispatch(
    editor.value.state.tr.setMeta(playbackHighlightKey, { from, to, type: 'sentence' })
  )
}

function clearHighlight() {
  if (!editor.value?.view) return
  editor.value.view.dispatch(
    editor.value.state.tr.setMeta(playbackHighlightKey, null)
  )
}

/** Provides access to the raw Tiptap editor for word-position computation */
function getEditor() {
  return editor.value ?? null
}

defineExpose({ highlightWord, highlightSentence, clearHighlight, getEditor })
```

### E. Add highlight CSS — must be UNSCOPED (decorations are outside Vue's scope)
###    Add a <style> block (no "scoped") alongside the existing <style scoped> block:

```css
/* Unscoped — applied to ProseMirror decoration class nodes */

/* Sentence-level: subtle tinted background matching role colour feel */
.playback-highlight--sentence {
  background-color: rgba(139, 92, 246, 0.20);
  border-radius: 2px;
  transition: background-color 0.1s;
}

/* Word-level: bright accent underline + light background */
.playback-highlight--word {
  background-color: rgba(251, 191, 36, 0.25);
  border-bottom: 2px solid rgba(251, 191, 36, 0.85);
  border-radius: 2px 2px 0 0;
  transition: background-color 0.05s;
}
```


================================================================================
## 2. src/panels/PlaylistPane.vue
================================================================================

### A. Add imports at top of <script setup>

```javascript
import { computed } from 'vue'          // if not already imported
import { usePlaybackStore } from '../store/playback.js'
import AudioPlayerBar from '../components/AudioPlayerBar.vue'
```

### B. Initialise the store

```javascript
const playback = usePlaybackStore()
```

### C. Add a computed for fast active-group/sentence lookup

```javascript
// Set of currently-playing groupIds for row highlighting
const activeGroupId = computed(() =>
  playback.isPlaying || playback.isPaused
    ? playback.groupOffsets[playback.currentGroupIdx]?.groupId ?? null
    : null
)
```

### D. Add ▶ button to each group row in the template
###    Find the group row element and add this button alongside the existing controls:

```html
<!-- Inside the group row, alongside any existing expand/status buttons -->
<button
  class="group-play-btn"
  :class="{ 'is-active': group.id === activeGroupId }"
  :disabled="group.stitchStatus !== 'ready'"
  :title="group.id === activeGroupId ? 'Playing' : 'Play from here'"
  @click.stop="onGroupPlay(group, index)"
>
  <!-- Animated bars when this group is active + playing -->
  <svg v-if="group.id === activeGroupId && playback.isPlaying"
       viewBox="0 0 12 12" fill="currentColor" class="play-icon-bars" aria-hidden="true">
    <rect x="1"  y="4" width="2" height="8" rx="1" class="bar bar--1"/>
    <rect x="5"  y="2" width="2" height="10" rx="1" class="bar bar--2"/>
    <rect x="9"  y="5" width="2" height="7" rx="1" class="bar bar--3"/>
  </svg>
  <!-- Static play triangle otherwise -->
  <svg v-else viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
    <path d="M3 2l7 4-7 4V2z"/>
  </svg>
</button>
```

### E. Add active row class to the group row element

```html
<!-- On the group row's root element, add: -->
:class="{ 'group-row--playing': group.id === activeGroupId }"
```

### F. Add handler in <script setup>

```javascript
function onGroupPlay(group, index) {
  if (group.stitchStatus !== 'ready') return

  // If already playing/paused, seek directly (buffers already loaded)
  if (playback.isPlaying || playback.isPaused) {
    playback.seekToGroup(index)
  } else {
    // Cold start — load all buffers and begin from this group
    // Access groups from the project store
    const { useProjectStore } = await import('../store/project.js')
    // ^ Wait — static imports only (Bug Fix #6). Use the prop instead:
    playback.loadAndPlay(props.groups, index)
  }
}
```

IMPORTANT: onGroupPlay must use the groups prop/computed from your component, not
a dynamic import. Replace the above with however your component accesses the groups
list (likely a prop from EditorView, or directly from useProjectStore().project.paragraphGroups).

Correct form (no dynamic import):

```javascript
// Assuming groups are available as a prop or local computed:
function onGroupPlay(group, groupIndex) {
  if (group.stitchStatus !== 'ready') return

  if (playback.isPlaying || playback.isPaused) {
    playback.seekToGroup(groupIndex)
  } else {
    playback.loadAndPlay(groups.value, groupIndex)  // groups = your local ref/prop
  }
}
```

### G. Dock AudioPlayerBar at the bottom of the pane template

The playlist pane's root element must be a flex column so AudioPlayerBar
naturally sinks to the bottom without any absolute positioning:

```html
<!-- PlaylistPane root element -->
<div class="playlist-pane">

  <!-- Scrollable list area — flex: 1 so it takes all available space -->
  <div class="playlist-scroll">
    <!-- ... all existing group rows ... -->
  </div>

  <!-- Player bar — always visible, docked at bottom -->
  <AudioPlayerBar :groups="groups" />

</div>
```

```css
/* In PlaylistPane.vue <style scoped> */
.playlist-pane {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;      /* prevent the outer pane from scrolling */
}

.playlist-scroll {
  flex: 1;
  overflow-y: auto;
  min-height: 0;         /* required for flex children to respect overflow */
}
```

### H. Add CSS for group play button and active row

```css
/* Group play button */
.group-play-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: none;
  border: 1px solid transparent;
  border-radius: 6px;
  color: var(--color-text-muted, rgba(255 255 255 / 0.4));
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}
.group-play-btn svg {
  width: 12px;
  height: 12px;
}
.group-play-btn:hover:not(:disabled) {
  color: var(--color-text, rgba(255 255 255 / 0.9));
  border-color: var(--color-border, rgba(255 255 255 / 0.15));
  background: var(--color-surface-hover, rgba(255 255 255 / 0.05));
}
.group-play-btn.is-active {
  color: var(--color-accent, #8b5cf6);
}
.group-play-btn:disabled {
  opacity: 0.25;
  cursor: not-allowed;
}

/* Active group row highlight */
.group-row--playing {
  background: var(--color-surface-active, rgba(139, 92, 246, 0.06));
  border-left: 2px solid var(--color-accent, #8b5cf6);
}

/* Animated playback bars (shown on active group while playing) */
.bar { transform-origin: bottom; }
.bar--1 { animation: bar-pulse 0.9s ease-in-out infinite; }
.bar--2 { animation: bar-pulse 0.9s ease-in-out infinite 0.2s; }
.bar--3 { animation: bar-pulse 0.9s ease-in-out infinite 0.4s; }
@keyframes bar-pulse {
  0%, 100% { transform: scaleY(0.5); }
  50%       { transform: scaleY(1); }
}
```


================================================================================
## 3. src/views/EditorView.vue
================================================================================

### A. Add imports at top of <script setup>

```javascript
import { ref, onMounted, watch } from 'vue'   // if not already fully imported
import { usePlaybackStore } from '../store/playback.js'
```

### B. Initialise the playback store

```javascript
const playback = usePlaybackStore()
```

### C. Add a template ref for the StoryEditor component

```javascript
const storyEditorRef = ref(null)
```

### D. Wire the editor ref into the playback store on mount

```javascript
onMounted(() => {
  if (storyEditorRef.value) {
    playback.setEditorRef(storyEditorRef.value)
  }
})
```

### E. Stop playback when leaving the project (navigating back to Library)

```javascript
// Call wherever you handle project unload / route change:
playback.stop()
// e.g. inside your existing onUnmounted() or in the hashchange handler
```

### F. Add the ref to the StoryEditor element in the template

```html
<!-- Find your <StoryEditor> element and add ref="storyEditorRef" -->
<StoryEditor
  ref="storyEditorRef"
  ... (existing props)
/>
```

================================================================================
## Summary of new files created
================================================================================

  src/store/playback.js          — Pinia store (new)
  src/components/AudioPlayerBar.vue — Player bar component (new)

## Files to modify

  src/editor/StoryEditor.vue     — Add highlight plugin + defineExpose
  src/panels/PlaylistPane.vue    — Add AudioPlayerBar + group play buttons
  src/views/EditorView.vue       — Wire storyEditorRef to playback store

================================================================================
## SNAPSHOT.md updates for end of this session
================================================================================

Phase 4 status changes:
  | 4 | Audio player (play all, seek, scrub)       | ✅ Complete |
  | 4 | Playback sync: word highlight (MiniMax)    | ✅ Complete |
  | 4 | Playback sync: sentence highlight (OpenAI) | ✅ Complete |

New files to add to Project Structure section:
  ├── src/store/playback.js          — Pinia: transport state, RAF loop, highlight sync
  └── src/components/AudioPlayerBar.vue — Player bar: play/pause, stop, progress scrub

New store section (playback.js):
  playback.js state:
    isPlaying, isPaused, isLoading, loadError
    currentGroupIdx, currentSentenceId
    currentMs, totalMs, groupOffsets[]

  Non-reactive module vars (Web Audio objects — never in Pinia state):
    _audioCtx, _buffers[], _source, _startedAtCtx,
    _segmentOffsetMs, _rafId, _groups, _wordPositionCache, _editorRef

  Key actions:
    loadAndPlay(groups, startGroupIdx)  — load IDB blobs, decode, start playback
    pause() / resume() / stop()
    seekToGroup(idx) / seekToMs(ms)
    setEditorRef(ref)                   — wired by EditorView on mount

New Bug Fix to add to SNAPSHOT Critical section:
  ### 8. AudioContext / AudioBuffer* — never in Pinia reactive state
  Same principle as Bug Fix #4 (DOM during drag). AudioContext and
  AudioBufferSourceNode must live in module-level variables. Vue Proxy
  wrapping causes them to silently malfunction (suspended state unreachable,
  onended callbacks lost). _audioCtx, _buffers, _source, etc. are all
  module-level `let` variables in playback.js.

  ### 9. Highlight decorations are transient — cleared on stop/pause
  playbackHighlightPlugin state is driven entirely by setMeta() calls.
  It is never written to the Tiptap document JSON and therefore never
  triggers auto-save. Cleared explicitly on pause/stop/end.
