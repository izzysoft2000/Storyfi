<template>
  <div class="library">
    <!-- Header -->
    <header class="library-header">
      <div class="brand-group">
        <div class="title-row">
          <h1 class="app-title">Storyfi</h1>
          <button class="app-version" @click="showBuildInfo = true">v{{ appVersion }}</button>
          <button
            v-if="canInstallChrome"
            class="install-pill"
            @click="triggerChromeInstall"
          >Install App</button>
        </div>
        <p class="app-subtitle">MULTI-VOICE AUDIO PRODUCTION</p>
      </div>

      <!-- Build info dialog -->
      <div v-if="showBuildInfo" class="build-dialog-backdrop" @click.self="showBuildInfo = false">
        <div class="build-dialog">
          <p class="build-dialog-title">Storyfi v{{ appVersion }}</p>
          <p class="build-dialog-date">Built {{ buildDateDisplay }}</p>
          <button class="build-dialog-close" @click="showBuildInfo = false">OK</button>
        </div>
      </div>
      <button
        class="lib-theme-btn"
        :title="isDark ? 'Switch to Light mode' : 'Switch to Dark mode'"
        @click="toggleTheme"
      >
        <span v-if="isDark">☀</span><span v-else>🌙</span>
      </button>
    </header>

    <!-- Toolbar — stays fixed above the scrolling project grid -->
    <div v-if="!loading" class="library__toolbar">
      <div class="toolbar__left">
        <div class="tab-switch">
          <button
            class="tab-btn"
            :class="{ 'tab-btn--active': activeTab === 'projects' }"
            @click="setActiveTab('projects')"
          >Projects <span class="tab-btn__count">{{ standaloneProjects.length }}</span></button>
          <button
            class="tab-btn"
            :class="{ 'tab-btn--active': activeTab === 'solutions' }"
            @click="setActiveTab('solutions')"
          >Solutions <span class="tab-btn__count">{{ solutions.length }}</span></button>
        </div>
        <button
          class="toolbar__add-btn"
          :title="activeTab === 'projects' ? 'New Project' : 'New Solution'"
          @click="activeTab === 'projects' ? createProject() : createSolution()"
        >+</button>
      </div>
      <div v-if="activeListCount > 0" class="sort-control">
        <span class="sort-label">Sort</span>
        <button
          v-for="opt in sortOptions"
          :key="opt.value"
          class="sort-btn"
          :class="{ 'sort-btn--active': sortBy === opt.value }"
          :title="opt.label"
          @click="setSortBy(opt.value)"
        >
          <span class="sort-btn__icon">{{ opt.icon }}</span>
          <span class="sort-btn__label">{{ opt.label }}</span>
        </button>
      </div>
    </div>

    <!-- Project / Solution Grid -->
    <main class="library__main">
      <div v-if="loading" class="library__empty">
        <span class="library__empty-icon">⟳</span>
        <p>Loading…</p>
      </div>

      <template v-else-if="activeTab === 'projects'">
        <div v-if="standaloneProjects.length === 0" class="library__empty">
          <span class="library__empty-icon">✦</span>
          <p class="library__empty-title">No projects yet</p>
          <p class="library__empty-sub">Import a Markdown file or start a new project to begin.</p>
          <button class="action-btn action-btn--primary" style="margin-top:20px" @click="createProject">
            + New Project
          </button>
        </div>

        <div v-else class="project-grid">
          <ProjectCard
            v-for="p in sortedStandaloneProjects"
            :key="p.id"
            :project="p"
            show-add-to-solution
            @open="openProject(p.id)"
            @clear-audio="clearAudio(p)"
            @delete="deleteProjectConfirm(p)"
            @add-to-solution="openAddToSolution(p)"
          />

          <!-- + New Project card — always last in the grid -->
          <div class="project-card project-card--new" @click="createProject">
            <span class="new-card__icon">+</span>
            <span class="new-card__label">New Project</span>
          </div>
        </div>
      </template>

      <template v-else>
        <div v-if="solutions.length === 0" class="library__empty">
          <span class="library__empty-icon">📚</span>
          <p class="library__empty-title">No solutions yet</p>
          <p class="library__empty-sub">Group related Projects — like chapters of a book — into a Solution.</p>
          <button class="action-btn action-btn--primary" style="margin-top:20px" @click="createSolution">
            + New Solution
          </button>
        </div>

        <div v-else class="project-grid">
          <div
            v-for="s in sortedSolutions"
            :key="s.id"
            class="project-card"
            @click="openSolution(s.id)"
          >
            <div class="project-card__thumb solution-card__thumb">
              <span class="solution-card__icon">📚</span>
              <div class="project-card__menu" @click.stop>
                <button class="icon-btn icon-btn--danger" title="Delete solution" @click="deleteSolutionConfirm(s)">✕</button>
              </div>
            </div>

            <div class="project-card__body">
              <div class="project-card__avatars">
                <span
                  v-for="role in solutionCast(s).slice(0, 5)"
                  :key="role.id"
                  class="cast-avatar"
                  :style="{ background: role.color }"
                  :title="role.label"
                >{{ (role.label || '?')[0].toUpperCase() }}</span>
              </div>

              <h2 class="project-card__title">{{ s.title }}</h2>

              <div class="project-card__meta">
                <span class="meta-chip">
                  {{ (s.projectOrder ?? []).length }} project{{ (s.projectOrder ?? []).length === 1 ? '' : 's' }}
                </span>
                <span v-if="solutionAudioBytes(s) > 0" class="meta-chip meta-chip--audio">
                  {{ formatBytes(solutionAudioBytes(s)) }} audio
                </span>
                <span v-else class="meta-chip meta-chip--muted">No audio yet</span>
              </div>

              <div class="project-card__footer">
                <span class="project-card__date">{{ relativeDate(s.updatedAt) }}</span>
                <button class="open-btn" @click.stop="openSolution(s.id)">Open →</button>
              </div>
            </div>
          </div>

          <!-- + New Solution card — always last in the grid -->
          <div class="project-card project-card--new" @click="createSolution">
            <span class="new-card__icon">+</span>
            <span class="new-card__label">New Solution</span>
          </div>
        </div>
      </template>
    </main>

    <!-- Storage Bar Footer -->
    <footer class="library__footer">
      <StorageBar ref="storageBarRef" @manage="showStorageManager = true" />
    </footer>
    <div class="library__safe-bottom" />

    <!-- Hidden MD file input -->
    <input
      ref="mdInput"
      type="file"
      accept=".md,.markdown,text/markdown"
      style="display:none"
      @change="onMdFileSelected"
    />

    <!-- New Project / New Solution Modal (shared) -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="newProjectModal" class="modal-backdrop" @click.self="newProjectModal = false">
          <div class="modal">
            <h3 class="modal__title">{{ createKind === 'project' ? 'New Project' : 'New Solution' }}</h3>
            <input
              ref="newTitleInput"
              v-model="newProjectTitle"
              class="modal__input"
              :placeholder="createKind === 'project' ? 'Project title…' : 'Solution title…'"
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

    <!-- Add to Solution picker -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="addToSolutionModal" class="modal-backdrop" @click.self="addToSolutionModal = false">
          <div class="modal">
            <h3 class="modal__title">Add to Solution</h3>
            <p class="modal__hint">Add "{{ addToSolutionTarget?.title }}" to a Solution.</p>
            <div v-if="solutions.length > 0" class="solution-picker-list">
              <button
                v-for="s in solutions"
                :key="s.id"
                class="solution-picker-row"
                @click="assignExistingSolution(s)"
              >
                <span>{{ s.title }}</span>
                <span class="solution-picker-row__count">{{ (s.projectOrder ?? []).length }}</span>
              </button>
            </div>
            <p v-else class="modal__hint">You don't have any Solutions yet.</p>
            <div class="modal__actions">
              <button class="btn btn--ghost" @click="addToSolutionModal = false">Cancel</button>
              <button class="btn btn--accent" @click="createSolutionAndAssign">+ New Solution</button>
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
import { ref, computed, onMounted, nextTick } from 'vue'
import StorageBar   from '@/components/StorageBar.vue'
import ConfirmModal from '@/components/ConfirmModal.vue'
import Toast        from '@/components/Toast.vue'
import ProjectCard  from '@/components/ProjectCard.vue'
import {
  getAllProjects, saveProject, deleteProjectFull, clearProjectAudio,
  getAllSolutions, saveSolution, deleteSolutionFull,
} from '@/store/db.js'
import { formatBytes } from '@/storage/quota.js'
import { requestPersistentStorage, isPersistent } from '@/storage/quota.js'
import { useProjectStore } from '@/store/project.js'
import { useTheme } from '@/composables/usePanelLayout.js'
import { relativeDate } from '@/utils/relativeDate.js'
import { uuid } from '@/utils/uuid.js'

