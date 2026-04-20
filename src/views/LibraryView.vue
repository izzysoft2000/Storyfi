<template>
  <div class="library">

    <!-- Header — brand only, no action buttons -->
    <header class="library-header">
      <div class="brand-group">
        <div class="title-row">
          <h1 class="app-title">Storyfi</h1>
          <button
            v-if="canInstall"
            class="install-pill"
            @click="emit('install')"
          >
            Install App
          </button>
        </div>
        <p class="app-subtitle">MULTI-VOICE AUDIO PRODUCTION</p>
      </div>
    </header>

    <!-- Project grid -->
    <main class="library-main">

      <!-- Loading -->
      <div v-if="loading" class="library-empty">
        <span class="library-empty__icon">⟳</span>
        <p>Loading projects…</p>
      </div>

      <!-- Grid: existing projects + New card always present -->
      <div v-else class="project-grid">

        <!-- Existing project cards -->
        <div
          v-for="p in projects"
          :key="p.id"
          class="project-card"
          @click="openProject(p.id)"
        >
          <div class="project-card__top">
            <div class="project-card__dots">
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
            <span class="meta-chip">{{ (p.paragraphGroups ?? []).length }} paragraphs</span>
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

        <!-- New Project card — always last in the grid -->
        <button class="new-card" :disabled="creatingProject" @click="createProject">
          <span class="new-card__plus">+</span>
          <span class="new-card__label">New Project</span>
        </button>

      </div>
    </main>

    <!-- Storage footer -->
    <footer class="library-footer">
      <StorageBar ref="storageBarRef" @manage="showStorageManager = true" />
    </footer>

    <!-- New project name modal -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="newProjectModal"
          class="modal-backdrop"
          @click.self="newProjectModal = false"
        >
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
              >
                Create
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <ConfirmModal ref="confirmRef" />
    <Toast ref="toastRef" />
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue'
import StorageBar   from '@/components/StorageBar.vue'
import ConfirmModal from '@/components/ConfirmModal.vue'
import Toast        from '@/components/Toast.vue'
import {
  getAllProjects,
  saveProject,
  deleteProjectFull,
  clearProjectAudio,
} from '@/store/db.js'
import { formatBytes, requestPersistentStorage, isPersistent } from '@/storage/quota.js'
import { useProjectStore } from '@/store/project.js'

// ─── Props & Emits ────────────────────────────────────────────────────────────

const props = defineProps({ canInstall: Boolean })
const emit  = defineEmits(['open-project', 'install'])

// ─── State ────────────────────────────────────────────────────────────────────

const store          = useProjectStore()
const projects       = ref([])
const loading        = ref(true)
const creatingProject = ref(false)
const storageBarRef  = ref(null)
const confirmRef     = ref(null)
const toastRef       = ref(null)

const newProjectModal = ref(false)
const newProjectTitle = ref('')
const newTitleInput   = ref(null)

// ─── Load ─────────────────────────────────────────────────────────────────────

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
  const already = await isPersistent()
  if (!already) await requestPersistentStorage()
})

// ─── Create project ───────────────────────────────────────────────────────────

function createProject() {
  newProjectTitle.value = ''
  newProjectModal.value = true
  nextTick(() => newTitleInput.value?.focus())
}

async function confirmNewProject() {
  const title = newProjectTitle.value.trim()
  if (!title) return

  newProjectModal.value = false
  creatingProject.value = true

  try {
    const p = store.createBlankProject(title)
    await saveProject(p)
    emit('open-project', p.id)
  } finally {
    creatingProject.value = false
  }
}

// ─── Open project ─────────────────────────────────────────────────────────────

function openProject(id) {
  emit('open-project', id)
}

// ─── Clear audio ──────────────────────────────────────────────────────────────

