<template>
  <div class="editor-shell" v-if="!store.isLoading">
    <aside class="sidebar">
      <div class="sidebar__top">
        <button class="lib-link" @click="goLibrary">← Library</button>
        <div v-if="!editingTitle" class="sidebar__project-name" @click="startEditTitle">
          {{ store.projectTitle }}
        </div>
        <input v-else ref="titleInputRef" class="sidebar__title-input"
          :value="store.projectTitle" maxlength="80"
          @blur="commitTitle($event.target.value)"
          @keydown.enter="commitTitle($event.target.value)"
          @keydown.esc="editingTitle = false" />
      </div>
      <CastPanel @role-updated="onRoleUpdated" @role-deleted="onRoleDeleted" />
      <div class="sidebar__spacer" />
      <div class="sidebar__storage">
        <StorageBar @manage="showStorageManager = true" />
      </div>
      <div class="sidebar__save-status">
        <span v-if="store.isSaving" class="save-dot save-dot--saving">● Saving…</span>
        <span v-else-if="store.isDirty" class="save-dot save-dot--dirty">● Unsaved</span>
        <span v-else class="save-dot save-dot--ok">● Saved</span>
      </div>
    </aside>

    <main class="editor-pane">
      <StoryEditor ref="editorRef"
        :model-value="store.project?.editorState"
        :cast="store.cast"
        :char-limit="charLimit"
        @update:model-value="onEditorUpdate"
        @import-markdown="onMarkdownImported" />
    </main>

    <!-- Resize handle — listener attached via DOM ref in script -->
    <div ref="handleEl" class="resize-handle" />

    <!-- Playlist wrapper — width managed by direct DOM (no Vue reactive binding) -->
    <aside ref="wrapperEl" class="playlist-wrapper">
      <PlaylistPane
        :has-tagged-spans="taggedSpans.length > 0"
        :tagged-spans="taggedSpans"
        @generate="onGenerate"
        @regenerate-group="onRegenerateGroup"
        @open-settings="settingsRef?.open()"
        @export="onExport"
      />
    </aside>

    <FolderPromptModal ref="folderPromptRef" />
    <SettingsModal ref="settingsRef" @saved="onProviderSaved" />
    <SyncWarningModal ref="syncWarningRef" />
    <ExportModal ref="exportModalRef" />
    <Toast ref="toastRef" />
  </div>

  <div v-else class="editor-loading">
    <div class="spinner">⟳</div>
    <span>Loading project…</span>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useProjectStore }    from '@/store/project.js'
import { useGenerationStore } from '@/store/generation.js'
import { usePlaybackStore }   from '@/store/playback.js'
import { getSetting }         from '@/store/db.js'
import { registerProvider }   from '@/tts/provider.js'
import { minimaxProvider }    from '@/tts/minimax.js'
import { openaiProvider }     from '@/tts/openai.js'
import { browserProvider }    from '@/tts/browser.js'
import StoryEditor            from '@/editor/StoryEditor.vue'
import CastPanel              from '@/panels/CastPanel.vue'
import PlaylistPane           from '@/panels/PlaylistPane.vue'
import StorageBar             from '@/components/StorageBar.vue'
import Toast                  from '@/components/Toast.vue'
import FolderPromptModal      from '@/modals/FolderPromptModal.vue'
import SettingsModal          from '@/modals/SettingsModal.vue'
import SyncWarningModal       from '@/modals/SyncWarningModal.vue'
import { syncCheckOnOpen }    from '@/storage/synccheck.js'
import { extractTaggedSpans } from '@/editor/splitter.js'
import ExportModal            from '@/modals/ExportModal.vue'

// Register providers once
registerProvider(minimaxProvider)
registerProvider(openaiProvider)
registerProvider(browserProvider)

const props = defineProps({ projectId: String })
const emit  = defineEmits(['go-library'])

const store       = useProjectStore()
const gen         = useGenerationStore()
const playback    = usePlaybackStore()
const toastRef    = ref(null)
const editorRef   = ref(null)
const folderPromptRef = ref(null)
const settingsRef = ref(null)
const syncWarningRef = ref(null)
const exportModalRef = ref(null)
const editingTitle   = ref(false)
const titleInputRef  = ref(null)
const charLimit      = ref(250)
const showStorageManager = ref(false)
const activeProvider = ref('minimax')

// ─── Resizable playlist pane — pure DOM, no reactive state ───────────────────
const handleEl      = ref(null)
const wrapperEl     = ref(null)
let _playlistWidth = 300
let _resizing = false, _startX = 0, _startW = 0