const emit = defineEmits(['open-project', 'open-solution', 'install'])

const store          = useProjectStore()
const { isDark, toggleTheme } = useTheme()
const projects       = ref([])
const solutions      = ref([])
const loading        = ref(true)
const storageBarRef  = ref(null)
const confirmRef     = ref(null)
const toastRef       = ref(null)
const mdInput        = ref(null)

// New Project / New Solution modal (shared) — createKind decides what
// confirmNewProject() actually does: 'project', 'solution', or
// 'solution-assign' (create a Solution and immediately add a Project to it)
const newProjectModal  = ref(false)
const newProjectTitle  = ref('')
const newTitleInput    = ref(null)
const pendingMdContent = ref(null) // set when creating from .md import
const createKind       = ref('project')

// Add-to-Solution picker modal
const addToSolutionModal  = ref(false)
const addToSolutionTarget = ref(null)

const props = defineProps({
  // canInstall was removed — Chrome install is now handled via
  // beforeinstallprompt listener inside LibraryView directly
})

async function load() {
  loading.value = true
  try {
    const [allProjects, allSolutions] = await Promise.all([getAllProjects(), getAllSolutions()])
    projects.value  = allProjects
    solutions.value = allSolutions
  } finally {
    loading.value = false
  }
}

// ─── Tabs (Projects / Solutions) ──────────────────────────────────────────────

