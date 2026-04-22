<template>
  <div v-if="!store.isLoading">

  <!-- ══════════════════════════════════════════════════════════════════════
       MOBILE LAYOUT  (viewport < 768px)
       ══════════════════════════════════════════════════════════════════════ -->
  <div v-if="isMobile" class="m-workspace" :class="{ 'm-workspace--landscape': !isPortrait }">

    <!-- Top bar: back | title | settings -->
    <header class="m-toolbar">
      <button class="m-tb-btn" @click="goLibrary">←</button>
      <div v-if="!editingTitle" class="m-title" @click="startEditTitle">
        {{ store.projectTitle }}
      </div>
      <input
        v-else
        ref="titleInputRef"
        class="m-title-input"
        :value="store.projectTitle"
        maxlength="80"
        @blur="commitTitle($event.target.value)"
        @keydown.enter="commitTitle($event.target.value)"
        @keydown.esc="editingTitle = false"
      />
      <span v-if="!isOnline" class="m-status-globe m-status-globe--offline" title="Offline">🌐</span>
      <button class="m-tb-btn" @click="settingsRef?.open()">⚙</button>
    </header>

    <!-- Swipeable panel track: Cast (0) | Editor (1) | Playlist (2) -->
    <div
      class="m-panels"
      @touchstart.passive="onTouchStart"
      @touchmove="onTouchMove"
      @touchend.passive="onTouchEnd"
    >
      <div class="m-panels__track" :style="trackStyle">

        <!-- ── Cast panel ── -->
        <div class="m-panel">
          <div class="m-panel-toolbar">
            <span class="m-panel-title">VOICE CAST</span>
            <span class="m-panel-badge">{{ store.cast.length }}/10</span>
          </div>
          <div class="m-panel-body">
            <CastPanel
              @role-updated="onRoleUpdated"
              @role-deleted="onRoleDeleted"
              @auto-tag="onAutoTag"
            />
          </div>
        </div>

        <!-- ── Editor panel ── -->
        <div class="m-panel">

          <!-- Tag mode toolbar (default) -->
          <div v-if="mobileTagMode" class="m-panel-toolbar m-panel-toolbar--tagmode">
            <button
              class="m-mode-toggle"
              :class="{ 'm-mode-toggle--locked': isPlaybackActive }"
              :disabled="isPlaybackActive"
              :title="isPlaybackActive ? 'Stop playback to edit' : 'Switch to Edit mode'"
              @click="onSwitchToEditMode"
            >
              <span class="m-mode-toggle__opt">✏</span>
              <span class="m-mode-toggle__opt active">☝</span>
            </button>
            <div class="m-tool-divider" />
            <button v-if="mobileSelection.selectionIsTagged" class="m-tool-btn m-tool-btn--remove" title="Remove tag" @click="onRemoveTag">✕</button>
            <button
              v-for="role in store.cast"
              :key="role.id"
              class="m-role-chip"
              :class="{ 'm-role-chip--active': role.id === mobileSelection.activeRoleId }"
              :style="{ '--role-color': role.color, borderColor: role.color,
                background: role.id === mobileSelection.activeRoleId ? role.color : 'transparent' }"
              @click="onMobileTagRole(role)"
            >{{ role.label }}</button>
            <button class="m-tool-btn" @click="onAutoTagSelection">⚡</button>
          </div>

          <!-- Edit mode toolbar -->
          <div v-else class="m-panel-toolbar">
            <button class="m-mode-toggle" title="Switch to Tag mode" @click="mobileTagMode = true">
              <span class="m-mode-toggle__opt active">✏</span>
              <span class="m-mode-toggle__opt">☝</span>
            </button>
            <div class="m-tool-divider" />
            <button class="m-tool-btn" title="Import Markdown" @click="onImport">↑ Import</button>
            <div class="m-tool-divider" />
            <button class="m-tool-btn" :class="{ 'm-tool-btn--disabled': !mobileSelection.hasSelection }" @click="onBold"><b>B</b></button>
            <button class="m-tool-btn" :class="{ 'm-tool-btn--disabled': !mobileSelection.hasSelection }" @click="onItalic"><i>I</i></button>
            <div class="m-tool-divider" />
            <button class="m-tool-btn" :class="{ 'm-tool-btn--disabled': !mobileSelection.hasSelection }" @click="onBreak">§</button>
            <span class="m-tool-charcount">{{ charCount }}</span>
          </div>

          <div class="m-panel-body">
            <StoryEditor
              :ref="setEditorRef"
              :model-value="store.project?.editorState"
              :cast="store.cast"
              :char-limit="charLimit"
              :show-bubble="false"
              :tag-mode="mobileTagMode"
              @update:model-value="onEditorUpdate"
              @import-markdown="onMarkdownImported"
              @auto-tag-result="onAutoTagResult"
              @doc-updated="onDocUpdated"
              @selection-change="onMobileSelectionChange"
            />
          </div>
        </div>

        <!-- ── Playlist panel ── -->
        <div class="m-panel">
          <PlaylistPane
            :has-tagged-spans="taggedSpans.length > 0"
            :tagged-spans="taggedSpans"
            :is-online="isOnline"
            @generate="onGenerate"
            @regenerate-group="onRegenerateGroup"
            @open-settings="settingsRef?.open()"
            @export="onExport"
          />
        </div>

      </div>
    </div>

    <!-- Bottom nav: Cast | Edit | Play — centered, navigation only -->
    <nav class="m-bottom-bar">
      <button
        class="m-tab"
        :class="{ active: activePanel === 'cast' }"
        @click="setActivePanel('cast')"
      >
        <span class="m-nav-icon">🎭</span>
        <span class="m-nav-label">Cast</span>
      </button>
      <button
        class="m-tab"
        :class="{ active: activePanel === 'editor' }"
        @click="setActivePanel('editor')"
      >
        <span class="m-nav-icon">✏️</span>
        <span class="m-nav-label">Edit</span>
      </button>
      <button
        class="m-tab"
        :class="{ active: activePanel === 'playlist' }"
        @click="setActivePanel('playlist')"
      >
        <span class="m-nav-icon">▶</span>
        <span class="m-nav-label">Play</span>
      </button>
    </nav>

    <!-- Status dots -->


    <!-- Modals (shared) -->
    <FolderPromptModal ref="folderPromptRef" />
    <SettingsModal     ref="settingsRef"     @saved="onProviderSaved" />
    <SyncWarningModal  ref="syncWarningRef" />
    <ExportModal       ref="exportModalRef" />
    <ConfirmModal      ref="confirmRef" />
    <Toast             ref="toastRef" />
  </div>

  <!-- ══════════════════════════════════════════════════════════════════════
       DESKTOP LAYOUT  (viewport ≥ 768px)
       ══════════════════════════════════════════════════════════════════════ -->
  <div v-else class="workspace">

    <!-- ── Global Toolbar ──────────────────────────────────────────────────── -->
    <header class="ws-toolbar">

      <!-- Left: nav + title -->
      <div class="wst-group">
        <button class="wst-btn wst-btn--ghost" title="Back to Library" @click="goLibrary">
          ← Library
        </button>
        <div class="wst-divider" />
        <div v-if="!editingTitle" class="wst-title" title="Click to rename" @click="startEditTitle">
          {{ store.projectTitle }}
        </div>
        <input
          v-else
          ref="titleInputRef"
          class="wst-title-input"
          :value="store.projectTitle"
          maxlength="80"
          @blur="commitTitle($event.target.value)"
          @keydown.enter="commitTitle($event.target.value)"
          @keydown.esc="editingTitle = false"
        />
      </div>

      <!-- Right: app controls -->
      <div class="wst-group wst-group--right">
        <button class="wst-btn" title="Reset panel layout" @click="resetLayout">⊞ Reset Layout</button>
        <div class="wst-divider" />
        <button class="wst-btn" title="Settings" @click="settingsRef?.open()">⚙ Settings</button>
      </div>

    </header>

    <!-- ── Panel Workspace ─────────────────────────────────────────────────── -->
    <div class="ws-body" ref="wsBodyRef">

      <!-- Far-left new-column drop zone -->
      <div
        v-if="draggingPanelId"
        class="dz-col dz-col--edge"
        :class="{ 'dz-col--active': isActiveZone({ type: 'new-col', refColId: layout.columns[0].id, side: 'left' }) }"
        :data-drop-zone="JSON.stringify({ type: 'new-col', refColId: layout.columns[0].id, side: 'left' })"
      />

      <template v-for="(col, colIdx) in layout.columns" :key="col.id">

        <!-- Column -->
        <div
          class="ws-col"
          :data-col-id="col.id"
          :style="colStyle(col.id)"
        >
          <template v-for="(panelId, pIdx) in col.panels" :key="panelId">

            <DockablePanel
              :panel-id="panelId"
              :title="PANEL_META[panelId]"
              :col-id="col.id"
              :panel-index="pIdx"
              :col-panel-count="col.panels.length"
              :flex-grow="panelId === 'editor' ? 1 : (col.panels.length === 1 ? 1 : 1)"
            >
              <!-- Badge slot: cast role count -->
              <template v-if="panelId === 'cast'" #bar-right>
                <span class="panel-badge">{{ store.cast.length }}/10</span>
              </template>

              <!-- Editor toolbar in panel bar -->
              <template v-if="panelId === 'editor'" #bar-right>
                <button class="panel-tb-btn" title="Import Markdown" @click="onImport">
                  ↑ Import
                </button>
                <div class="panel-tb-divider" />
                <button
                  class="panel-tb-btn panel-tb-btn--fmt"
                  :class="{ active: isBold }"
                  title="Bold (Ctrl+B)"
                  @click="onBold"
                ><b>B</b></button>
                <button
                  class="panel-tb-btn panel-tb-btn--fmt"
                  :class="{ active: isItalic }"
                  title="Italic (Ctrl+I)"
                  @click="onItalic"
                ><i>I</i></button>
                <div class="panel-tb-divider" />
                <button
                  class="panel-tb-btn panel-tb-btn--break"
                  title="Insert Segment Break (Ctrl+Shift+Enter)"
                  @click="onBreak"
                >§</button>
                <span class="panel-charcount">{{ charCount }}</span>
              </template>

              <!-- Panel content -->
              <CastPanel
                v-if="panelId === 'cast'"
                @role-updated="onRoleUpdated"
                @role-deleted="onRoleDeleted"
                @auto-tag="onAutoTag"
              />
              <PlaylistPane
                v-else-if="panelId === 'playlist'"
                :has-tagged-spans="taggedSpans.length > 0"
                :tagged-spans="taggedSpans"
                :is-online="isOnline"
                @generate="onGenerate"
                @regenerate-group="onRegenerateGroup"
                @open-settings="settingsRef?.open()"
                @export="onExport"
              />
              <StoryEditor
                v-else-if="panelId === 'editor'"
                :ref="setEditorRef"
                :model-value="store.project?.editorState"
                :cast="store.cast"
                :char-limit="charLimit"
                @update:model-value="onEditorUpdate"
                @import-markdown="onMarkdownImported"
                @auto-tag-result="onAutoTagResult"
                @doc-updated="onDocUpdated"
              />
            </DockablePanel>

          </template>
        </div>

        <!-- Resize handle + between-column drop zone (not after last column) -->
        <template v-if="colIdx < layout.columns.length - 1">
          <div
            class="col-resize"
            :data-col-id="col.id"
            @mousedown="onColResizeStart(col.id, $event)"
          >
            <!-- Between-columns new-column drop zone (sits over the resize handle) -->
            <div
              v-if="draggingPanelId"
              class="dz-col dz-col--between"
              :class="{ 'dz-col--active': isActiveZone({ type: 'new-col', refColId: col.id, side: 'right' }) }"
              :data-drop-zone="JSON.stringify({ type: 'new-col', refColId: col.id, side: 'right' })"
            />
          </div>
        </template>

      </template>

      <!-- Far-right new-column drop zone -->
      <div
        v-if="draggingPanelId"
        class="dz-col dz-col--edge"
        :class="{ 'dz-col--active': isActiveZone({ type: 'new-col', refColId: layout.columns[layout.columns.length - 1].id, side: 'right' }) }"
        :data-drop-zone="JSON.stringify({ type: 'new-col', refColId: layout.columns[layout.columns.length - 1].id, side: 'right' })"
      />

    </div>

    <!-- ── Status Bar ───────────────────────────────────────────────────────── -->
    <footer class="ws-status">
      <StorageBar ref="storageBarRef" compact @manage="showStorageManager = true" />
      <div class="wss-sep" />
      <span v-if="store.isSaving"    class="wss-dot wss-dot--saving">● Saving…</span>
      <span v-else-if="store.isDirty" class="wss-dot wss-dot--dirty">● Unsaved</span>
      <span v-else                    class="wss-dot wss-dot--ok">● Saved</span>
      <span
        class="wss-dot"
        :class="isOnline ? 'wss-dot--online' : 'wss-dot--offline'"
        :title="isOnline ? 'Online' : 'Offline — generation unavailable'"
      >● {{ isOnline ? 'Online' : 'Offline' }}</span>
    </footer>

    <!-- ── Modals ───────────────────────────────────────────────────────────── -->
    <FolderPromptModal ref="folderPromptRef" />
    <SettingsModal     ref="settingsRef"     @saved="onProviderSaved" />
    <SyncWarningModal  ref="syncWarningRef" />
    <ExportModal       ref="exportModalRef" />
    <ConfirmModal      ref="confirmRef" />
    <Toast             ref="toastRef" />

  </div><!-- end desktop -->
  </div><!-- end !store.isLoading -->

  <div v-else class="ws-loading">
    <div class="ws-loading__spinner">⟳</div>
    <span>Loading project…</span>
  </div>
