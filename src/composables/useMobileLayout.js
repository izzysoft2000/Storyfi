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

  const TRANSITION_MS = 320  // slightly longer than 0.28s animation
  const isSwitching = ref(false)
  let switchTimer = null

  function setActivePanel(panel) {
    if (!PANELS.includes(panel)) return
    activePanel.value = panel
    localStorage.setItem(LAST_PANEL_KEY, panel)
    // Block scroll-triggering side effects during the slide transition
    isSwitching.value = true
    clearTimeout(switchTimer)
    switchTimer = setTimeout(() => { isSwitching.value = false }, TRANSITION_MS)
  }

  // ─── Track style — tab navigation only, no swipe ──────────────────────────
  // Use window.innerWidth px instead of 100vw — on iOS Safari, `vw` includes
  // the browser chrome/scrollbar and can differ from the actual rendered panel
  // width, causing cumulative drift when switching panels.
  const trackStyle = computed(() => ({
    transform:  `translateX(${-panelIndex.value * windowWidth.value}px)`,
    transition: 'transform 0.28s cubic-bezier(0.4,0,0.2,1)',
  }))

  return {
    isMobile, isPortrait,
    activePanel, panelIndex, setActivePanel, PANELS,
    trackStyle, isSwitching,
  }
}