const TAB_KEY   = 'storyfi_library_tab'
const activeTab = ref(localStorage.getItem(TAB_KEY) || 'projects')

function setActiveTab(tab) {
  activeTab.value = tab
  localStorage.setItem(TAB_KEY, tab)
}

// Projects already grouped into a Solution live only in their Solution's view
const standaloneProjects = computed(() => projects.value.filter(p => !p.solutionId))

const activeListCount = computed(() =>
  activeTab.value === 'projects' ? standaloneProjects.value.length : solutions.value.length
)

// ─── Sorting ─────────────────────────────────────────────────────────────────

const SORT_KEY = 'storyfi_library_sort'
const sortOptions = [
  { value: 'newest', label: 'Newest', icon: '↓' },
  { value: 'oldest', label: 'Oldest', icon: '↑' },
  { value: 'name',   label: 'Name',   icon: 'Aa' },
]
const sortBy = ref(localStorage.getItem(SORT_KEY) || 'newest')

function setSortBy(value) {
  sortBy.value = value
  localStorage.setItem(SORT_KEY, value)
}

function sortByCurrent(list) {
  const copy = [...list]
  switch (sortBy.value) {
    case 'oldest':
      return copy.sort((a, b) => a.updatedAt - b.updatedAt)
    case 'name':
      return copy.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }))
    case 'newest':
    default:
      return copy.sort((a, b) => b.updatedAt - a.updatedAt)
  }
}

const sortedStandaloneProjects = computed(() => sortByCurrent(standaloneProjects.value))
const sortedSolutions          = computed(() => sortByCurrent(solutions.value))

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

const showBuildInfo = ref(false)
const appVersion = __APP_VERSION__ // injected at build time from package.json (see vite.config.js)
const buildDateDisplay = computed(() => {
  try {
    return new Date(__BUILD_DATE__).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return __BUILD_DATE__
  }
})
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
  createKind.value = 'project'
  pendingMdContent.value = null
  newProjectTitle.value  = ''
  newProjectModal.value  = true
  nextTick(() => newTitleInput.value?.focus())
}