function applyWidth(w) {
  _playlistWidth = w
  if (wrapperEl.value) wrapperEl.value.style.flexBasis = w + 'px'
}

function onHandleMousedown(e) {
  e.preventDefault()
  _resizing = true
  _startX   = e.clientX
  _startW   = _playlistWidth
  document.body.style.cursor           = 'col-resize'
  document.body.style.userSelect       = 'none'
  document.body.style.webkitUserSelect = 'none'
  window.addEventListener('mousemove', onResize)
  window.addEventListener('mouseup',   stopResize)
}

function onResize(e) {
  if (!_resizing) return
  const delta = _startX - e.clientX
  applyWidth(Math.max(180, Math.min(600, _startW + delta)))
}

function stopResize() {
  if (!_resizing) return
  _resizing = false
  document.body.style.cursor           = ''
  document.body.style.userSelect       = ''
  document.body.style.webkitUserSelect = ''
  window.removeEventListener('mousemove', onResize)
  window.removeEventListener('mouseup',   stopResize)
  // No reactive update — DOM already has correct width, nothing for Vue to patch
}

// Set initial width and attach drag listener once element is available
watch(handleEl, el => {
  if (el) el.addEventListener('mousedown', onHandleMousedown, { passive: false })
})
watch(wrapperEl, el => {
  if (el) el.style.flexBasis = _playlistWidth + 'px'
})

const taggedSpans = computed(() => {
  const doc = editorRef.value?.getDoc?.()
  if (!doc) return []
  return extractTaggedSpans(doc)
})

onMounted(async () => {
  await store.loadProject(props.projectId)
  if (!store.project) { emit('go-library'); return }

  // Wire the editor component ref into the playback store so the RAF loop
  // can call highlightWord / highlightSentence / clearHighlight directly.
  // Must happen after loadProject so the editor DOM is mounted.
  await nextTick()
  playback.setEditorRef(editorRef.value)

  // Load active provider from settings
  const saved = await getSetting('activeProvider')
  if (saved) activeProvider.value = saved

  // Load generation state from project — wait for next tick so store is settled
  await nextTick()
  gen.loadFromProject()

  // Run sync check — detect disk vs IndexedDB divergences
  const syncReport = await syncCheckOnOpen(store.project)
  if (syncReport.hasDivergences) {
    gen.setDivergences(syncReport)
    await nextTick()
    const result = await syncWarningRef.value?.open(syncReport)
    // If user chose a repair action, clear resolved divergences
    if (result === 'rewritten' || result === 'reimported') {
      gen.clearAllDivergences()
    }
    // 'ignored' or 'marked' — divergences stay visible in playlist
  }

  if (store.project.sourceMarkdown && !store.project.editorState) {
    nextTick(() => editorRef.value?.importMarkdown(store.project.sourceMarkdown))
  }
})

onUnmounted(() => {
  if (store.isDirty) store.persistProject()
  store.closeProject()
  gen.reset()
  playback.stop()   // release AudioContext + cancel RAF loop before leaving project
  stopResize()
})

function onEditorUpdate(json) { store.setEditorState(json) }

function onMarkdownImported(raw) {
  if (store.project) { store.project.sourceMarkdown = raw; store.markDirty() }
  toastRef.value?.show('Markdown imported', 'success')
}

function startEditTitle() {
  editingTitle.value = true
  nextTick(() => { titleInputRef.value?.focus(); titleInputRef.value?.select() })
}
function commitTitle(val) {
  const t = val?.trim(); if (t) store.setTitle(t)
  editingTitle.value = false
}

function onRoleUpdated(roleId, updates) { /* Phase 4: cascade to marks */ }
function onRoleDeleted(roleId) {
  toastRef.value?.show('Role removed — re-tag any affected text.', 'warning', 4000)
}

function onProviderSaved(providerId) {
  activeProvider.value = providerId
  toastRef.value?.show('Settings saved', 'success')
}

async function onGenerate() {
  const doc = editorRef.value?.getDoc?.()
  if (!doc) { toastRef.value?.show('Editor not ready', 'warning'); return }

  if (taggedSpans.value.length === 0) {
    toastRef.value?.show('Tag some text first, then generate.', 'warning'); return
  }

  // Check if API key is set for active provider
  const { getApiKey } = await import('@/store/db.js')
  const keyRecord = await getApiKey(activeProvider.value)
  if (!keyRecord && activeProvider.value !== 'browser') {
    toastRef.value?.show(`No API key for ${activeProvider.value} — open ⚙ Settings first.`, 'warning', 5000)
    settingsRef.value?.open()
    return
  }

  try {
    await gen.generateAll({
      providerId:   activeProvider.value,
      charLimit:    charLimit.value,
      doc,
      onFolderPrompt: () => folderPromptRef.value?.open(),
    })

    const failed = gen.failCount
    if (failed > 0) {
      toastRef.value?.show(`Generated with ${failed} error${failed > 1 ? 's' : ''} — check playlist`, 'warning')
    } else {
      toastRef.value?.show('All audio generated!', 'success')
    }
  } catch (err) {
    toastRef.value?.show(err.message, 'error', 6000)
  }
}

