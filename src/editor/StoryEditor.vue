<template>
  <div class="story-editor">

    <!-- Toolbar -->
    <div class="editor-toolbar">
      <div class="editor-toolbar__left">
        <button class="tb-btn" title="Import Markdown" @click="triggerImport">
          ↑ Import .md
        </button>
        <div class="tb-divider" />
        <button class="tb-btn" :class="{ active: editor?.isActive('bold') }"
          title="Bold (Ctrl+B)" @click="editor?.chain().focus().toggleBold().run()">
          <b>B</b>
        </button>
        <button class="tb-btn" :class="{ active: editor?.isActive('italic') }"
          title="Italic (Ctrl+I)" @click="editor?.chain().focus().toggleItalic().run()">
          <i>I</i>
        </button>
        <div class="tb-divider" />
        <button
          class="tb-btn tb-btn--break"
          title="Insert Segment Break (Ctrl+Shift+Enter)"
          @click="editor?.chain().focus().insertSegmentBreak().run()"
        >§ Break</button>
      </div>
      <div class="editor-toolbar__right">
        <span class="char-count">
          {{ charCount }} chars
        </span>
      </div>
    </div>

    <!-- Bubble Menu — appears on text selection -->
    <BubbleMenu
      v-if="editor"
      :editor="editor"
      :tippy-options="{ duration: 120, placement: 'top-start', offset: [0, 8] }"
      :should-show="shouldShowBubble"
      class="bubble-menu"
    >
      <div class="bubble-menu__inner">
        <span class="bubble-menu__label">Tag as:</span>

        <!-- Role chips -->
        <button
          v-for="role in cast"
          :key="role.id"
          class="role-chip"
          :class="{ 'role-chip--active': editor.isActive('voiceTag', { roleId: role.id }) }"
          :style="{
            '--role-color': role.color,
            borderColor: role.color,
            background: editor.isActive('voiceTag', { roleId: role.id })
              ? role.color
              : 'transparent'
          }"
          :title="`Tag as ${role.label}`"
          @mousedown.prevent="applyVoiceTag(role)"
        >
          {{ role.label }}
        </button>

        <!-- Remove tag (only shown if selection is already tagged) -->
        <button
          v-if="selectionIsTagged"
          class="role-chip role-chip--remove"
          title="Remove voice tag"
          @mousedown.prevent="editor.chain().focus().unsetVoiceTag().run()"
        >✕ Remove</button>

        <div class="bubble-divider" />

        <!-- Segment break -->
        <button
          class="bubble-break"
          title="Insert Segment Break here (Ctrl+Shift+Enter)"
          @mousedown.prevent="editor.chain().focus().insertSegmentBreak().run()"
        >§</button>
      </div>
    </BubbleMenu>

    <!-- Editor Content -->
    <div class="editor-scroll">
      <EditorContent :editor="editor" class="editor-content" />
    </div>

    <!-- Hidden file input for MD import -->
    <input
      ref="mdFileInput"
      type="file"
      accept=".md,.markdown,text/markdown"
      style="display:none"
      @change="onMdFile"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { useEditor, EditorContent, BubbleMenu } from '@tiptap/vue-3'
import { Extension }    from '@tiptap/core'
import StarterKit   from '@tiptap/starter-kit'
import Placeholder  from '@tiptap/extension-placeholder'
import { VoiceTag }     from './extensions/VoiceTag.js'
import { SegmentBreak } from './extensions/SegmentBreak.js'
import { marked }       from 'marked'
import { debounce }     from '@/utils/debounce.js'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

// ─── Playback highlight plugin ─────────────────────────────────────────────────
// Drives transient ProseMirror decorations during audio playback.
// State is set via setMeta() — never written to the Tiptap document, so it
// never triggers the debounced auto-save. Cleared on stop/pause/end.

const playbackHighlightKey = new PluginKey('playbackHighlight')

