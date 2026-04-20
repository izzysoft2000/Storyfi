<template>
  <div class="library">
    <!-- Header -->
    <header class="library-header">
      <div class="brand-group">
        <div class="title-row">
          <h1 class="app-title">Storyfi</h1>
          <button
            v-if="canInstallChrome"
            class="install-pill"
            @click="triggerChromeInstall"
          >Install App</button>
        </div>
        <p class="app-subtitle">MULTI-VOICE AUDIO PRODUCTION</p>
      </div>
    </header>

    <!-- Project Grid -->
    <main class="library__main">
      <div v-if="loading" class="library__empty">
        <span class="library__empty-icon">⟳</span>
        <p>Loading projects…</p>
      </div>

      <div v-else-if="projects.length === 0" class="library__empty">
        <span class="library__empty-icon">✦</span>
        <p class="library__empty-title">No projects yet</p>
        <p class="library__empty-sub">Import a Markdown file or start a new project to begin.</p>
        <button class="action-btn action-btn--primary" style="margin-top:20px" @click="createProject">
          + New Project
        </button>
      </div>

      <div v-else class="project-grid">
        <div
          v-for="p in projects"
          :key="p.id"
          class="project-card"
          @click="openProject(p.id)"
        >
          <div class="project-card__top">
            <div class="project-card__role-chips">
              <span
                v-for="role in (p.cast ?? []).slice(0, 5)"
                :key="role.id"
                class="role-dot"
                :style="{ background: role.color }"
                :title="role.label"
              />
            </div>
            <div class="project-card__menu" @click.stop>
              <button class="icon-btn" title="Clear audio" @click="clearAudio(p)">⊘</button>
              <button class="icon-btn icon-btn--danger" title="Delete project" @click="deleteProjectConfirm(p)">✕</button>
            </div>
          </div>

          <h2 class="project-card__title">{{ p.title }}</h2>

          <div class="project-card__meta">
            <span class="meta-chip">
              {{ (p.paragraphGroups ?? []).length }} paragraphs
            </span>
            <span v-if="p.audioSizeBytes > 0" class="meta-chip meta-chip--audio">
              {{ formatBytes(p.audioSizeBytes) }} audio
            </span>
            <span v-else class="meta-chip meta-chip--muted">No audio yet</span>
          </div>

          <div class="project-card__footer">
            <span class="project-card__date">{{ relativeDate(p.updatedAt) }}</span>
            <button class="open-btn" @click.stop="openProject(p.id)">Open →</button>
          </div>
        </div>

        <!-- + New Project card — always last in the grid -->
        <div class="project-card project-card--new" @click="createProject">
          <span class="new-card__icon">+</span>
          <span class="new-card__label">New Project</span>
        </div>

      </div>
    </main>

    <!-- Storage Bar Footer -->
    <footer class="library__footer">
      <StorageBar ref="storageBarRef" @manage="showStorageManager = true" />
    </footer>

    <!-- Hidden MD file input -->
    <input
      ref="mdInput"
      type="file"
      accept=".md,.markdown,text/markdown"
      style="display:none"
      @change="onMdFileSelected"
    />

    <!-- New Project Name Modal -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="newProjectModal" class="modal-backdrop" @click.self="newProjectModal = false">
          <div class="modal">
            <h3 class="modal__title">New Project</h3>
            <input
              ref="newTitleInput"
              v-model="newProjectTitle"
              class="modal__input"
              placeholder="Project title…"
              maxlength="80"
              @keydown.enter="confirmNewProject"
              @keydown.esc="newProjectModal = false"
            />
            <div class="modal__actions">
              <button class="btn btn--ghost" @click="newProjectModal = false">Cancel</button>
              <button
                class="btn btn--accent"
                :disabled="!newProjectTitle.trim()"
                @click="confirmNewProject"
              >Create</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Confirm Modal -->
    <ConfirmModal ref="confirmRef" />

    <!-- Toast -->
    <Toast ref="toastRef" />

    <!-- PWA install hint (iOS Safari) -->
    <Transition name="install-fade">
      <div v-if="showInstallHint" class="install-hint" @click="dismissInstallHint">
        <div class="install-hint__inner">
          <span class="install-hint__icon">⬆</span>
          <span class="install-hint__text">
            Tap <b>Share</b> then <b>Add to Home Screen</b> to install Storyfi
          </span>
          <button class="install-hint__close" @click.stop="dismissInstallHint">✕</button>
        </div>
        <div class="install-hint__arrow" />
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue'
import StorageBar   from '@/components/StorageBar.vue'
import ConfirmModal from '@/components/ConfirmModal.vue'
import Toast        from '@/components/Toast.vue'
import { getAllProjects, saveProject, deleteProjectFull, clearProjectAudio } from '@/store/db.js'
import { formatBytes } from '@/storage/quota.js'
import { requestPersistentStorage, isPersistent } from '@/storage/quota.js'
import { useProjectStore } from '@/store/project.js'