async function onRegenerateGroup(groupId) {
  const doc = editorRef.value?.getDoc?.()
  if (!doc) { toastRef.value?.show('Editor not ready', 'warning'); return }
  try {
    await gen.regenerateGroup(groupId, {
      providerId: activeProvider.value,
      doc,
      onFolderPrompt: () => folderPromptRef.value?.open(),
    })
    toastRef.value?.show('Segment regenerated', 'success')
  } catch (err) {
    toastRef.value?.show(err.message, 'error', 6000)
  }
}

function onExport() {
  exportModalRef.value?.open()
}

function goLibrary() { emit('go-library') }
</script>

<style scoped>
/* ─── Root: flexbox instead of grid — reliable for resizable panels ─── */
.editor-shell {
  display: flex;
  flex-direction: row;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background: var(--color-bg);
}

/* Loading */
.editor-loading {
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 12px; height: 100vh;
  color: var(--color-text-muted); font-family: var(--font-ui);
}
.spinner { font-size: 24px; animation: spin 1.2s linear infinite }
@keyframes spin { to { transform: rotate(360deg) } }

/* ─── Sidebar ────────────────────────────────────────────── */
.sidebar {
  width: 230px;
  flex-shrink: 0;
  display: flex; flex-direction: column;
  border-right: 1px solid var(--color-border);
  background: var(--color-surface);
  overflow: hidden;
}

/* ─── Editor pane ────────────────────────────────────────── */
.editor-pane {
  flex: 1;
  min-width: 0;     /* prevent flex blowout */
  display: flex; flex-direction: column;
  overflow: hidden;
}

/* ─── Resize handle ──────────────────────────────────────── */
.resize-handle {
  flex-shrink: 0;
  width: 6px;
  cursor: col-resize;
  background: var(--color-border);
  transition: background 0.15s;
  position: relative;
  z-index: 20;
  /* Widen the hit area beyond the visual bar */
  touch-action: none;
}
.resize-handle:hover,
.resize-handle:active { background: var(--color-accent) }

/* Wider invisible grab area */
.resize-handle::before {
  content: '';
  position: absolute;
  top: 0; bottom: 0;
  left: -4px; right: -4px;
}

/* ─── Playlist wrapper ───────────────────────────────────── */
.playlist-wrapper {
  flex-shrink: 0;
  flex-grow: 0;
  flex-basis: 300px;  /* default — overridden by direct DOM style during/after resize */
  display: flex; flex-direction: column;
  overflow: hidden;
  border-left: 1px solid var(--color-border);
}

/* ─── Sidebar internals ──────────────────────────────────── */
.sidebar__top {
  padding: 14px 14px 10px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0; display: flex; flex-direction: column; gap: 6px;
}

.lib-link {
  background: none; border: none; color: var(--color-text-muted);
  font-size: 12px; font-family: var(--font-ui); cursor: pointer;
  padding: 0; text-align: left; transition: color 0.15s; width: fit-content;
}
.lib-link:hover { color: var(--color-accent) }

.sidebar__project-name {
  font-family: var(--font-display); font-size: 15px; font-weight: 600;
  color: var(--color-text); white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis;
  cursor: pointer; border-radius: 4px;
  padding: 2px 4px; margin: 0 -4px; transition: background 0.1s;
}
.sidebar__project-name:hover { background: var(--color-border) }

.sidebar__title-input {
  font-family: var(--font-display); font-size: 15px; font-weight: 600;
  color: var(--color-text); background: var(--color-border);
  border: 1px solid var(--color-accent); border-radius: 4px;
  padding: 2px 6px; outline: none; width: 100%;
}

.sidebar__spacer { flex: 1; min-height: 0 }

.sidebar__storage {
  padding: 8px 10px; border-top: 1px solid var(--color-border); flex-shrink: 0;
}

.sidebar__save-status {
  padding: 5px 14px 10px; font-size: 11px;
  font-family: var(--font-mono); flex-shrink: 0;
}
.save-dot           { color: var(--color-text-muted) }
.save-dot--saving,
.save-dot--dirty    { color: var(--color-warning) }
.save-dot--ok       { color: var(--color-success) }
</style>
