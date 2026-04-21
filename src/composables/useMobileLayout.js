/**
 * composables/useMobileLayout.js
 *
 * 3-panel swipe layout: Cast | Editor | Playlist
 * Default panel: editor (index 1)
 * Bottom bar: navigation only (Cast | Edit | Play)
 */

import { ref, computed, onMounted, onUnmounted } from 'vue'

const MOBILE_BREAKPOINT = 768
const LAST_PANEL_KEY    = 'storyfi_mobile_last_panel'
const SWIPE_THRESHOLD   = 50
const SWIPE_RESIST      = 0.35

export function useMobileLayout() {
  // ─── Viewport ─────────────────────────────────────────────────────────────
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

  // ─── Active panel ──────────────────────────────────────────────────────────
  // 3 panels in swipe order: cast (0) | editor (1) | playlist (2)
  const PANELS = ['cast', 'editor', 'playlist']

  const saved = localStorage.getItem(LAST_PANEL_KEY)
  const activePanel = ref(PANELS.includes(saved) ? saved : 'editor')

  const panelIndex = computed(() => PANELS.indexOf(activePanel.value))

  function setActivePanel(panel) {
    if (!PANELS.includes(panel)) return
    activePanel.value = panel
    localStorage.setItem(LAST_PANEL_KEY, panel)
    swipeDelta.value  = 0
  }

  // ─── Swipe gesture ─────────────────────────────────────────────────────────
  const swipeDelta   = ref(0)
  const isSwiping    = ref(false)
  let   _touchStartX = 0
  let   _touchStartY = 0
  let   _swipeLocked = false

  function onTouchStart(e) {
    _touchStartX    = e.touches[0].clientX
    _touchStartY    = e.touches[0].clientY
    _swipeLocked    = false
    isSwiping.value = false
  }

  function onTouchMove(e) {
    const dx = e.touches[0].clientX - _touchStartX
    const dy = e.touches[0].clientY - _touchStartY

    if (!_swipeLocked && !isSwiping.value) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
      if (Math.abs(dy) > Math.abs(dx)) { _swipeLocked = true; return }
      isSwiping.value = true
    }

    if (_swipeLocked) return
    e.preventDefault()

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
      swipeDelta.value = 0
    }
    isSwiping.value = false
  }

  // track width = 300vw (3 panels × 100vw)
  const trackStyle = computed(() => {
    const base       = -panelIndex.value * 100
    const drag       = swipeDelta.value
    const transition = isSwiping.value ? 'none' : 'transform 0.28s cubic-bezier(0.4,0,0.2,1)'
    return {
      transform:  `translateX(calc(${base}vw + ${drag}px))`,
      transition,
    }
  })

  return {
    isMobile, isPortrait,
    activePanel, panelIndex, setActivePanel, PANELS,
    swipeDelta, isSwiping, trackStyle,
    onTouchStart, onTouchMove, onTouchEnd,
  }
}
