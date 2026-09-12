<template>
  <div class="library">
    <!-- Header -->
    <header class="library-header">
      <div class="brand-group">
        <button class="back-link" @click="$emit('go-library')">← Solutions</button>
        <div class="title-row">
          <h1 class="app-title">{{ solution?.title ?? 'Loading…' }}</h1>
          <button v-if="solution" class="rename-btn" title="Rename Solution" @click="openRename">✎</button>
        </div>
        <p class="app-subtitle">SOLUTION</p>
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
        <span class="toolbar__count">Projects <span class="toolbar__count-num">({{ memberProjects.length }})</span></span>
        <button class="toolbar__add-btn" title="New Project" @click="createProject">+</button>
      </div>
      <div class="toolbar__right">
        <button
          class="compile-btn"
          :disabled="isCompiling || bookOrderProjects.length === 0"
          @click="doCompile"
        >
          <span v-if="!isCompiling">⬇ Compile Book</span>
          <span v-else>Compiling… {{ Math.round(compileProgress * 100) }}%</span>
        </button>
        <div v-if="memberProjects.length > 0" class="sort-control">
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
    </div>

    <!-- Project Grid -->
    <main class="library__main">
      <div v-if="loading" class="library__empty">
        <span class="library__empty-icon">⟳</span>
        <p>Loading…</p>
      </div>

      <div v-else-if="memberProjects.length === 0" class="library__empty">
        <span class="library__empty-icon">📚</span>
        <p class="library__empty-title">No projects in this Solution yet</p>
        <p class="library__empty-sub">
          Add a new Project here, or use "Add to Solution" on an existing one from your Projects tab.
        </p>
        <button class="action-btn action-btn--primary" style="margin-top:20px" @click="createProject">
          + New Project
        </button>
      </div>

      <div v-else class="project-grid">
        <ProjectCard
          v-for="(p, idx) in sortedProjects"
          :key="p.id"
          :project="p"
          show-unlink
          :show-reorder="sortBy === 'order'"
          :can-move-up="idx > 0"
          :can-move-down="idx < sortedProjects.length - 1"
          @open="openProject(p.id)"
          @clear-audio="clearAudio(p)"
          @delete="deleteProjectConfirm(p)"
          @unlink="unlinkProject(p)"
          @move-up="moveProject(p, -1)"
          @move-down="moveProject(p, 1)"
        />

        <!-- + New Project card — always last in the grid -->
        <div class="project-card project-card--new" @click="createProject">
          <span class="new-card__icon">+</span>
          <span class="new-card__label">New Project</span>
        </div>
      </div>
    </main>

    <!-- New Project Modal -->
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

    <!-- Rename Solution Modal -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="renameModal" class="modal-backdrop" @click.self="renameModal = false">
          <div class="modal">
            <h3 class="modal__title">Rename Solution</h3>
            <input
              ref="renameInput"
              v-model="renameTitle"
              class="modal__input"
              placeholder="Solution title…"
              maxlength="80"
              @keydown.enter="confirmRename"
              @keydown.esc="renameModal = false"
            />
            <div class="modal__actions">
              <button class="btn btn--ghost" @click="renameModal = false">Cancel</button>
              <button
                class="btn btn--accent"
                :disabled="!renameTitle.trim()"
                @click="confirmRename"
              >Save</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Confirm Modal -->
    <ConfirmModal ref="confirmRef" />

    <!-- Toast -->
    <Toast ref="toastRef" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import ProjectCard  from '@/components/ProjectCard.vue'
import ConfirmModal from '@/components/ConfirmModal.vue'
import Toast        from '@/components/Toast.vue'
import {
  getSolution, saveSolution, getAllProjects, getProject,
  saveProject, deleteProjectFull, clearProjectAudio,
} from '@/store/db.js'
import { useProjectStore } from '@/store/project.js'
import { useTheme } from '@/composables/usePanelLayout.js'
import { compileSolution } from '@/export/exporter.js'

const props = defineProps({
  solutionId: { type: String, required: true },
})
const emit = defineEmits(['go-library', 'open-project'])