const emit = defineEmits(['open-project', 'install'])

const store          = useProjectStore()
const projects       = ref([])
const loading        = ref(true)
const storageBarRef  = ref(null)
const confirmRef     = ref(null)
const toastRef       = ref(null)
const mdInput        = ref(null)

// New project modal
const newProjectModal  = ref(false)
const newProjectTitle  = ref('')
const newTitleInput    = ref(null)
const pendingMdContent = ref(null) // set when creating from .md import

const props = defineProps({
  // canInstall was removed — Chrome install is now handled via
  // beforeinstallprompt listener inside LibraryView directly
})

async function load() {
  loading.value = true
  try {
    const all = await getAllProjects()
    projects.value = all.sort((a, b) => b.updatedAt - a.updatedAt)
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await load()
  // Request persistent storage on first visit if not yet granted
  const already = await isPersistent()
  if (!already) await requestPersistentStorage()
  // Show iOS install hint if: not already installed, on iOS, not dismissed before
  checkInstallHint()
})

// ─── PWA Install — Chrome/Android ────────────────────────────────────────────
// Capture beforeinstallprompt before vite-plugin-pwa can swallow it.
// The plugin calls preventDefault() to defer the prompt — we do the same,
// but we store the event and call .prompt() ourselves on button click.

const canInstallChrome  = ref(false)
let   _installPromptEvt = null

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()                 // defer default browser mini-infobar
  _installPromptEvt  = e
  canInstallChrome.value = true
})

window.addEventListener('appinstalled', () => {
  canInstallChrome.value = false
  _installPromptEvt = null
})

async function triggerChromeInstall() {
  if (!_installPromptEvt) return
  _installPromptEvt.prompt()
  const { outcome } = await _installPromptEvt.userChoice
  if (outcome === 'accepted') {
    canInstallChrome.value = false
    _installPromptEvt = null
  }
}

const INSTALL_DISMISSED_KEY = 'storyfi_install_dismissed'
const showInstallHint = ref(false)

function checkInstallHint() {
  // Already installed as PWA — don't show
  if (window.matchMedia('(display-mode: standalone)').matches) return
  if (window.navigator.standalone) return  // iOS Safari standalone mode
  // Already dismissed
  if (localStorage.getItem(INSTALL_DISMISSED_KEY)) return
  // Only show on mobile iOS (Safari) or Android Chrome
  const isIOS     = /iPad|iPhone|iPod/.test(navigator.userAgent)
  const isAndroid = /Android/.test(navigator.userAgent)
  if (!isIOS && !isAndroid) return
  // Show after a short delay so the page settles first
  setTimeout(() => { showInstallHint.value = true }, 1500)
}

function dismissInstallHint() {
  showInstallHint.value = false
  localStorage.setItem(INSTALL_DISMISSED_KEY, '1')
}

// ─── Create Project ──────────────────────────────────────────────────────────

