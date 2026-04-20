/**
 * src/composables/usePanelDrag.js
 *
 * Manages the drag-and-drop state for dockable panels.
 *
 * The ghost element is raw DOM (not Vue) following Bug Fix #4 — no reactive
 * state during mousemove. Only the identifiers (draggingPanelId, activeDropZone)
 * are reactive refs, updated on mousemove.
 *
 * Drop zones are identified by data-drop-zone JSON attributes on DOM elements.
 * On each mousemove the ghost position is used to find the active zone.
 */

import { ref } from 'vue'

// ─── Reactive state (consumed by templates) ───────────────────────────────────

export const draggingPanelId = ref(null)
export const activeDropZone  = ref(null)

// ─── Panel display metadata ───────────────────────────────────────────────────

const PANEL_META = {
  cast:     { label: 'Voice Cast', icon: '🎭' },
  playlist: { label: 'Playlist',   icon: '♪'  },
  editor:   { label: 'Editor',     icon: '✏'  },
}

// ─── Non-reactive drag internals (Bug Fix #4 pattern) ────────────────────────

let _ghostEl   = null
let _dragging  = false
let _onDropFn  = null

// ─── Ghost element ────────────────────────────────────────────────────────────

function createGhost(panelId, x, y) {
  const meta  = PANEL_META[panelId] ?? { label: panelId, icon: '▣' }
  const style = getComputedStyle(document.documentElement)
  const get   = v => style.getPropertyValue(v).trim()

  const el = document.createElement('div')
  el.innerHTML = `<span style="opacity:0.6;font-size:15px">${meta.icon}</span>
                  <span style="font-weight:600;letter-spacing:0.01em">${meta.label}</span>`

  Object.assign(el.style, {
    position:      'fixed',
    zIndex:        '10000',
    pointerEvents: 'none',
    display:       'flex',
    alignItems:    'center',
    gap:           '8px',
    padding:       '8px 16px',
    background:    get('--color-surface') || '#1a1625',
    border:        `2px solid ${get('--color-accent') || '#7c5cbf'}`,
    borderRadius:  '8px',
    color:         get('--color-text')    || '#f0eeff',
    fontFamily:    get('--font-ui')       || 'DM Sans, sans-serif',
    fontSize:      '13px',
    opacity:       '0.92',
    boxShadow:     '0 8px 32px rgba(0,0,0,0.55)',
    cursor:        'grabbing',
    userSelect:    'none',
    left:          `${x + 14}px`,
    top:           `${y + 10}px`,
    transition:    'none',
    willChange:    'left, top',
  })

  document.body.appendChild(el)
  return el
}

function updateGhostPos(x, y) {
  if (!_ghostEl) return
  _ghostEl.style.left = `${x + 14}px`
  _ghostEl.style.top  = `${y + 10}px`
}

function destroyGhost() {
  _ghostEl?.remove()
  _ghostEl = null
}

// ─── Drop zone detection ──────────────────────────────────────────────────────

/**
 * Scan all [data-drop-zone] elements and return the one containing (x, y).
 * Uses element bounding rects — no mouseenter/mouseleave needed.
 */
function findDropZone(x, y) {
  const els = document.querySelectorAll('[data-drop-zone]')
  for (const el of els) {
    const r = el.getBoundingClientRect()
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
      try { return JSON.parse(el.dataset.dropZone) } catch (_) {}
    }
  }
  return null
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Begin dragging a panel. Call from a mousedown handler on the drag handle.
 *
 * @param {string}   panelId  — 'cast' | 'playlist' | 'editor'
 * @param {MouseEvent} event
 * @param {function} onDrop   — called with (panelId, dropZone) on mouseup
 */
export function startDrag(panelId, event, onDrop) {
  if (_dragging) return
  _dragging = true
  _onDropFn = onDrop

  draggingPanelId.value = panelId
  activeDropZone.value  = null

  _ghostEl = createGhost(panelId, event.clientX, event.clientY)

  document.body.style.cursor     = 'grabbing'
  document.body.style.userSelect = 'none'
  document.body.style.webkitUserSelect = 'none'

  function onMouseMove(e) {
    updateGhostPos(e.clientX, e.clientY)
    // Update active drop zone every frame (throttle: only if moved > 2px is handled
    // implicitly by the browser's mousemove coalescing)
    activeDropZone.value = findDropZone(e.clientX, e.clientY)
  }

  function onMouseUp(e) {
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup',   onMouseUp)

    document.body.style.cursor     = ''
    document.body.style.userSelect = ''
    document.body.style.webkitUserSelect = ''

    const zone = findDropZone(e.clientX, e.clientY)
    destroyGhost()
    _dragging = false

    draggingPanelId.value = null
    activeDropZone.value  = null

    if (zone) _onDropFn?.(panelId, zone)
    _onDropFn = null
  }

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup',   onMouseUp)
}

/**
 * Returns true if the given zone descriptor matches the current activeDropZone.
 * Used in templates to apply highlight classes.
 */
export function isActiveZone(zone) {
  const a = activeDropZone.value
  if (!a || !zone) return false
  return JSON.stringify(a) === JSON.stringify(zone)
}