const store = useProjectStore()
const { isDark, toggleTheme } = useTheme()

const solution     = ref(null)
const allProjects  = ref([])
const loading      = ref(true)
const confirmRef   = ref(null)
const toastRef     = ref(null)

async function load() {
  loading.value = true
  try {
    const [s, allP] = await Promise.all([getSolution(props.solutionId), getAllProjects()])
    solution.value    = s
    allProjects.value = allP
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(() => props.solutionId, load)

const memberProjects = computed(() =>
  allProjects.value.filter(p => p.solutionId === props.solutionId)
)

// Member projects in the Solution's canonical Book Order — used for Compile
// regardless of whichever sort the user currently has the grid set to.
const bookOrderProjects = computed(() => {
  const order = solution.value?.projectOrder ?? []
  return order.map(id => memberProjects.value.find(p => p.id === id)).filter(Boolean)
})

// ─── Sorting ─────────────────────────────────────────────────────────────────

const SORT_KEY = 'storyfi_solution_sort'
const sortOptions = [
  { value: 'order',  label: 'Order',  icon: '≡'  },
  { value: 'newest', label: 'Newest', icon: '↓'  },
  { value: 'oldest', label: 'Oldest', icon: '↑'  },
  { value: 'name',   label: 'Name',   icon: 'Aa' },
]
const sortBy = ref(localStorage.getItem(SORT_KEY) || 'order')

function setSortBy(value) {
  sortBy.value = value
  localStorage.setItem(SORT_KEY, value)
}

const sortedProjects = computed(() => {
  if (sortBy.value === 'order') return bookOrderProjects.value

  const copy = [...memberProjects.value]
  switch (sortBy.value) {
    case 'oldest':
      return copy.sort((a, b) => a.updatedAt - b.updatedAt)
    case 'name':
      return copy.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }))
    case 'newest':
    default:
      return copy.sort((a, b) => b.updatedAt - a.updatedAt)
  }
})

// ─── Reorder (Book Order) ────────────────────────────────────────────────────

async function moveProject(p, dir) {
  const order   = [...(solution.value.projectOrder ?? [])]
  const idx     = order.indexOf(p.id)
  const swapIdx = idx + dir
  if (idx === -1 || swapIdx < 0 || swapIdx >= order.length) return
  ;[order[idx], order[swapIdx]] = [order[swapIdx], order[idx]]
  solution.value.projectOrder = order
  await saveSolution(solution.value)
}

// ─── Create Project (pre-assigned to this Solution) ─────────────────────────

const newProjectModal = ref(false)
const newProjectTitle = ref('')
const newTitleInput   = ref(null)

function createProject() {
  newProjectTitle.value = ''
  newProjectModal.value = true
  nextTick(() => newTitleInput.value?.focus())
}

async function confirmNewProject() {
  const title = newProjectTitle.value.trim()
  if (!title) return
  newProjectModal.value = false

  const p = store.createBlankProject(title)
  p.solutionId = solution.value.id
  await saveProject(p)

  solution.value.projectOrder = [...(solution.value.projectOrder ?? []), p.id]
  await saveSolution(solution.value)

  emit('open-project', p.id)
}

// ─── Rename Solution ─────────────────────────────────────────────────────────

const renameModal = ref(false)
const renameTitle = ref('')
const renameInput = ref(null)

function openRename() {
  renameTitle.value = solution.value.title
  renameModal.value = true
  nextTick(() => renameInput.value?.focus())
}

async function confirmRename() {
  const title = renameTitle.value.trim()
  if (!title) return
  renameModal.value = false
  solution.value.title = title
  await saveSolution(solution.value)
}

// ─── Unlink / Clear Audio / Delete ───────────────────────────────────────────

async function unlinkProject(p) {
  p.solutionId = null
  await saveProject(p)
  solution.value.projectOrder = (solution.value.projectOrder ?? []).filter(id => id !== p.id)
  await saveSolution(solution.value)
  toastRef.value.show(`Removed "${p.title}" from "${solution.value.title}"`, 'info')
  await load()
}

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
}

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
  solution.value.projectOrder = (solution.value.projectOrder ?? []).filter(id => id !== p.id)
  await saveSolution(solution.value)
  toastRef.value.show(`"${p.title}" deleted`, 'info')
  await load()
}