</template>

<script setup>
import {
  ref, computed, watch, watchEffect, reactive, onMounted, onUnmounted, nextTick,
} from 'vue'

// ─── Stores & composables ─────────────────────────────────────────────────────
import { useProjectStore }    from '@/store/project.js'
import { useGenerationStore } from '@/store/generation.js'
import { usePlaybackStore }   from '@/store/playback.js'
import { useOnlineStatus }    from '@/composables/useOnlineStatus.js'
import { usePanelLayout }     from '@/composables/usePanelLayout.js'
import { useMobileLayout }    from '@/composables/useMobileLayout.js'
import { draggingPanelId, activeDropZone, isActiveZone } from '@/composables/usePanelDrag.js'

// ─── TTS providers ────────────────────────────────────────────────────────────
import { registerProvider } from '@/tts/provider.js'
import { minimaxProvider }  from '@/tts/minimax.js'
import { openaiProvider }   from '@/tts/openai.js'
import { browserProvider }  from '@/tts/browser.js'

// ─── Panels ───────────────────────────────────────────────────────────────────
import StoryEditor   from '@/editor/StoryEditor.vue'
import CastPanel     from '@/panels/CastPanel.vue'
import PlaylistPane  from '@/panels/PlaylistPane.vue'

// ─── Components ───────────────────────────────────────────────────────────────
import DockablePanel     from '@/components/DockablePanel.vue'
import StorageBar        from '@/components/StorageBar.vue'
import Toast             from '@/components/Toast.vue'
import ConfirmModal      from '@/components/ConfirmModal.vue'
import FolderPromptModal from '@/modals/FolderPromptModal.vue'
import SettingsModal     from '@/modals/SettingsModal.vue'
import SyncWarningModal  from '@/modals/SyncWarningModal.vue'
import ExportModal       from '@/modals/ExportModal.vue'

