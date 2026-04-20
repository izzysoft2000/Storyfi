<template>
  <!--
    DockablePanel.vue
    Renders one panel in the dockable workspace: a title bar with a drag handle
    and a scrollable content area. Drop zones (thin highlight lines) appear
    above and below during a drag so the user can see where the panel will land.
  -->
  <div
    class="dock-panel"
    :class="{ 'dock-panel--dragging': isDragging }"
    :style="panelStyle"
  >

    <!-- Drop zone — above this panel (visible only during a drag) -->
    <div
      v-if="showDropZones"
      class="dz dz--h"
      :class="{ 'dz--active': isActiveZone(aboveZone) }"
      :data-drop-zone="JSON.stringify(aboveZone)"
    />

    <!-- Title bar (drag handle) -->
    <div
      class="dock-panel__bar"
      :class="{ 'dock-panel__bar--dragging': isDragging }"
    >
      <span
        class="dock-panel__handle"
        title="Drag to move panel"
        @mousedown.prevent="onHandleMousedown"
      >⠿</span>
      <span
        class="dock-panel__title"
        @mousedown.prevent="onHandleMousedown"
      >{{ title }}</span>
      <div class="dock-panel__bar-right" @mousedown.stop>
        <slot name="bar-right" />
      </div>
    </div>

    <!-- Content -->
    <div class="dock-panel__content">
      <slot />
    </div>

    <!-- Drop zone — below this panel (visible only during a drag) -->
    <div
      v-if="showDropZones"
      class="dz dz--h"
      :class="{ 'dz--active': isActiveZone(belowZone) }"
      :data-drop-zone="JSON.stringify(belowZone)"
    />

  </div>
</template>

<script setup>
import { computed } from 'vue'
import { startDrag, draggingPanelId, isActiveZone } from '@/composables/usePanelDrag.js'

// ─── Props ────────────────────────────────────────────────────────────────────

const props = defineProps({
  /** One of 'cast' | 'playlist' | 'editor' */
  panelId: { type: String, required: true },

  /** Display title shown in the bar */
  title: { type: String, required: true },

  /**
   * Column this panel lives in — needed so drop zone descriptors
   * carry the right colId for the layout mutation.
   */
  colId: { type: String, required: true },

  /**
   * Index of this panel within its column — used to build drop zone descriptors.
   */
  panelIndex: { type: Number, required: true },

  /**
   * Total number of panels in this column.
   * Determines whether the "below" zone is a new-column edge or in-column insert.
   */
  colPanelCount: { type: Number, default: 1 },

  /**
   * CSS flex-grow value. 1 = take available space; 0 = shrink to content.
   */
  flexGrow: { type: Number, default: 1 },

  /** Minimum height in px */
  minHeight: { type: Number, default: 120 },
})

// ─── Emits ────────────────────────────────────────────────────────────────────

const emit = defineEmits(['drag-start'])

// ─── Computed ─────────────────────────────────────────────────────────────────

const isDragging    = computed(() => draggingPanelId.value === props.panelId)
const showDropZones = computed(() =>
  draggingPanelId.value !== null && draggingPanelId.value !== props.panelId
)

/** Drop zone descriptor: slot directly above this panel in its column */
const aboveZone = computed(() => ({
  type:  'in-col',
  colId: props.colId,
  index: props.panelIndex,
}))

/** Drop zone descriptor: slot directly below this panel in its column */
const belowZone = computed(() => ({
  type:  'in-col',
  colId: props.colId,
  index: props.panelIndex + 1,
}))

const panelStyle = computed(() => ({
  flexGrow:  props.flexGrow,
  flexShrink: 1,
  flexBasis: '0px',
  minHeight: `${props.minHeight}px`,
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
}))

// ─── Drag handle ──────────────────────────────────────────────────────────────

function onHandleMousedown(event) {
  if (event.button !== 0) return
  emit('drag-start', event)
  startDrag(props.panelId, event, () => {
    // onDrop is handled at workspace level via the activeDropZone ref
  })
}
</script>

<style scoped>
/* ─── Panel shell ────────────────────────────────────────────────────────────── */

.dock-panel {
  display: flex;
  flex-direction: column;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
  transition: opacity 0.15s;
  position: relative;
}

.dock-panel:last-child {
  border-bottom: none;
}

.dock-panel--dragging {
  opacity: 0.35;
  pointer-events: none;
}

/* ─── Title bar ──────────────────────────────────────────────────────────────── */

.dock-panel__bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  cursor: grab;
  user-select: none;
  flex-shrink: 0;
}

.dock-panel__bar:hover {
  background: rgba(255, 255, 255, 0.025);
}

.dock-panel__bar--dragging {
  cursor: grabbing;
}

.dock-panel__handle {
  font-size: 14px;
  color: var(--color-text-muted);
  opacity: 0.4;
  cursor: grab;
  flex-shrink: 0;
  transition: opacity 0.15s;
}

.dock-panel__bar:hover .dock-panel__handle {
  opacity: 0.75;
}

.dock-panel__title {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--color-text-muted);
  flex: 1;
}

.dock-panel__bar-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

/* ─── Content ────────────────────────────────────────────────────────────────── */

.dock-panel__content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* ─── Drop zones ─────────────────────────────────────────────────────────────── */

/* Horizontal: between panels in the same column */
.dz--h {
  flex-shrink: 0;
  height: 6px;
  position: relative;
  z-index: 10;
  cursor: copy;
  transition: background 0.1s;
}

.dz--h::after {
  content: '';
  position: absolute;
  left: 8px;
  right: 8px;
  top: 2px;
  height: 2px;
  border-radius: 1px;
  background: transparent;
  transition: background 0.12s;
}

.dz--h.dz--active::after {
  background: var(--color-accent);
  box-shadow: 0 0 6px var(--color-accent);
}
</style>