async function confirmNewProject() {
  const title = newProjectTitle.value.trim()
  if (!title) return
  newProjectModal.value = false

  if (createKind.value === 'solution' || createKind.value === 'solution-assign') {
    const s = {
      id: uuid(), title, projectOrder: [],
      createdAt: Date.now(), updatedAt: Date.now(),
    }
    await saveSolution(s)

    if (createKind.value === 'solution-assign' && addToSolutionTarget.value) {
      await addProjectToSolution(addToSolutionTarget.value, s)
      addToSolutionTarget.value = null
      return
    }

    await load()
    openSolution(s.id)
    return
  }

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

// ─── Solutions ───────────────────────────────────────────────────────────────

function createSolution() {
  createKind.value = 'solution'
  newProjectTitle.value = ''
  newProjectModal.value = true
  nextTick(() => newTitleInput.value?.focus())
}

function openSolution(id) {
  emit('open-solution', id)
}

async function addProjectToSolution(project, solution) {
  project.solutionId = solution.id
  await saveProject(project)

  if (!(solution.projectOrder ?? []).includes(project.id)) {
    solution.projectOrder = [...(solution.projectOrder ?? []), project.id]
    await saveSolution(solution)
  }

  await load()
  toastRef.value.show(`Added "${project.title}" to "${solution.title}"`, 'success')
}

function openAddToSolution(p) {
  addToSolutionTarget.value = p
  addToSolutionModal.value  = true
}

function assignExistingSolution(solution) {
  addToSolutionModal.value = false
  addProjectToSolution(addToSolutionTarget.value, solution)
}

function createSolutionAndAssign() {
  addToSolutionModal.value = false
  createKind.value = 'solution-assign'
  newProjectTitle.value = ''
  newProjectModal.value = true
  nextTick(() => newTitleInput.value?.focus())
}

async function deleteSolutionConfirm(s) {
  const count = (s.projectOrder ?? []).length
  const ok = await confirmRef.value.open({
    title:        'Delete solution?',
    message:      `"${s.title}" will be deleted. Its ${count} project${count === 1 ? '' : 's'} will NOT be deleted — they'll return to your standalone Projects list.`,
    confirmLabel: 'Delete',
    cancelLabel:  'Cancel',
    variant:      'danger',
  })
  if (!ok) return

  await deleteSolutionFull(s)
  toastRef.value.show(`"${s.title}" deleted`, 'info')
  await load()
}

// Cast/audio rollups for a Solution card — computed across its member projects
function solutionProjects(s) {
  return projects.value.filter(p => p.solutionId === s.id)
}

function solutionCast(s) {
  const seen = new Set()
  const roles = []
  for (const p of solutionProjects(s)) {
    for (const r of (p.cast ?? [])) {
      if (!seen.has(r.label)) { seen.add(r.label); roles.push(r) }
    }
  }
  return roles
}

function solutionAudioBytes(s) {
  return solutionProjects(s).reduce((sum, p) => sum + (p.audioSizeBytes || 0), 0)
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

</script>

<style scoped>
.library {
  position: relative;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--color-bg);
  color: var(--color-text);
  box-sizing: border-box;
}

@media (display-mode: standalone) {
  .library {
    position: fixed;
    inset: 0;
    height: auto;
    padding-top: env(safe-area-inset-top);
  }
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
  position: relative;
}

@media (max-width: 600px) {
  .library-header { padding: 14px 16px 12px; }
}

.app-version {
  font-size: 11px;
  font-family: var(--font-mono);
  color: var(--color-text-muted);
  letter-spacing: 0.05em;
  background: var(--color-surface-soft, transparent);
  border: 1px solid var(--color-border);
  border-radius: 20px;
  padding: 3px 10px;
  cursor: pointer;
  align-self: center;
  opacity: 0.7;
  transition: opacity 0.15s, color 0.15s;
}
.app-version:hover { opacity: 1; color: var(--color-text); }

.build-dialog-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.build-dialog {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 24px 28px;
  min-width: 220px;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.build-dialog-title {
  font-family: var(--font-display);
  font-size: 18px;
  color: var(--color-text);
  margin: 0;
}
.build-dialog-date {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-text-muted);
  margin: 0;
}
.build-dialog-close {
  margin-top: 8px;
  padding: 8px 24px;
  border-radius: 8px;
  border: none;
  background: var(--color-accent);
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  align-self: center;
}
.build-dialog-close:hover { opacity: 0.85; }

.lib-theme-btn {
  position: absolute;
  top: 50%;
  right: 16px;
  transform: translateY(-50%);
  background: var(--color-surface-soft);
  border: 1px solid var(--color-border);
  color: var(--color-text-muted);
  border-radius: 50%;
  width: 28px;
  height: 28px;
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, color 0.15s;
}
.lib-theme-btn:hover {
  background: var(--color-surface);
  color: var(--color-accent);
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
.action-btn--primary:hover { background: #e07050 }

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

/* ─── Toolbar (fixed above the scrolling grid) ──────────── */
.library__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  padding: 16px 48px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

@media (max-width: 600px) {
  .library__toolbar { padding: 12px 16px; }
}

.toolbar__left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.tab-switch {
  display: flex;
  gap: 2px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 2px;
}

.tab-btn {
  background: none;
  border: none;
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  font-family: var(--font-ui);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.tab-btn:hover { color: var(--color-text) }
.tab-btn--active {
  background: var(--color-accent);
  color: #fff;
}
.tab-btn__count {
  font-family: var(--font-mono);
  font-size: 11px;
  opacity: 0.75;
  margin-left: 3px;
}

@media (max-width: 600px) {
  .tab-btn { padding: 6px 10px; font-size: 12px; }
}

.toolbar__add-btn {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-accent);
  font-size: 15px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.toolbar__add-btn:hover {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: #fff;
}

.sort-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-text-muted);
  font-family: var(--font-ui);
  margin-right: 4px;
}

.sort-control {
  display: flex;
  align-items: center;
  gap: 2px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 2px 8px 2px 2px;
}

.sort-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 12px;
  font-family: var(--font-ui);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.sort-btn:hover { color: var(--color-text) }
.sort-btn--active {
  background: var(--color-accent);
  color: #fff;
}

.sort-btn__icon {
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1;
}

/* Icon-only sort buttons on narrow screens */
@media (max-width: 600px) {
  .sort-label { display: none; }
  .sort-btn { padding: 7px 10px; }
  .sort-btn__label { display: none; }
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
  border-radius: 14px;
  cursor: pointer;
  transition: border-color 0.15s, transform 0.15s, box-shadow 0.15s;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.project-card:hover {
  border-color: var(--color-accent);
  transform: translateY(-2px);
  box-shadow: 0 8px 32px rgba(0,0,0,0.25);
}

/* Waveform thumbnail area */
.project-card__thumb {
  height: 72px;
  background: var(--color-surface-soft, #2a222a);
  position: relative;
  overflow: hidden;
  flex-shrink: 0;
}

/* Solution card thumb — icon instead of a waveform */
.solution-card__thumb {
  display: flex;
  align-items: center;
  justify-content: center;
}
.solution-card__icon {
  font-size: 28px;
  opacity: 0.5;
}
.project-card__waveform {
  width: 100%; height: 100%;
  display: block;
}
.project-card__body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
}

.project-card__top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

/* Role avatars — replaces role dots */
.project-card__avatars { display: flex; gap: 4px; align-items: center; }
.cast-avatar {
  width: 24px; height: 24px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  font-family: var(--font-display); font-weight: 700; font-size: 10px;
  color: #1a1418; flex-shrink: 0;
  box-shadow: 0 1px 4px rgba(0,0,0,0.3);
}

.project-card__role-chips { display: flex; gap: 5px; align-items: center }

.role-dot {
  width: 10px; height: 10px;
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
}

.project-card__menu { display: flex; gap: 4px; opacity: 0; transition: opacity 0.15s;
  position: absolute; top: 8px; right: 8px; }
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
  border-top: 1px solid var(--color-border);
  flex-shrink: 0;
}

/* Safe area filler — ONLY in standalone PWA mode */
.library__safe-bottom { display: none; }

@media (max-width: 600px) {
  .library__footer { padding: 12px 16px; }
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

.modal__hint {
  font-size: 13px;
  color: var(--color-text-muted);
  margin: -8px 0 0;
  line-height: 1.5;
}

.solution-picker-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 240px;
  overflow-y: auto;
}

.solution-picker-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 14px;
  font-family: var(--font-ui);
  color: var(--color-text);
  cursor: pointer;
  transition: border-color 0.15s;
  text-align: left;
}
.solution-picker-row:hover { border-color: var(--color-accent) }

.solution-picker-row__count {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-text-muted);
}

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
.btn--accent:hover:not(:disabled) { background: #e07050 }

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
  .app-title  { font-size: 1.7rem; }
  .title-row  { gap: 10px; }
  .app-version { font-size: 10px; padding: 2px 8px; }
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