// ─── Store + data ────────────────────────────────────────────────────────────
import { getSetting }         from '@/store/db.js'
import { syncCheckOnOpen }    from '@/storage/synccheck.js'
import { extractTaggedSpans } from '@/editor/splitter.js'

registerProvider(minimaxProvider)
registerProvider(openaiProvider)
registerProvider(browserProvider)

// ─── Panel display names ──────────────────────────────────────────────────────
const PANEL_META = { cast: 'Voice Cast', playlist: 'Playlist', editor: 'Editor' }

// ─── Props & emits ────────────────────────────────────────────────────────────
const props = defineProps({ projectId: String })
const emit  = defineEmits(['go-library'])

// ─── Core stores / composables ────────────────────────────────────────────────
const store    = useProjectStore()
const gen      = useGenerationStore()
const playback = usePlaybackStore()
const { isOnline } = useOnlineStatus()
const { layout, movePanel, insertInNewColumn, setColumnWidth, resetLayout } = usePanelLayout()
const {
  isMobile, isPortrait,
  activePanel, setActivePanel,
  trackStyle, onTouchStart, onTouchMove, onTouchEnd,
} = useMobileLayout()

// ─── Refs ─────────────────────────────────────────────────────────────────────
const editorRef       = ref(null)

// Stable named ref callback — inline arrow in v-for triggers a Vue teardown
// timing bug where the reactive scope is partially cleaned up before the
// cleanup call fires. Named function avoids the closure-capture issue.
function setEditorRef(el) {
  if (editorRef) editorRef.value = el ?? null
}
const storageBarRef   = ref(null)
const toastRef        = ref(null)
const folderPromptRef = ref(null)
const settingsRef     = ref(null)
const syncWarningRef  = ref(null)
const exportModalRef  = ref(null)
const confirmRef      = ref(null)
const titleInputRef   = ref(null)
const wsBodyRef       = ref(null)

const editingTitle       = ref(false)
const charLimit          = ref(250)
const activeProvider     = ref('minimax')
const showStorageManager = ref(false)