async function clearAudio(p) {
  const ok = await confirmRef.value.open({
    title:        'Clear audio?',
    message:      `This will remove all generated audio for "${p.title}". Your script, tags, and voice assignments are kept.`,
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

// ─── Delete project ───────────────────────────────────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
/* ─── Shell ──────────────────────────────────────────────────────────────────── */

.library {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-ui);
}

/* ─── Header ─────────────────────────────────────────────────────────────────── */

.library-header {
  padding: 28px 48px 24px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 14px;
}

.app-title {
  font-family: var(--font-display);
  font-size: 2.5rem;
  font-weight: 700;
  margin: 0;
  color: var(--color-text);
}

.app-subtitle {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-text-muted);
  margin: 4px 0 0;
}

.install-pill {
  background: var(--color-success);
  color: var(--color-bg);
  border: none;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 700;
  font-family: var(--font-ui);
  cursor: pointer;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  transition: filter 0.15s, transform 0.15s;
}

.install-pill:hover {
  filter: brightness(1.1);
  transform: scale(1.04);
}

/* ─── Main ───────────────────────────────────────────────────────────────────── */

.library-main {
  flex: 1;
  overflow-y: auto;
  padding: 40px 48px;
}

/* ─── Loading ────────────────────────────────────────────────────────────────── */

.library-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 300px;
  gap: 8px;
  color: var(--color-text-muted);
  text-align: center;
}

.library-empty__icon {
  font-size: 36px;
  opacity: 0.3;
  margin-bottom: 4px;
}

/* ─── Project grid ───────────────────────────────────────────────────────────── */

.project-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
  align-items: start;
}

/* ─── Project card ───────────────────────────────────────────────────────────── */

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
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.project-card__top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.project-card__dots {
  display: flex;
  gap: 5px;
  align-items: center;
}

.role-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.project-card__menu {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s;
}

.project-card:hover .project-card__menu {
  opacity: 1;
}

.icon-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 13px;
  color: var(--color-text-muted);
  padding: 4px 6px;
  border-radius: 4px;
  font-family: var(--font-ui);
  transition: background 0.1s, color 0.1s;
}

.icon-btn:hover { background: var(--color-border); color: var(--color-text) }
.icon-btn--danger:hover { background: rgba(248, 113, 113, 0.15); color: var(--color-error) }

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

.project-card__meta {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.meta-chip {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 20px;
  border: 1px solid var(--color-border);
  color: var(--color-text-muted);
  font-family: var(--font-mono);
}

.meta-chip--audio {
  border-color: rgba(124, 92, 191, 0.4);
  color: var(--color-accent);
}

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
  padding: 0;
  transition: color 0.15s;
}

.open-btn:hover { color: var(--color-highlight) }

/* ─── New Project card ───────────────────────────────────────────────────────── */

.new-card {
  all: unset;
  box-sizing: border-box;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border: 1px dashed var(--color-border);
  border-radius: 12px;
  padding: 20px;
  /* Match the natural height of a project card with one meta chip */
  min-height: 168px;
  color: var(--color-text-muted);
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}

.new-card:hover:not(:disabled) {
  border-color: var(--color-accent);
  color: var(--color-text);
  background: rgba(124, 92, 191, 0.05);
}

.new-card:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.new-card__plus {
  font-size: 36px;
  font-weight: 300;
  line-height: 1;
  color: inherit;
  transition: transform 0.2s;
}

.new-card:hover:not(:disabled) .new-card__plus {
  transform: scale(1.15);
}

.new-card__label {
  font-size: 13px;
  font-weight: 500;
  font-family: var(--font-ui);
  color: inherit;
}

/* ─── Footer ─────────────────────────────────────────────────────────────────── */

.library-footer {
  padding: 16px 48px;
  border-top: 1px solid var(--color-border);
  flex-shrink: 0;
}

/* ─── New project modal ──────────────────────────────────────────────────────── */

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(14, 12, 24, 0.8);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 28px 32px;
  max-width: 440px;
  width: 90%;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
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
  box-sizing: border-box;
  transition: border-color 0.15s;
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

/* ─── Transitions ────────────────────────────────────────────────────────────── */

.modal-enter-active, .modal-leave-active { transition: opacity 0.2s, transform 0.2s }
.modal-enter-from, .modal-leave-to       { opacity: 0; transform: scale(0.96) }
</style>
