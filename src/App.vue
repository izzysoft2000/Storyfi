<template>
  <!-- Update Notification -->
  <div v-if="needRefresh" class="update-banner">
    <span>A new version of Storyfi is available.</span>
    <button @click="updateServiceWorker()">Update Now</button>
  </div>

  <LibraryView
  v-if="view === 'library'"
  :can-install="!!installEvent"
  @open-project="navigateTo"
  @install="triggerInstall"
  />
  <EditorView v-else-if="view === 'editor'" :project-id="activeProjectId" @go-library="navigateLibrary" />
  
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import LibraryView from '@/views/LibraryView.vue'
import EditorView  from '@/views/EditorView.vue'
import { useRegisterSW } from 'virtual:pwa-register/vue'
import { useTheme } from '@/composables/usePanelLayout'

const { initTheme } = useTheme()

const view            = ref('library')
const activeProjectId = ref(null)

// --- 1. Service Worker Update Logic ---
const { needRefresh, updateServiceWorker } = useRegisterSW()

function handleUpdate() {
  // You can trigger this from a toast or banner
  updateServiceWorker()
}

// --- 2. PWA Install Logic ---
const installEvent = ref(null)


async function triggerInstall() {
  if (!installEvent.value) return
  installEvent.value.prompt()
  const { outcome } = await installEvent.value.userChoice
  if (outcome === 'accepted') installEvent.value = null
}

function parseHash() {
  const hash = window.location.hash // e.g. "#/project/abc-123"
  const match = hash.match(/^#\/project\/(.+)$/)
  if (match) {
    activeProjectId.value = match[1]
    view.value = 'editor'
  } else {
    activeProjectId.value = null
    view.value = 'library'
  }
}

function navigateTo(projectId) {
  window.location.hash = `/project/${projectId}`
}

function navigateLibrary() {
  window.location.hash = '/'
}

function onHashChange() { parseHash() }

// ── Edge swipe prevention (stops iOS back/forward gesture in standalone PWA) ─
function onEdgeTouch(e) {
  if (e.touches.length !== 1) return
  // Never block taps on buttons, links, or other interactive elements
  if (e.target.closest('button, a, input, select, textarea, [role="button"]')) return
  const x = e.touches[0].clientX
  if (x < window.innerWidth * 0.1 || x > window.innerWidth * 0.9) {
    e.preventDefault()
  }
}

onMounted(() => {
  initTheme()
  parseHash()
  window.addEventListener('hashchange', onHashChange)
  if (window.matchMedia('(max-width: 768px)').matches) {
    window.addEventListener('touchstart', onEdgeTouch, { passive: false })
  }
})

onUnmounted(() => {
  window.removeEventListener('hashchange', onHashChange)
  window.removeEventListener('touchstart', onEdgeTouch)
})
</script>

<style>
/* ─── Design Tokens ──────────────────────────────────── */
:root {
  --color-bg:         #1a1418;
  --color-surface:    #221b20;
  --color-surface-soft: #2a222a;
  --color-border:     rgba(255,255,255,0.06);
  --color-accent:     #ff8e6e;
  --color-accent2:    oklch(70% 0.18 320);
  --color-highlight:  oklch(70% 0.18 320);
  --color-text:       #f4ecec;
  --color-text-muted: #a08c92;
  --color-text-faint: #5a4a52;
  --color-on-accent:  #1a1418;
  --color-success:    #4ade80;
  --color-warning:    #facc15;
  --color-error:      #f87171;

  --font-display: 'Fraunces', Georgia, serif;
  --font-ui:      'Inter', -apple-system, sans-serif;
  --font-mono:    'JetBrains Mono', 'Fira Code', monospace;
}

/* ─── Light Mode Tokens ──────────────────────────────── */
[data-theme="light"] {
  --color-bg:           #f5f0f2;
  --color-surface:      #ffffff;
  --color-surface-soft: #ede6e9;
  --color-border:       rgba(0,0,0,0.10);
  --color-accent:       #d4522a;
  --color-accent2:      oklch(50% 0.18 320);
  --color-highlight:    oklch(50% 0.18 320);
  --color-text:         #1a1418;
  --color-text-muted:   #7a5a62;
  --color-text-faint:   #c0a8b0;
  --color-on-accent:    #ffffff;
  --color-success:      #16a34a;
  --color-warning:      #b45309;
  --color-error:        #dc2626;
}


*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0 }

html, body {
  height: 100vh;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-ui);
  -webkit-font-smoothing: antialiased;
  overflow: hidden;
  overscroll-behavior-x: none;
}

#app {
  height: 100vh;
  background: var(--color-bg);
}

/* ─── Scrollbar Styling ───────────────────────────────── */
::-webkit-scrollbar              { width: 6px; height: 6px }
::-webkit-scrollbar-track        { background: transparent }
::-webkit-scrollbar-thumb        { background: var(--color-border); border-radius: 3px }
::-webkit-scrollbar-thumb:hover  { background: var(--color-accent) }

/* ─── Focus Ring ─────────────────────────────────────── */
:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

/* ─── Selection ──────────────────────────────────────── */
::selection {
  background: rgba(124, 92, 191, 0.3);
  color: var(--color-text);
}

.update-banner {
  position: fixed;
  top: 0; left: 0; right: 0;
  background: var(--color-accent);
  color: white;
  padding: 10px;
  text-align: center;
  z-index: 9999;
  display: flex; gap: 20px; justify-content: center; align-items: center;
}
.install-btn {
  position: fixed;
  bottom: 20px; right: 20px;
  background: var(--color-success);
  border: none; padding: 10px 20px; border-radius: 20px;
  cursor: pointer; font-weight: bold;
}
</style>