// ─── Column resize ────────────────────────────────────────────────────────────
// Width is computed from mouse X minus column left-edge on every onMove.
// This avoids all offsetWidth / flexBasis timing issues — the column's
// left edge is stable during a drag regardless of flex layout state.
let _colResizing   = false
let _colResizeId   = null
let _colLeftEdge   = 0   // active column's left edge captured at dragstart
let _colLastW      = 0
let _leftSnapshots = {} // { colId: width } — rendered widths of left-side columns at dragstart
const _activeResize = ref(null) // { colId, width } | null — drives colStyle

function getColEl(colId) {
  return wsBodyRef.value?.querySelector(`.ws-col[data-col-id="${colId}"]`) ?? null
}

function colStyle(colId) {
  if (_activeResize.value?.colId === colId) {
    // The column being dragged — fixed to the live drag width
    return { flexBasis: `${_activeResize.value.width}px`, flexShrink: '0', flexGrow: '0' }
  }
  if (_activeResize.value) {
    // Another column is being dragged.
    // Columns to the LEFT of the active column keep their saved widths — they are
    // anchored by their own left handles and must not shift during this drag.
    // Columns to the RIGHT are flexible so they absorb the size change.
    const activeIdx = layout.value.columns.findIndex(c => c.id === _activeResize.value.colId)
    const thisIdx   = layout.value.columns.findIndex(c => c.id === colId)
    if (thisIdx < activeIdx) {
      // Use snapshot (captured at dragstart) — reliable even without a saved width
      const snap = _leftSnapshots[colId]
      if (snap != null) return { flexBasis: `${snap}px`, flexShrink: '0', flexGrow: '0' }
      const w = layout.value.columnWidths?.[colId]
      if (w != null) return { flexBasis: `${w}px`, flexShrink: '0', flexGrow: '0' }
    }
    return { flexGrow: '1', flexShrink: '1', flexBasis: '0px', minWidth: '240px' }
  }
  const w = layout.value.columnWidths?.[colId]
  if (w != null) return { flexBasis: `${w}px`, flexShrink: '0', flexGrow: '0' }
  return { flexGrow: '1', flexShrink: '1', flexBasis: '0px', minWidth: '240px' }
}

function onColResizeStart(colId, e) {
  e.preventDefault()

  const el = getColEl(colId)
  if (!el) return

  const rect = el.getBoundingClientRect()

  _colResizing = true
  _colResizeId = colId
  _colLeftEdge = rect.left
  const _maxW  = (wsBodyRef.value?.offsetWidth ?? 1400) - 180 - 5
  _colLastW    = Math.max(180, Math.min(_maxW, Math.round(e.clientX - _colLeftEdge)))

  // Snapshot rendered widths of all columns LEFT of this one.
  // They may have no saved width (flexGrow:1) but need to stay pinned during drag.
  _leftSnapshots = {}
  const activeIdx = layout.value.columns.findIndex(c => c.id === colId)
  for (let i = 0; i < activeIdx; i++) {
    const leftEl = getColEl(layout.value.columns[i].id)
    if (leftEl) _leftSnapshots[layout.value.columns[i].id] = Math.round(leftEl.getBoundingClientRect().width)
  }

  document.body.style.cursor           = 'col-resize'
  document.body.style.userSelect       = 'none'
  document.body.style.webkitUserSelect = 'none'

  function onMove(mv) {
    if (!_colResizing) return
    // Max = container width minus minimum space for all other columns + handles
    const maxW = (wsBodyRef.value?.offsetWidth ?? 1400) - 180 - 5
    _colLastW = Math.max(180, Math.min(maxW, Math.round(mv.clientX - _colLeftEdge)))
    _activeResize.value = { colId: _colResizeId, width: _colLastW }
  }

  function onUp() {
    if (!_colResizing) return
    _colResizing = false
    document.body.style.cursor           = ''
    document.body.style.userSelect       = ''
    document.body.style.webkitUserSelect = ''
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup',   onUp)

      _activeResize.value = null

    // Persist snapshots for left-side columns (they may have had no saved width),
    // save the resized column's final width, clear widths for columns to the right.
    const resizedIdx = layout.value.columns.findIndex(c => c.id === _colResizeId)
    const newWidths  = { ...layout.value.columnWidths, ..._leftSnapshots }
    layout.value.columns.forEach((col, idx) => {
      if (idx > resizedIdx) delete newWidths[col.id]
    })
    newWidths[_colResizeId] = _colLastW
    _leftSnapshots = {}
    layout.value = { ...layout.value, columnWidths: newWidths }
  }

  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup',   onUp)
}

watch(activeDropZone, (zone) => {
  if (!zone || !draggingPanelId.value) return
  // Called reactively, but actual move executes on mouseup in usePanelDrag
})

/**
 * Called by DockablePanel's startDrag callback via the workspace-level watcher.
 * We watch for activeDropZone changes to execute moves on mouseup.
 * The actual callback is wired below via a document-level mouseup listener.
 */
function setupDropListener() {
  function onMouseUp() {
    const zone    = activeDropZone.value
    const panelId = draggingPanelId.value
    if (!zone || !panelId) return

    if (zone.type === 'in-col') {
      movePanel(panelId, zone.colId, zone.index)
    } else if (zone.type === 'new-col') {
      insertInNewColumn(panelId, zone.refColId, zone.side)
    }
  }
  window.addEventListener('mouseup', onMouseUp)
  return () => window.removeEventListener('mouseup', onMouseUp)
}

// ─── Toolbar: editor actions ──────────────────────────────────────────────────

// Note: isBold/isItalic are best-effort — they don't need to update during
// auto-tag operations, so we use a simple ref updated on manual cursor moves
const isBold   = ref(false)
const isItalic = ref(false)
const charCount = computed(() => editorRef.value?.charCount?.value ?? 0)

function onImport()  { editorRef.value?.triggerImport?.() }
function onBold()    { editorRef.value?.getEditor?.()?.chain().focus().toggleBold().run() }
function onItalic()  { editorRef.value?.getEditor?.()?.chain().focus().toggleItalic().run() }
function onBreak()   { editorRef.value?.getEditor?.()?.chain().focus().insertSegmentBreak().run() }