const playbackHighlightPlugin = new Plugin({
  key: playbackHighlightKey,

  state: {
    init: () => ({ from: null, to: null, type: null }),
    apply(tr, prev) {
      const meta = tr.getMeta(playbackHighlightKey)
      // meta === undefined  → normal transaction, no highlight change
      // meta === null       → explicit clear
      // meta === { from, to, type } → new highlight
      if (meta !== undefined) {
        return meta ?? { from: null, to: null, type: null }
      }
      // Map existing positions through any document changes so decorations don't drift
      if (prev.from != null && tr.docChanged) {
        return { ...prev, from: tr.mapping.map(prev.from), to: tr.mapping.map(prev.to) }
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
      return DecorationSet.create(state.doc, [Decoration.inline(from, to, { class: cls })])
    },
  },
})

// ─── Props & Emits ────────────────────────────────────────────────────────────
const props = defineProps({
  modelValue:   { type: [Object, String], default: null }, // saved editor JSON
  cast:         { type: Array,  default: () => [] },        // VoiceRole[]
  charLimit:    { type: Number, default: 250 },
})

const emit = defineEmits([
  'update:modelValue',  // serialised JSON doc on every change
  'import-markdown',    // emitted with raw MD string after file import
])

// ─── Editor setup ─────────────────────────────────────────────────────────────
const mdFileInput = ref(null)

const editor = useEditor({
  extensions: [
    StarterKit.configure({
      // Disable history for now — will add undo/redo in a later phase
      history: { depth: 50 },
    }),
    Placeholder.configure({
      placeholder: 'Import a Markdown file or start typing your script here.\n\nSelect text to assign a voice role.',
      emptyNodeClass: 'is-editor-empty',
    }),
    VoiceTag,
    SegmentBreak,
    Extension.create({
      name: 'playbackHighlight',
      addProseMirrorPlugins: () => [playbackHighlightPlugin],
    }),
  ],

  content: props.modelValue ?? '',

  onUpdate: ({ editor }) => {
    debouncedEmit(editor.getJSON())
  },

  editorProps: {
    attributes: {
      class: 'prose-editor',
      spellcheck: 'true',
    },
  },
})

// Debounced emit so we don't hammer the store on every keystroke
const debouncedEmit = debounce(json => emit('update:modelValue', json), 800)

// Sync if parent passes new content (e.g. on project load)
watch(() => props.modelValue, val => {
  if (!editor.value || !val) return
  const current = editor.value.getJSON()
  if (JSON.stringify(current) !== JSON.stringify(val)) {
    editor.value.commands.setContent(val, false)
  }
}, { deep: true })

onBeforeUnmount(() => editor.value?.destroy())

// ─── Character count ──────────────────────────────────────────────────────────
const charCount = computed(() =>
  editor.value?.storage.characterCount?.characters() ?? 0
)

// ─── Bubble menu logic ────────────────────────────────────────────────────────
const selectionIsTagged = computed(() =>
  editor.value?.isActive('voiceTag') ?? false
)

function shouldShowBubble({ from, to }) {
  return from !== to // show whenever text is selected
}

function applyVoiceTag(role) {
  editor.value
    ?.chain()
    .focus()
    .setVoiceTag({ roleId: role.id, roleLabel: role.label, color: role.color })
    .run()
}

// ─── Markdown import ──────────────────────────────────────────────────────────
function triggerImport() {
  mdFileInput.value.value = ''
  mdFileInput.value.click()
}

function onMdFile(e) {
  const file = e.target.files[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = ev => {
    const raw  = ev.target.result
    const html = marked.parse(raw, { gfm: true, breaks: false })
    editor.value?.commands.setContent(html, true)
    emit('import-markdown', raw)
  }
  reader.readAsText(file)
}

// ─── Expose to parent ─────────────────────────────────────────────────────────
defineExpose({
  /** Set content from a JSON snapshot */
  setContent: (json) => editor.value?.commands.setContent(json, false),

  /** Import raw Markdown string programmatically */
  importMarkdown: (md) => {
    const html = marked.parse(md, { gfm: true, breaks: false })
    editor.value?.commands.setContent(html, true)
  },

  /** Highlight a word range via ProseMirror decoration (Phase 4 — MiniMax word timings) */
  highlightWord(from, to) {
    if (!editor.value?.view) return
    editor.value.view.dispatch(
      editor.value.state.tr.setMeta(playbackHighlightKey, { from, to, type: 'word' })
    )
  },

  /** Highlight a full sentence range via ProseMirror decoration (Phase 4 — OpenAI fallback) */
  highlightSentence(from, to) {
    if (!editor.value?.view) return
    editor.value.view.dispatch(
      editor.value.state.tr.setMeta(playbackHighlightKey, { from, to, type: 'sentence' })
    )
  },

  /** Clear any active playback highlight */
  clearHighlight() {
    if (!editor.value?.view) return
    editor.value.view.dispatch(
      editor.value.state.tr.setMeta(playbackHighlightKey, null)
    )
  },

  /** Expose the raw Tiptap editor for word-position computation in playback store */
  getEditor: () => editor.value ?? null,

  /** Get the raw ProseMirror doc for generation pipeline */
  getDoc: () => editor.value?.state.doc,

  /** Get serialised JSON */
  getJSON: () => editor.value?.getJSON(),
})
</script>

<style>
/* ─── Segment Break render (global — inside .ProseMirror) ─── */
.segment-break {
  display: inline-block;
  width: 100%;
  height: 0;
  border-top: 1px dashed rgba(124, 92, 191, 0.5);
  margin: 6px 0;
  position: relative;
  vertical-align: middle;
}

.segment-break::after {
  content: '§';
  position: absolute;
  right: 0;
  top: -10px;
  font-size: 10px;
  color: rgba(124, 92, 191, 0.6);
  font-family: var(--font-mono);
  background: var(--color-bg);
  padding: 0 4px;
}

/* Selected segment break */
.ProseMirror .segment-break.ProseMirror-selectednode {
  border-top-color: var(--color-highlight);
  outline: none;
}

/* Editor placeholder */
.ProseMirror .is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  float: left;
  color: var(--color-text-muted);
  pointer-events: none;
  height: 0;
  opacity: 0.5;
  font-style: italic;
  white-space: pre-line;
}

/* ─── Playback highlight decorations ─────────────────────── */
/* These are ProseMirror inline decorations injected by the playback store.
   Must live in an unscoped <style> block — they are not Vue-owned DOM. */

/* Sentence-level: soft purple wash matching the accent palette */
.playback-highlight--sentence {
  background-color: rgba(124, 92, 191, 0.22);
  border-radius: 2px;
}

/* Word-level: gold underline + warm tint — visually distinct from sentence */
.playback-highlight--word {
  background-color: rgba(251, 191, 36, 0.22);
  border-bottom: 2px solid rgba(251, 191, 36, 0.80);
  border-radius: 2px 2px 0 0;
}
</style>

<style scoped>
/* ─── Shell ──────────────────────────────────────────────── */
.story-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* ─── Toolbar ────────────────────────────────────────────── */
.editor-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 16px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
  flex-shrink: 0;
  gap: 8px;
}