function openProject(id) {
  emit('open-project', id)
}

// ─── Compile Book ────────────────────────────────────────────────────────────

const isCompiling      = ref(false)
const compileProgress  = ref(0)

async function doCompile() {
  isCompiling.value = true
  compileProgress.value = 0
  try {
    const fullProjects = await Promise.all(bookOrderProjects.value.map(p => getProject(p.id)))
    await compileSolution(solution.value, fullProjects, pct => { compileProgress.value = pct })
    toastRef.value.show('Book compiled — check your downloads', 'success')
  } catch (err) {
    toastRef.value.show(err?.message ?? 'Compile failed', 'error')
  } finally {
    isCompiling.value = false
  }
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

.back-link {
  background: none;
  border: none;
  color: var(--color-text-muted);
  font-family: var(--font-ui);
  font-size: 13px;
  cursor: pointer;
  padding: 0 0 6px;
  transition: color 0.15s;
}
.back-link:hover { color: var(--color-accent) }

.title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.app-title {
  font-family: var(--font-display);
  font-size: 2.2rem;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 70vw;
}

@media (max-width: 600px) {
  .app-title { font-size: 1.5rem; max-width: 60vw; }
}

.rename-btn {
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 50%;
  width: 26px;
  height: 26px;
  color: var(--color-text-muted);
  cursor: pointer;
  font-size: 12px;
  flex-shrink: 0;
  transition: color 0.15s, border-color 0.15s;
}
.rename-btn:hover { color: var(--color-accent); border-color: var(--color-accent) }

.app-subtitle {
  font-size: 12px;
  color: var(--color-text-muted);
  letter-spacing: 0.08em;
  margin: 2px 0 0;
}

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

/* ─── Toolbar ────────────────────────────────────────── */
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

.toolbar__right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.toolbar__count {
  font-family: var(--font-ui);
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
}
.toolbar__count-num {
  color: var(--color-text-muted);
  font-weight: 400;
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

.compile-btn {
  font-size: 12px;
  font-weight: 500;
  font-family: var(--font-ui);
  color: var(--color-accent);
  background: transparent;
  border: 1px solid var(--color-accent);
  border-radius: 8px;
  padding: 7px 14px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  white-space: nowrap;
}
.compile-btn:hover:not(:disabled) { background: var(--color-accent); color: #fff }
.compile-btn:disabled { opacity: 0.4; cursor: not-allowed }

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

@media (max-width: 600px) {
  .sort-label { display: none; }
  .sort-btn { padding: 7px 10px; }
  .sort-btn__label { display: none; }
}

/* ─── Main / Grid ────────────────────────────────────── */
.library__main {
  flex: 1;
  overflow-y: auto;
  padding: 40px 48px;
}

@media (max-width: 600px) {
  .library__main { padding: 20px 16px; }
}

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
.library__empty-icon { font-size: 40px; margin-bottom: 8px; opacity: 0.4; }
.library__empty-title {
  font-family: var(--font-display);
  font-size: 20px;
  color: var(--color-text);
  margin: 0;
}
.library__empty-sub { font-size: 14px; max-width: 360px; line-height: 1.6; margin: 0; }

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
.action-btn--primary { background: var(--color-accent); color: #fff; }
.action-btn--primary:hover { background: #e07050 }

.project-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(300px, 100%), 1fr));
  gap: 16px;
}

/* ─── + New Project card ─────────────────────────────── */
.project-card--new {
  border: 1px dashed var(--color-border);
  border-radius: 14px;
  background: transparent;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 160px;
  cursor: pointer;
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
.btn--accent:hover:not(:disabled) { background: #e07050 }

/* Transitions */
.modal-enter-active, .modal-leave-active { transition: all 0.2s ease }
.modal-enter-from, .modal-leave-to       { opacity: 0; transform: scale(0.95) }
</style>
