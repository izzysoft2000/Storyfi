/**
 * src/composables/usePanelLayout.js
 *
 * Manages the dockable panel layout — which panels live in which columns,
 * in what order, and how wide each column is. Persisted to localStorage.
 *
 * Layout shape:
 *   columns: [{ id, panels: string[] }]
 *   columnWidths: { [colId]: number (px) | undefined (flex:1) }
 *
 * Panels: 'cast' | 'playlist' | 'editor'
 * The editor panel gets flex:1 width unless explicitly sized.
 */

import { ref, watch } from 'vue'

const STORAGE_KEY = 'storyfi_panel_layout_v1'

const REQUIRED_PANELS = ['cast', 'playlist', 'editor']

export const DEFAULT_LAYOUT = {
  columns: [
    { id: 'col-left',  panels: ['cast', 'playlist'] },
    { id: 'col-right', panels: ['editor'] },
  ],
  columnWidths: { 'col-left': 290 },
}

// ─── Validation ───────────────────────────────────────────────────────────────

function isValid(layout) {
  if (!layout?.columns?.length) return false
  const present = layout.columns.flatMap(c => c.panels ?? [])
  return (
    REQUIRED_PANELS.every(p => present.includes(p)) &&
    present.length === REQUIRED_PANELS.length
  )
}

// ─── Persistence ─────────────────────────────────────────────────────────────

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (isValid(parsed)) return parsed
    }
  } catch (_) {}
  return JSON.parse(JSON.stringify(DEFAULT_LAYOUT))
}

function save(layout) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout))
  } catch (_) {}
}

// ─── Singleton shared ref ─────────────────────────────────────────────────────

const layout = ref(load())

watch(layout, save, { deep: true })

// ─── Composable ───────────────────────────────────────────────────────────────

export function usePanelLayout() {

  /**
   * Move a panel into a column at a specific index.
   * Removes it from wherever it currently lives.
   * Cleans up any columns that become empty.
   */
  function movePanel(panelId, targetColId, targetIndex) {
    const cols = layout.value.columns.map(c => ({ ...c, panels: [...c.panels] }))

    // Remove from current position
    for (const col of cols) {
      const idx = col.panels.indexOf(panelId)
      if (idx !== -1) col.panels.splice(idx, 1)
    }

    // Insert at target
    const target = cols.find(c => c.id === targetColId)
    if (target) {
      const clampedIdx = Math.max(0, Math.min(targetIndex, target.panels.length))
      target.panels.splice(clampedIdx, 0, panelId)
    }

    layout.value = {
      ...layout.value,
      columns: cols.filter(c => c.panels.length > 0),
    }
  }

  /**
   * Move a panel into a brand-new column inserted to the left or right
   * of an existing column.
   */
  function insertInNewColumn(panelId, referenceColId, side) {
    const cols = layout.value.columns.map(c => ({ ...c, panels: [...c.panels] }))

    // Remove from current position
    for (const col of cols) {
      const idx = col.panels.indexOf(panelId)
      if (idx !== -1) col.panels.splice(idx, 1)
    }

    const newCol = { id: `col-${Date.now()}`, panels: [panelId] }
    const refIdx = cols.findIndex(c => c.id === referenceColId)

    if (refIdx === -1) {
      cols.push(newCol)
    } else if (side === 'left') {
      cols.splice(refIdx, 0, newCol)
    } else {
      cols.splice(refIdx + 1, 0, newCol)
    }

    layout.value = {
      ...layout.value,
      columns: cols.filter(c => c.panels.length > 0),
    }
  }

  /** Update a column's pixel width. Pass null/undefined to make it flex:1. */
  function setColumnWidth(colId, widthPx) {
    const widths = { ...layout.value.columnWidths }
    if (widthPx == null) {
      delete widths[colId]
    } else {
      widths[colId] = widthPx
    }
    layout.value = { ...layout.value, columnWidths: widths }
  }

  /** Reset to default layout */
  function resetLayout() {
    layout.value = JSON.parse(JSON.stringify(DEFAULT_LAYOUT))
  }

  return { layout, movePanel, insertInNewColumn, setColumnWidth, resetLayout }
}

// ─── Theme ────────────────────────────────────────────────────────────────────
// Singleton: one isDark ref shared across all components.
// ref and watch are already imported above.

const THEME_KEY = 'storyfi-theme'
const isDark = ref(true)

function applyTheme(dark) {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
}

export function useTheme() {
  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved !== null) {
      isDark.value = saved === 'dark'
    } else {
      isDark.value = window.matchMedia('(prefers-color-scheme: dark)').matches
    }
    applyTheme(isDark.value)
  }

  function toggleTheme() {
    isDark.value = !isDark.value
  }

  watch(isDark, (dark) => {
    applyTheme(dark)
    localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light')
  })

  return { isDark, toggleTheme, initTheme }
}
