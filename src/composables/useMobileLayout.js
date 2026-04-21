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

  function setActivePanel(panel) {
    if (!PANELS.includes(panel)) return
    activePanel.value = panel
    localStorage.setItem(LAST_PANEL_KEY, panel)
  }

  // ─── Track style — tab navigation only, no swipe ──────────────────────────
  const trackStyle = computed(() => ({
    transform:  `translateX(${-panelIndex.value * 100}vw)`,
    transition: 'transform 0.28s cubic-bezier(0.4,0,0.2,1)',
  }))

  return {
    isMobile, isPortrait,
    activePanel, panelIndex, setActivePanel, PANELS,
    trackStyle,
  }
}