.editor-toolbar__left,
.editor-toolbar__right {
  display: flex;
  align-items: center;
  gap: 4px;
}

.tb-btn {
  background: none;
  border: 1px solid transparent;
  border-radius: 5px;
  color: var(--color-text-muted);
  font-size: 12px;
  font-family: var(--font-ui);
  padding: 4px 10px;
  cursor: pointer;
  transition: all 0.12s;
  white-space: nowrap;
}
.tb-btn:hover        { background: var(--color-border); color: var(--color-text) }
.tb-btn.active       { background: rgba(124,92,191,0.2); border-color: var(--color-accent); color: var(--color-accent) }
.tb-btn--break       { border-color: var(--color-border); color: var(--color-accent) }
.tb-btn--break:hover { background: rgba(124,92,191,0.15); border-color: var(--color-accent) }

.tb-divider {
  width: 1px;
  height: 18px;
  background: var(--color-border);
  margin: 0 4px;
}

.char-count {
  font-size: 11px;
  font-family: var(--font-mono);
  color: var(--color-text-muted);
  opacity: 0.6;
}

/* ─── Bubble Menu ────────────────────────────────────────── */
.bubble-menu {
  z-index: 50;
}

.bubble-menu__inner {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 10px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.4);
  backdrop-filter: blur(8px);
}