// ── Mobile toolbar state ──────────────────────────────────────────────────────
const mobileTagMode   = ref(false)
const mobileSelection = reactive({ hasSelection: false, selectionIsTagged: false, activeRoleId: null })
const isPlaybackActive = computed(() => playback.isPlaying || playback.isPaused)
watch(isPlaybackActive, (active) => { if (active) mobileTagMode.value = true })

function onMobileSelectionChange({ hasSelection, selectionIsTagged, activeRoleId }) {
  mobileSelection.hasSelection      = hasSelection
  mobileSelection.selectionIsTagged = selectionIsTagged
  mobileSelection.activeRoleId      = activeRoleId ?? null
}
function onMobileTagRole(role)    { editorRef.value?.applyVoiceTag?.(role) }
function onRemoveTag()            { editorRef.value?.removeVoiceTag?.() }
function onAutoTagSelection()     { editorRef.value?.autoTagSelection?.() }
function onSwitchToEditMode() {
  mobileTagMode.value = false
  editorRef.value?.focusEditor?.()
}

// Wire playback store whenever the editor mounts
watch(editorRef, (ref) => {
  if (ref) playback.setEditorRef(ref)
})

// Tagged spans for PlaylistPane preview (before first Generate)
const taggedSpans = computed(() => {
  void store.project?.editorState  // reactive trigger on every edit
  const doc = editorRef.value?.getDoc?.()
  return doc ? extractTaggedSpans(doc) : []
})

// Rebuild gen.groups whenever BOTH editorRef and editorState are available.
// watchEffect automatically tracks both dependencies, so this fires:
//   - on initial project load (when editorRef mounts with saved tagged content)
//   - on every edit (when editorState changes)
//   - after auto-tag queue (each op triggers onUpdate → setEditorState)
// The setTimeout(50) lets Tiptap finish applying marks before we read the doc.
// On initial load: build groups once when both editor and project are ready.
// After that, onDocUpdated handles all subsequent group rebuilds.
watchEffect(() => {
  if (editorRef.value && store.project?.editorState) {
    setTimeout(() => {
      editorRef.value?.syncGroups?.(gen.buildGroupsFromDoc, charLimit.value)
    }, 50)
  }
})

// ─── Lifecycle ────────────────────────────────────────────────────────────────

let _removeDropListener = null

onMounted(async () => {
  _removeDropListener = setupDropListener()

  await store.loadProject(props.projectId)
  if (!store.project) { emit('go-library'); return }

  const saved = await getSetting('activeProvider')
  if (saved) activeProvider.value = saved

  await nextTick()
  if (editorRef.value) playback.setEditorRef(editorRef.value)
  gen.loadFromProject()

  const syncReport = await syncCheckOnOpen(store.project)
  if (syncReport.hasDivergences) {
    gen.setDivergences(syncReport)
    await nextTick()
    const result = await syncWarningRef.value?.open(syncReport)
    if (result === 'rewritten' || result === 'reimported') gen.clearAllDivergences()
  }

  if (store.project.sourceMarkdown && !store.project.editorState) {
    nextTick(() => editorRef.value?.importMarkdown(store.project.sourceMarkdown))
  }
})

onUnmounted(() => {
  if (store.isDirty) store.persistProject()
  store.closeProject()
  gen.reset()
  playback.stop()
  _removeDropListener?.()
})

// ─── Online status toasts ─────────────────────────────────────────────────────

watch(isOnline, (online) => {
  if (!online) toastRef.value?.show('You\'re offline — audio generation unavailable', 'warning', 5000)
  else         toastRef.value?.show('Back online', 'success', 2500)
})

// ─── Title editing ────────────────────────────────────────────────────────────

function startEditTitle() {
  editingTitle.value = true
  nextTick(() => { titleInputRef.value?.focus(); titleInputRef.value?.select() })
}

function commitTitle(val) {
  const t = val?.trim()
  if (t) store.setTitle(t)
  editingTitle.value = false
}

// ─── Editor callbacks ─────────────────────────────────────────────────────────

function onEditorUpdate(json) {
  store.setEditorState(json)
}

// doc-updated fires when Tiptap's onUpdate runs. We don't pass the doc
// through Vue's emit chain (proxy wrapping can strip custom mark types).
// Instead we call syncGroups which reads editor.value.state.doc directly
// from inside StoryEditor's own closure — no proxy, no timing issues.
function onDocUpdated() {
  editorRef.value?.syncGroups?.(gen.buildGroupsFromDoc, charLimit.value)
}

function onMarkdownImported(raw) {
  if (store.project) { store.project.sourceMarkdown = raw; store.markDirty() }
  toastRef.value?.show('Markdown imported', 'success')
}

// ─── Cast callbacks ───────────────────────────────────────────────────────────

function onRoleUpdated() {}
function onRoleDeleted() {
  toastRef.value?.show('Role removed — re-tag any affected text.', 'warning', 4000)
}

// ─── Auto-tag ─────────────────────────────────────────────────────────────────

/**
 * Apply auto-tag operations one at a time via setTimeout(0) between each.
 * Each operation goes through the normal manual-tag path:
 *   setTextSelection → setVoiceTag → onUpdate fires → editorState saved →
 *   taggedSpans recomputes → watch fires → buildGroupsFromDoc → playlist updates.
 */
function applyAutoTagQueue(result, source = 'doc') {
  const { operations, found, unmatched } = result
  showAutoTagToast({ tagged: operations.length, found, unmatched, source })

  // Delegate to StoryEditor — it captures editor.value at call time so the
  // correct instance is used even if editorRef changes during the setTimeout chain
  editorRef.value?.applyAutoTagOps?.(operations, (doc, json) => {
    // json comes from the captured editor — guaranteed to have the marks
    if (json) store.setEditorState(json)
    gen.buildGroupsFromDoc(doc, charLimit.value)
  })
}