function createProject() {
  pendingMdContent.value = null
  newProjectTitle.value  = ''
  newProjectModal.value  = true
  nextTick(() => newTitleInput.value?.focus())
}

async function confirmNewProject() {
  const title = newProjectTitle.value.trim()
  if (!title) return
  newProjectModal.value = false

  const p = store.createBlankProject(title)
  if (pendingMdContent.value) {
    p.sourceMarkdown = pendingMdContent.value
    pendingMdContent.value = null
  }

  await saveProject(p)
  await load()
  storageBarRef.value?.refresh()

  // Navigate to editor
  emit('open-project', p.id)
}

// ─── Import .md ─────────────────────────────────────────────────────────────

function importMd() {
  mdInput.value.value = ''
  mdInput.value.click()
}

function onMdFileSelected(e) {
  const file = e.target.files[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = ev => {
    pendingMdContent.value = ev.target.result
    // Pre-fill title from filename (strip extension)
    newProjectTitle.value = file.name.replace(/\.(md|markdown)$/i, '')
    newProjectModal.value = true
    nextTick(() => newTitleInput.value?.focus())
  }
  reader.readAsText(file)
}

// ─── Open Project ────────────────────────────────────────────────────────────

function openProject(id) {
  emit('open-project', id)
}

// ─── Clear Audio ─────────────────────────────────────────────────────────────

async function clearAudio(p) {
  const ok = await confirmRef.value.open({
    title:        'Clear audio?',
    message:      `This will remove all generated audio for "${p.title}". Your script, tags, and voice assignments are kept. You can re-generate at any time.`,
    confirmLabel: 'Clear Audio',
    cancelLabel:  'Cancel',
    variant:      'danger',
  })
  if (!ok) return

  await clearProjectAudio(p)
  toastRef.value.show(`Audio cleared for "${p.title}"`, 'success')
  await load()
  storageBarRef.value?.refresh()
}

// ─── Delete Project ──────────────────────────────────────────────────────────

async function deleteProjectConfirm(p) {
  const ok = await confirmRef.value.open({
    title:        'Delete project?',
    message:      `"${p.title}" and all its audio will be permanently deleted. This cannot be undone.`,
    confirmLabel: 'Delete',
    cancelLabel:  'Cancel',
    variant:      'danger',
  })
  if (!ok) return

  await deleteProjectFull(p)
  toastRef.value.show(`"${p.title}" deleted`, 'info')
  await load()
  storageBarRef.value?.refresh()
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function relativeDate(ts) {
  if (!ts) return ''
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60_000)
  const h = Math.floor(diff / 3_600_000)
  const d = Math.floor(diff / 86_400_000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  if (h < 24) return `${h}h ago`
  if (d < 7)  return `${d}d ago`
  return new Date(ts).toLocaleDateString()
}
</script>

<style scoped>
.library {
  position: fixed;
  inset: 0;                   /* anchors all 4 edges — guaranteed edge-to-edge on iOS */
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--color-bg);
  color: var(--color-text);
  padding-top: env(safe-area-inset-top);
  box-sizing: border-box;
}

/* ─── Header ─────────────────────────────────────────── */
.library__header,
.library-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 28px 48px 24px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.library__brand { display: flex; flex-direction: column; gap: 2px }

.library__logo {
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 700;
  color: var(--color-text);
  margin: 0;
  letter-spacing: -0.02em;
}

.library__tagline {
  font-size: 12px;
  color: var(--color-text-muted);
  font-weight: 300;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.library__actions { display: flex; gap: 10px }

.action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 18px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  font-family: var(--font-ui);
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.15s;
}
.action-btn__icon { font-size: 16px; line-height: 1 }

.action-btn--ghost {
  background: transparent;
  border-color: var(--color-border);
  color: var(--color-text-muted);
}
.action-btn--ghost:hover {
  border-color: var(--color-accent);
  color: var(--color-text);
}

.action-btn--primary {
  background: var(--color-accent);
  color: #fff;
}
.action-btn--primary:hover { background: #6a4db0 }

/* ─── Main ───────────────────────────────────────────── */
.library__main {
  flex: 1;
  overflow-y: auto;
  padding: 40px 48px;
}

@media (max-width: 600px) {
  .library__main { padding: 20px 16px; }
}

/* ─── Empty State ────────────────────────────────────── */
.library__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 300px;
  text-align: center;
  gap: 8px;
  color: var(--color-text-muted);
}

.library__empty-icon {
  font-size: 40px;
  margin-bottom: 8px;
  opacity: 0.4;
}

.library__empty-title {
  font-family: var(--font-display);
  font-size: 20px;
  color: var(--color-text);
  margin: 0;
}

.library__empty-sub {
  font-size: 14px;
  max-width: 320px;
  line-height: 1.6;
  margin: 0;
}

/* ─── Project Grid ───────────────────────────────────── */
.project-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(300px, 100%), 1fr));
  gap: 16px;
}

