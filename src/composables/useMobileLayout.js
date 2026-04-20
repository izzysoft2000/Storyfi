/**
 * composables/useMobileLayout.js
 *
 * Detects mobile viewport, manages active panel, swipe gesture state,
 * and cast drawer open/close. Persists last viewed panel to localStorage.
 */

import { ref, computed, onMounted, onUnmounted } from 'vue'

const MOBILE_BREAKPOINT  = 768   // px — below this = mobile layout
const LAST_PANEL_KEY     = 'storyfi_mobile_last_panel'
const SWIPE_THRESHOLD    = 50    // px — minimum drag to trigger panel switch
const SWIPE_RESIST       = 0.35  // resistance factor past edge panels

export function useMobileLayout() {
  // ─── Viewport ────────────────────────────────────────────────────────────────
  const windowWidth  = ref(window.innerWidth)
  const windowHeight = ref(window.innerHeight)

  const isMobile   = computed(() => windowWidth.value  < MOBILE_BREAKPOINT)
  const isPortrait = computed(() => windowHeight.value > windowWidth.value)

  function onResize() {
    windowWidth.value  = window.innerWidth
    windowHeight.value = window.innerHeight
  }

  onMounted(()   => window.addEventListener('resize', onResize))
  onUnmounted(() => window.removeEventListener('resize', onResize))

  // ─── Active panel ─────────────────────────────────────────────────────────────
  // Panels in swipe order: editor (0) | playlist (1)
  const PANELS = ['editor', 'playlist']

  const activePanel = ref(
    PANELS.includes(localStorage.getItem(LAST_PANEL_KEY) ?? '')
      ? localStorage.getItem(LAST_PANEL_KEY)
      : 'editor'
  )

  const panelIndex = computed(() => PANELS.indexOf(activePanel.value))

  function setActivePanel(panel) {
    if (!PANELS.includes(panel)) return
    activePanel.value = panel
    localStorage.setItem(LAST_PANEL_KEY, panel)
    swipeDelta.value  = 0
  }

  // ─── Cast drawer ─────────────────────────────────────────────────────────────
  const castOpen = ref(false)

  // ─── Swipe gesture ───────────────────────────────────────────────────────────
  const swipeDelta    = ref(0)   // px — live drag offset, reset on commit
  const isSwiping     = ref(false)
  let   _touchStartX  = 0
  let   _touchStartY  = 0
  let   _swipeLocked  = false    // once we lock to swipe, ignore verticals

  function onTouchStart(e) {
    _touchStartX = e.touches[0].clientX
    _touchStartY = e.touches[0].clientY
    _swipeLocked = false
    isSwiping.value = false
  }

  function onTouchMove(e) {
    const dx = e.touches[0].clientX - _touchStartX
    const dy = e.touches[0].clientY - _touchStartY

    // On first move, decide axis
    if (!_swipeLocked && !isSwiping.value) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return  // not yet
      if (Math.abs(dy) > Math.abs(dx)) { _swipeLocked = true; return } // vertical scroll
      isSwiping.value = true
    }

    if (_swipeLocked) return
    e.preventDefault()

    // Apply resistance at edges
    const atStart = panelIndex.value === 0 && dx > 0
    const atEnd   = panelIndex.value === PANELS.length - 1 && dx < 0
    swipeDelta.value = (atStart || atEnd) ? dx * SWIPE_RESIST : dx
  }

  function onTouchEnd() {
    if (!isSwiping.value) { swipeDelta.value = 0; return }

    const delta = swipeDelta.value
    if (delta < -SWIPE_THRESHOLD && panelIndex.value < PANELS.length - 1) {
      setActivePanel(PANELS[panelIndex.value + 1])
    } else if (delta > SWIPE_THRESHOLD && panelIndex.value > 0) {
      setActivePanel(PANELS[panelIndex.value - 1])
    } else {
      swipeDelta.value = 0  // snap back
    }
    isSwiping.value = false
  }

  // CSS transform for the panel track.
  // Using vw units — NOT percentages, which would be relative to the track's
  // own width (200vw), causing translateX(-100%) to overshoot by 2× viewport.
  const trackStyle = computed(() => {
    const base = -panelIndex.value * 100  // vw per panel
    const drag = swipeDelta.value
    const transition = isSwiping.value ? 'none' : 'transform 0.28s cubic-bezier(0.4,0,0.2,1)'
    return {
      transform:  `translateX(calc(${base}vw + ${drag}px))`,
      transition,
    }
  })

  return {
    // Viewport
    isMobile, isPortrait,
    // Panel
    activePanel, panelIndex, setActivePanel, PANELS,
    // Cast drawer
    castOpen,
    // Swipe
    swipeDelta, isSwiping, trackStyle,
    onTouchStart, onTouchMove, onTouchEnd,
  }
}