function onAutoTag() {
  if (!editorRef.value) return

  // When cast is empty, buildAutoTagOperations bails early (roles.length === 0).
  // Instead, do a raw label-discovery scan on the doc text to find [LABEL] patterns,
  // create roles for them, then run the full tag pass with the populated cast.
  if (store.cast.length === 0) {
    const doc = editorRef.value.getDoc?.()
    if (!doc) return
    const LABEL_RE = /\[([^\]]+)\]/g
    const labels = new Set()
    doc.descendants(node => {
      if (!node.isText) return
      for (const m of node.text.matchAll(LABEL_RE)) labels.add(m[1].trim())
    })
    if (labels.size === 0) {
      toastRef.value?.show('No [LABEL] patterns found in script.', 'warning', 3500)
      return
    }
    for (const label of labels) store.addRole(label)
    toastRef.value?.show(
      `Added ${labels.size} cast member${labels.size !== 1 ? 's' : ''} from script.`,
      'success', 3500
    )
  }

  // Standard pass — create roles for any remaining unmatched labels
  const firstPass = editorRef.value.applyAutoTag(store.cast)
  let newRolesAdded = 0
  for (const label of firstPass.unmatched) {
    const clean = label.replace(/^\[|\]$/g, '').trim()
    const alreadyExists = store.cast.some(r => r.label.trim().toLowerCase() === clean.toLowerCase())
    if (!alreadyExists) { store.addRole(clean); newRolesAdded++ }
  }
  const result = newRolesAdded > 0 ? editorRef.value.applyAutoTag(store.cast) : firstPass
  if (newRolesAdded > 0) {
    toastRef.value?.show(
      `Added ${newRolesAdded} new cast member${newRolesAdded !== 1 ? 's' : ''} from script.`,
      'success', 3500
    )
  }
  applyAutoTagQueue(result)
}

function onAutoTagResult(result) {
  applyAutoTagQueue(result, 'selection')
}

function showAutoTagToast({ tagged, found, unmatched, source = 'doc' }) {
  if (tagged === 0 && unmatched.length === 0) {
    if (found > 0) {
      toastRef.value?.show('Already tagged — no new spans to apply.', 'success', 3000)
    } else {
      const msg = source === 'selection' ? 'No [LABEL] patterns found in selection.' : 'No [LABEL] patterns found in script.'
      toastRef.value?.show(msg, 'warning', 3500)
    }
    return
  }
  const tagPart = tagged > 0 ? `Tagged ${tagged} span${tagged !== 1 ? 's' : ''}` : ''
  if (unmatched.length > 0) {
    const list = unmatched.join(', ')
    toastRef.value?.show(
      `${tagPart ? tagPart + '. ' : ''}No matching role for: ${list}`,
      tagged === 0 ? 'warning' : 'success',
      6000
    )
  } else {
    toastRef.value?.show(tagPart, 'success', 3000)
  }
}

// ─── Settings ─────────────────────────────────────────────────────────────────

function onProviderSaved(providerId) {
  activeProvider.value = providerId
  toastRef.value?.show('Settings saved', 'success')
}

// ─── Generate ─────────────────────────────────────────────────────────────────

async function onGenerate() {
  const doc = editorRef.value?.getDoc?.()
  if (!doc) { toastRef.value?.show('Editor not ready', 'warning'); return }
  if (taggedSpans.value.length === 0) {
    toastRef.value?.show('Tag some text first, then generate.', 'warning'); return
  }

  const { getApiKey } = await import('@/store/db.js')
  const keyRecord = await getApiKey(activeProvider.value)
  if (!keyRecord && activeProvider.value !== 'browser') {
    toastRef.value?.show(`No API key for ${activeProvider.value} — open ⚙ Settings first.`, 'warning', 5000)
    settingsRef.value?.open()
    return
  }

  try {
    await gen.generateAll({
      providerId:     activeProvider.value,
      charLimit:      charLimit.value,
      doc,
      onFolderPrompt: () => folderPromptRef.value?.open(),
    })
    const failed = gen.failCount
    toastRef.value?.show(
      failed > 0 ? `Generated with ${failed} error${failed > 1 ? 's' : ''} — check playlist` : 'All audio generated!',
      failed > 0 ? 'warning' : 'success'
    )
  } catch (err) {
    toastRef.value?.show(err.message, 'error', 6000)
  }
}

async function onRegenerateGroup(groupId) {
  const doc = editorRef.value?.getDoc?.()
  if (!doc) { toastRef.value?.show('Editor not ready', 'warning'); return }
  try {
    await gen.regenerateGroup(groupId, {
      providerId:     activeProvider.value,
      doc,
      onFolderPrompt: () => folderPromptRef.value?.open(),
    })
    toastRef.value?.show('Segment regenerated', 'success')
  } catch (err) {
    toastRef.value?.show(err.message, 'error', 6000)
  }
}

function onExport() { exportModalRef.value?.open() }

function goLibrary() { emit('go-library') }
</script>

<style scoped>
/* ─── Workspace shell ────────────────────────────────────────────────────────── */
.workspace {
  display: flex; flex-direction: column;
  height: 100vh; width: 100vw; overflow: hidden;
  background: var(--color-bg); color: var(--color-text); font-family: var(--font-ui);
}

/* ─── Global Toolbar ─────────────────────────────────────────────────────────── */
.ws-toolbar {
  display: flex; align-items: center; gap: 0;
  height: 40px; flex-shrink: 0;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  padding: 0 8px;
}

.wst-group {
  display: flex; align-items: center; gap: 2px;
}

.wst-group--right  { margin-left: auto; }

.wst-divider {
  width: 1px; height: 18px;
  background: var(--color-border); margin: 0 6px; flex-shrink: 0;
}

.wst-btn {
  background: none; border: 1px solid transparent; border-radius: 5px;
  color: var(--color-text-muted); font-size: 12px; font-family: var(--font-ui);
  padding: 3px 9px; cursor: pointer; transition: all 0.12s; white-space: nowrap;
}
.wst-btn:hover { background: var(--color-border); color: var(--color-text) }
.wst-btn.active,
.wst-btn--fmt.active { background: rgba(124,92,191,0.18); border-color: var(--color-accent); color: var(--color-accent) }
.wst-btn--ghost { color: var(--color-text-muted) }