.project-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 20px;
  cursor: pointer;
  transition: border-color 0.15s, transform 0.15s, box-shadow 0.15s;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.project-card:hover {
  border-color: var(--color-accent);
  transform: translateY(-2px);
  box-shadow: 0 8px 32px rgba(0,0,0,0.3);
}

.project-card__top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.project-card__role-chips { display: flex; gap: 5px; align-items: center }

.role-dot {
  width: 10px; height: 10px;
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
}

.project-card__menu { display: flex; gap: 4px; opacity: 0; transition: opacity 0.15s }
.project-card:hover .project-card__menu { opacity: 1 }

.icon-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 13px;
  color: var(--color-text-muted);
  padding: 4px 6px;
  border-radius: 4px;
  transition: all 0.1s;
  font-family: var(--font-ui);
}
.icon-btn:hover       { background: var(--color-border); color: var(--color-text) }
.icon-btn--danger:hover { background: rgba(248,113,113,0.15); color: var(--color-error) }

.project-card__title {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text);
  margin: 0;
  line-height: 1.3;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.project-card__meta { display: flex; gap: 6px; flex-wrap: wrap }

.meta-chip {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 20px;
  border: 1px solid var(--color-border);
  color: var(--color-text-muted);
  font-family: var(--font-mono);
}
.meta-chip--audio { border-color: rgba(124,92,191,0.4); color: var(--color-accent) }
.meta-chip--muted { opacity: 0.5 }

.project-card__footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: auto;
  padding-top: 4px;
}

.project-card__date {
  font-size: 11px;
  color: var(--color-text-muted);
  font-family: var(--font-mono);
}

.open-btn {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-accent);
  background: none;
  border: none;
  cursor: pointer;
  font-family: var(--font-ui);
  transition: color 0.15s;
  padding: 0;
}
.open-btn:hover { color: var(--color-highlight) }

/* ─── Footer ─────────────────────────────────────────── */
.library__footer {
  padding: 16px 48px;
  padding-bottom: calc(16px + env(safe-area-inset-bottom));
  border-top: 1px solid var(--color-border);
  flex-shrink: 0;
}

@media (max-width: 600px) {
  .library__footer {
    padding: 12px 16px;
    padding-bottom: calc(12px + env(safe-area-inset-bottom));
  }
}

/* ─── Modal ──────────────────────────────────────────── */
.modal-backdrop {
  position: fixed; inset: 0;
  background: rgba(14,12,24,0.8);
  backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  z-index: 100;
}