.bubble-menu__label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-text-muted);
  margin-right: 2px;
  white-space: nowrap;
}

.role-chip {
  padding: 3px 10px;
  border-radius: 20px;
  border: 1px solid;
  font-size: 11px;
  font-weight: 500;
  font-family: var(--font-ui);
  cursor: pointer;
  color: var(--role-color, #6B7FD4);
  transition: all 0.12s;
  white-space: nowrap;
}
.role-chip:hover       { opacity: 0.85; transform: scale(1.04) }
.role-chip--active     { color: #fff !important }
.role-chip--remove {
  border-color: var(--color-error) !important;
  color: var(--color-error) !important;
  background: transparent !important;
}
.role-chip--remove:hover { background: rgba(248,113,113,0.15) !important }

.bubble-divider {
  width: 1px;
  height: 16px;
  background: var(--color-border);
  margin: 0 2px;
}

.bubble-break {
  background: none;
  border: 1px solid rgba(124,92,191,0.4);
  border-radius: 5px;
  color: var(--color-accent);
  font-size: 12px;
  font-family: var(--font-mono);
  padding: 3px 8px;
  cursor: pointer;
  transition: all 0.12s;
}
.bubble-break:hover { background: rgba(124,92,191,0.15) }

/* ─── Editor Scroll Area ─────────────────────────────────── */
.editor-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 32px 48px;
}

/* ─── ProseMirror prose styles ───────────────────────────── */
:deep(.prose-editor) {
  outline: none;
  min-height: 100%;
  font-family: var(--font-ui);
  font-size: 15px;
  line-height: 1.8;
  color: var(--color-text);
  caret-color: var(--color-accent);
  max-width: 720px;
  margin: 0 auto;
}

:deep(.prose-editor) h1 {
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 700;
  color: var(--color-text);
  margin: 0 0 20px;
  line-height: 1.3;
}

:deep(.prose-editor) h2 {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 600;
  color: var(--color-text);
  margin: 28px 0 14px;
  line-height: 1.35;
}

:deep(.prose-editor) h3 {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-muted);
  margin: 22px 0 10px;
}

:deep(.prose-editor) p {
  margin: 0 0 14px;
  color: var(--color-text);
}

:deep(.prose-editor) p:last-child { margin-bottom: 0 }

:deep(.prose-editor) blockquote {
  border-left: 3px solid var(--color-accent);
  padding-left: 16px;
  margin: 16px 0;
  color: var(--color-text-muted);
  font-style: italic;
}

:deep(.prose-editor) code {
  font-family: var(--font-mono);
  font-size: 13px;
  background: var(--color-border);
  padding: 2px 6px;
  border-radius: 3px;
  color: var(--color-highlight);
}

:deep(.prose-editor) strong { color: var(--color-text); font-weight: 600 }
:deep(.prose-editor) em     { color: var(--color-text-muted) }

:deep(.prose-editor) hr {
  border: none;
  border-top: 1px solid var(--color-border);
  margin: 24px 0;
}

/* Untagged text is just normal — the absence of highlight IS the annotation style */
/* Tagged text gets its style from VoiceTag.renderHTML inline styles */
</style>