.wst-title {
  font-family: var(--font-display); font-size: 14px; font-weight: 600;
  color: var(--color-text); cursor: pointer; padding: 2px 6px; border-radius: 4px;
  max-width: 480px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  transition: background 0.1s;
}
.wst-title:hover { background: var(--color-border) }

.wst-title-input {
  font-family: var(--font-display); font-size: 14px; font-weight: 600;
  color: var(--color-text); background: var(--color-border);
  border: 1px solid var(--color-accent); border-radius: 4px;
  padding: 2px 6px; outline: none; width: 340px;
}

/* ─── Workspace body ─────────────────────────────────────────────────────────── */
.ws-body {
  flex: 1; min-height: 0;
  display: flex; flex-direction: row; overflow: hidden;
  position: relative;
}

/* ─── Columns ────────────────────────────────────────────────────────────────── */
.ws-col {
  display: flex; flex-direction: column;
  overflow: hidden; min-width: 0;
  border-right: 1px solid var(--color-border);
}
.ws-col:last-of-type { border-right: none }

/* ─── Column resize handle ───────────────────────────────────────────────────── */
.col-resize {
  width: 5px; flex-shrink: 0; cursor: col-resize;
  background: var(--color-border); position: relative; z-index: 5;
  transition: background 0.15s;
}
.col-resize:hover,
.col-resize:active { background: var(--color-accent) }

/* Wider invisible grab zone */
.col-resize::before {
  content: ''; position: absolute;
  top: 0; bottom: 0; left: -4px; right: -4px;
}

/* ─── Column drop zones ──────────────────────────────────────────────────────── */

/* Vertical strip: create a new column between/beside columns */
.dz-col {
  flex-shrink: 0; width: 24px; position: relative; z-index: 8;
  transition: background 0.1s;
}

.dz-col--edge { width: 12px }

.dz-col::after {
  content: ''; position: absolute;
  top: 16px; bottom: 16px; left: 50%;
  width: 2px; transform: translateX(-50%);
  border-radius: 1px; background: transparent;
  transition: background 0.12s;
}

.dz-col--active::after {
  background: var(--color-accent);
  box-shadow: 0 0 8px var(--color-accent);
}

/* Between-column zone sits over the resize handle area */
.dz-col--between {
  position: absolute; inset: 0; z-index: 9; width: 100%;
}

/* ─── Panel badge (e.g. cast count) ─────────────────────────────────────────── */
.panel-badge {
  font-size: 10px; font-family: var(--font-mono);
  color: var(--color-text-muted); opacity: 0.55;
}

/* ─── Editor panel toolbar buttons (in DockablePanel bar-right slot) ─────────── */
.panel-tb-btn {
  background: none; border: 1px solid transparent; border-radius: 4px;
  color: var(--color-text-muted); font-size: 11px; font-family: var(--font-ui);
  padding: 2px 7px; cursor: pointer; transition: all 0.12s; white-space: nowrap;
  line-height: 1.4;
}
.panel-tb-btn:hover { background: var(--color-border); color: var(--color-text) }
.panel-tb-btn.active { background: rgba(124,92,191,0.18); border-color: var(--color-accent); color: var(--color-accent) }
.panel-tb-btn--fmt  { padding: 2px 6px; font-size: 12px }
.panel-tb-btn--break { border-color: var(--color-border); color: var(--color-accent); font-family: var(--font-mono) }
.panel-tb-btn--break:hover { background: rgba(124,92,191,0.12); border-color: var(--color-accent) }

.panel-tb-divider {
  width: 1px; height: 14px;
  background: var(--color-border); margin: 0 3px; flex-shrink: 0;
}

.panel-charcount {
  font-size: 10px; font-family: var(--font-mono);
  color: var(--color-text-muted); opacity: 0.5; white-space: nowrap;
  margin-left: 2px;
}

/* ─── Status bar ─────────────────────────────────────────────────────────────── */
.ws-status {
  height: 30px; flex-shrink: 0;
  display: flex; align-items: center; gap: 10px;
  padding: 0 14px;
  background: var(--color-surface);
  border-top: 1px solid var(--color-border);
  font-size: 11px; font-family: var(--font-mono);
}

.wss-sep {
  width: 1px; height: 14px;
  background: var(--color-border); flex-shrink: 0; margin: 0 2px;
}

.wss-dot         { color: var(--color-text-muted); white-space: nowrap }
.wss-dot--saving,
.wss-dot--dirty  { color: var(--color-warning) }
.wss-dot--ok     { color: var(--color-success) }
.wss-dot--online  { color: var(--color-success) }
.wss-dot--offline { color: var(--color-error) }

/* ─── Loading screen ─────────────────────────────────────────────────────────── */
.ws-loading {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 12px; height: 100vh;
  color: var(--color-text-muted); font-family: var(--font-ui);
}
.ws-loading__spinner { font-size: 24px; animation: spin 1.2s linear infinite }
@keyframes spin { to { transform: rotate(360deg) } }

/* ═══════════════════════════════════════════════════════════════════════════
   MOBILE LAYOUT
   ═══════════════════════════════════════════════════════════════════════════ */

.m-workspace {
  position: relative;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--color-bg);
  box-sizing: border-box;
}

@media (display-mode: standalone) {
  .m-workspace {
    position: fixed;
    inset: 0;
    height: auto;
    padding-top: env(safe-area-inset-top);
  }
}

/* ─── Top bar ──────────────────────────────────────────────────────────────── */
.m-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 48px;
  padding: 0 8px;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
  z-index: 10;
}

.m-tb-btn {
  all: unset;
  cursor: pointer;
  padding: 6px 10px;
  border-radius: 6px;
  font-family: var(--font-ui);
  font-size: 14px;
  color: var(--color-text-muted);
  flex-shrink: 0;
  transition: color 0.15s;
}
.m-tb-btn:active { color: var(--color-text) }