.modal {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 28px 32px;
  max-width: 440px;
  width: 90%;
  box-shadow: 0 20px 60px rgba(0,0,0,0.5);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.modal__title {
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 600;
  margin: 0;
  color: var(--color-text);
}

.modal__input {
  width: 100%;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 14px;
  font-family: var(--font-ui);
  color: var(--color-text);
  outline: none;
  transition: border-color 0.15s;
  box-sizing: border-box;
}
.modal__input:focus { border-color: var(--color-accent) }
.modal__input::placeholder { color: var(--color-text-muted) }

.modal__actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

.btn {
  padding: 9px 20px;
  border-radius: 7px;
  font-size: 13px;
  font-weight: 500;
  font-family: var(--font-ui);
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.15s;
}
.btn:disabled { opacity: 0.4; cursor: not-allowed }

.btn--ghost {
  background: transparent;
  border-color: var(--color-border);
  color: var(--color-text-muted);
}
.btn--ghost:hover { border-color: var(--color-text-muted); color: var(--color-text) }

.btn--accent {
  background: var(--color-accent);
  color: #fff;
}
.btn--accent:hover:not(:disabled) { background: #6a4db0 }

/* Transitions */
.modal-enter-active, .modal-leave-active { transition: all 0.2s ease }
.modal-enter-from, .modal-leave-to       { opacity: 0; transform: scale(0.95) }

.title-row {
  display: flex;
  align-items: center;
  gap: 15px; /* Space between Storyfi and the button */
}

.install-pill {
  background: var(--color-success); /* Use your green color variable */
  color: #0e0c18; /* Dark text for contrast on green */
  border: none;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 700;
  cursor: pointer;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  transition: transform 0.2s ease;
}

.install-pill:hover {
  transform: scale(1.05);
  filter: brightness(1.1);
}

.app-title {
  font-family: var(--font-display);
  font-size: 2.5rem;
  margin: 0;
}

/* Hide header action buttons on mobile — Import lives in EditorView bottom bar */
@media (max-width: 600px) {
  .actions--desktop-only { display: none; }
}

/* ─── + New Project card ─────────────────────────────── */
.project-card--new {
  border-style: dashed;
  border-color: var(--color-border);
  background: transparent;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 160px;
  transition: border-color 0.15s, background 0.15s;
}
.project-card--new:hover {
  border-color: var(--color-accent);
  background: rgba(124,92,191,0.05);
}
.new-card__icon {
  font-size: 28px;
  color: var(--color-text-muted);
  line-height: 1;
  transition: color 0.15s;
}
.new-card__label {
  font-family: var(--font-ui);
  font-size: 13px;
  color: var(--color-text-muted);
  transition: color 0.15s;
}
.project-card--new:hover .new-card__icon,
.project-card--new:hover .new-card__label {
  color: var(--color-accent);
}

/* ─── PWA Install Hint ───────────────────────────────── */
.install-hint {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 200;
  width: min(360px, calc(100vw - 32px));
  filter: drop-shadow(0 8px 24px rgba(0,0,0,0.5));
}

.install-hint__inner {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--color-surface);
  border: 1px solid var(--color-accent);
  border-radius: 14px;
  padding: 14px 16px;
  font-family: var(--font-ui);
  font-size: 13px;
  color: var(--color-text);
  line-height: 1.4;
}

.install-hint__icon {
  font-size: 20px;
  flex-shrink: 0;
  color: var(--color-accent);
}

.install-hint__text { flex: 1 }
.install-hint__text b { color: var(--color-highlight) }

.install-hint__close {
  all: unset;
  cursor: pointer;
  color: var(--color-text-muted);
  font-size: 13px;
  padding: 2px 6px;
  flex-shrink: 0;
  border-radius: 4px;
  transition: color 0.15s;
}
.install-hint__close:active { color: var(--color-text) }

/* Arrow pointing down toward the browser chrome */
.install-hint__arrow {
  width: 0;
  height: 0;
  border-left: 10px solid transparent;
  border-right: 10px solid transparent;
  border-top: 10px solid var(--color-accent);
  margin: 0 auto;
}

.install-fade-enter-active { transition: opacity 0.3s ease, transform 0.3s ease }
.install-fade-leave-active { transition: opacity 0.2s ease, transform 0.2s ease }
.install-fade-enter-from,
.install-fade-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(12px);
}
</style>