.m-title {
  flex: 1;
  font-family: var(--font-display);
  font-size: 15px;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: center;
}

.m-title-input {
  flex: 1;
  background: none;
  border: none;
  border-bottom: 1px solid var(--color-accent);
  color: var(--color-text);
  font-family: var(--font-display);
  font-size: 15px;
  text-align: center;
  outline: none;
  padding: 2px 4px;
}

/* ─── Panel toolbar ───────────────────────────────────────────────────────── */
.m-panel-toolbar {
  display: flex; align-items: center; gap: 4px; height: 40px;
  padding: 0 10px; background: var(--color-surface);
  border-bottom: 1px solid var(--color-border); flex-shrink: 0;
}
.m-panel-title { font-family: var(--font-ui); font-size: 10px; font-weight: 600; letter-spacing: 0.08em; color: var(--color-text-muted); text-transform: uppercase; }
.m-panel-badge { font-family: var(--font-mono); font-size: 10px; color: var(--color-text-muted); margin-left: 6px; }
.m-tool-btn {
  all: unset; cursor: pointer; display: inline-flex; align-items: center; justify-content: center;
  padding: 5px 9px; border-radius: 6px; font-family: var(--font-ui); font-size: 13px;
  color: var(--color-text-muted); flex-shrink: 0; transition: background 0.12s, color 0.12s; white-space: nowrap;
}
.m-tool-btn:active        { background: rgba(124,92,191,0.18); color: var(--color-text); }
.m-tool-btn--disabled     { opacity: 0.3; cursor: default; pointer-events: none; }
.m-tool-btn--remove       { color: var(--color-error) !important; flex-shrink: 0; }
.m-tool-divider           { width: 1px; height: 18px; background: var(--color-border); margin: 0 2px; flex-shrink: 0; }
.m-tool-charcount         { font-family: var(--font-mono); font-size: 11px; color: var(--color-text-muted); margin-left: auto; padding-right: 2px; }
.m-panel-body             { flex: 1; overflow: hidden; display: flex; flex-direction: column; }

/* ─── Mode toggle pill ─────────────────────────────────────────────────────── */
.m-mode-toggle {
  all: unset; cursor: pointer; display: inline-flex; align-items: center; flex-shrink: 0;
  background: var(--color-bg); border: 1px solid var(--color-border);
  border-radius: 20px; padding: 2px 3px; gap: 2px; transition: opacity 0.15s;
}
.m-mode-toggle--locked    { opacity: 0.35; cursor: not-allowed; }
.m-mode-toggle__opt {
  display: inline-flex; align-items: center; justify-content: center;
  width: 26px; height: 22px; border-radius: 16px; font-size: 13px;
  color: var(--color-text-muted); transition: background 0.15s, color 0.15s;
}
.m-mode-toggle__opt.active { background: var(--color-accent); color: #fff; }

/* ─── Tag mode toolbar ─────────────────────────────────────────────────────── */
.m-panel-toolbar--tagmode {
  overflow-x: auto; overflow-y: hidden; scrollbar-width: none; flex-wrap: nowrap; gap: 5px;
  background: color-mix(in srgb, var(--color-accent) 10%, var(--color-surface));
  border-bottom-color: color-mix(in srgb, var(--color-accent) 45%, transparent);
}
.m-panel-toolbar--tagmode::-webkit-scrollbar { display: none; }

/* ─── Role chips ───────────────────────────────────────────────────────────── */
.m-role-chip {
  all: unset; cursor: pointer; flex-shrink: 0; padding: 4px 11px; border-radius: 20px;
  border: 1px solid var(--role-color, var(--color-border)); font-size: 12px;
  font-family: var(--font-ui); color: var(--role-color, var(--color-text-muted));
  white-space: nowrap; transition: background 0.12s;
}
.m-role-chip:active  { background: rgba(255,255,255,0.1); }
.m-role-chip--active { color: #fff !important; }

/* ─── Offline globe ────────────────────────────────────────────────────────── */
.m-status-globe           { font-size: 16px; line-height: 1; flex-shrink: 0; }
.m-status-globe--offline  { filter: grayscale(1) brightness(0.5) sepia(1) hue-rotate(-30deg) saturate(3); }

/* ─── Swipeable panel track ────────────────────────────────────────────────── */
.m-panels {
  flex: 1;
  overflow: hidden;
  position: relative;
}

.m-panels__track {
  display: flex;
  width: 300vw;      /* 3 panels × 100vw — use vw not % to match transform */
  height: 100%;
  will-change: transform;
}

.m-panel {
  width: 100vw;
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

/* ─── Cast drawer ──────────────────────────────────────────────────────────── */

/* ─── Bottom bar ───────────────────────────────────────────────────────────── */
.m-bottom-bar {
  display: flex;
  align-items: center;
  height: 56px;
  padding: 0 4px;
  background: var(--color-surface);
  border-top: 1px solid var(--color-border);
  flex-shrink: 0;
  gap: 2px;
}

.m-safe-bottom { display: none; }


.m-nav-icon { font-size: 16px; line-height: 1 }
.m-nav-label {
  font-family: var(--font-ui);
  font-size: 9px;
  color: var(--color-text-muted);
  letter-spacing: 0.04em;
}


.m-tab {
  all: unset;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  padding: 6px 20px;
  border-radius: 10px;
  min-width: 64px;
  transition: background 0.15s;
}
.m-tab .m-nav-label { transition: color 0.15s }
.m-tab.active .m-nav-label { color: var(--color-accent) }
.m-tab.active { background: rgba(124,92,191,0.12) }
.m-tab:active { background: rgba(255,255,255,0.05) }

/* ─── Status dots ──────────────────────────────────────────────────────────── */

@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.4 } }

/* ─── Landscape adjustments ────────────────────────────────────────────────── */
.m-workspace--landscape .m-panels__track {
  /* In landscape: still swipe but panels are wider */
  font-size: 13px;
}

.m-workspace--landscape .m-bottom-bar {
  height: 48px;
}
</style>
