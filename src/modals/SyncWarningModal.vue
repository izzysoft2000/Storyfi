<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="visible" class="modal-backdrop" @click.self="ignore">
        <div class="modal">
          <div class="modal__icon">⚠️</div>
          <h3 class="modal__title">Some audio files are out of sync</h3>

          <div class="modal__summary">
            <template v-if="counts.missing_from_disk > 0">
              <p><strong>{{ counts.missing_from_disk }}</strong> file{{ counts.missing_from_disk !== 1 ? 's' : '' }} exist in the app but are missing from
                <span class="folder-name">📁 {{ folderName }}</span>
              </p>
            </template>
            <template v-if="counts.missing_from_idb > 0">
              <p><strong>{{ counts.missing_from_idb }}</strong> disk file{{ counts.missing_from_idb !== 1 ? 's' : '' }} found but missing from app storage.</p>
            </template>
            <template v-if="counts.missing_both > 0">
              <p><strong>{{ counts.missing_both }}</strong> segment{{ counts.missing_both !== 1 ? 's' : '' }} have no audio at all — need to regenerate.</p>
            </template>
            <p class="modal__hint">This can happen if files were moved, deleted, or the browser cleared its cache.</p>
          </div>

          <div class="modal__actions">
            <button
              v-if="counts.missing_from_disk > 0"
              class="btn btn--accent"
              :disabled="busy"
              @click="rewriteToDisk"
            >
              {{ busy ? 'Writing…' : '↓ Re-write missing files to disk' }}
            </button>

            <button
              v-if="counts.missing_from_idb > 0"
              class="btn btn--accent"
              :disabled="busy"
              @click="reimportFromDisk"
            >
              {{ busy ? 'Importing…' : '↑ Re-import from disk' }}
            </button>

            <button
              v-if="counts.missing_both > 0"
              class="btn btn--warn"
              @click="markForRegen"
            >
              🔄 Mark for regeneration
            </button>

            <button class="btn btn--ghost" @click="ignore">
              Ignore
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed } from 'vue'
import { writeFileToFolder, readFileFromFolder } from '@/storage/filesystem.js'
import { getAudioStitched, saveAudioStitched }   from '@/store/db.js'
import { useGenerationStore } from '@/store/generation.js'
import { useProjectStore }    from '@/store/project.js'

const gen   = useGenerationStore()
const store = useProjectStore()

const visible     = ref(false)
const divergences = ref([])
const busy        = ref(false)

let _resolve = null

const folderName = computed(() => store.project?.outputFolderName ?? 'output folder')

const counts = computed(() => {
  const c = { missing_from_disk: 0, missing_from_idb: 0, missing_both: 0 }
  for (const d of divergences.value) c[d.type]++
  return c
})

function open(report) {
  divergences.value = report.divergences
  visible.value     = true
  return new Promise(resolve => { _resolve = resolve })
}

async function rewriteToDisk() {
  busy.value = true
  const handle = store.project?.outputFolderHandle
  if (!handle) { busy.value = false; return }

  for (const d of divergences.value.filter(x => x.type === 'missing_from_disk')) {
    const blob = await getAudioStitched(d.groupId)
    if (blob && d.diskFilename) {
      await writeFileToFolder(handle, d.diskFilename, blob)
    }
  }
  busy.value = false
  close('rewritten')
}
async function reimportFromDisk() {
  busy.value = true
  const handle = store.project?.outputFolderHandle
  if (!handle) { busy.value = false; return }

  for (const d of divergences.value.filter(x => x.type === 'missing_from_idb')) {
    const file = await readFileFromFolder(handle, d.diskFilename)
    if (file) {
      const blob = new Blob([await file.arrayBuffer()], { type: 'audio/mpeg' })
      await saveAudioStitched(d.groupId, blob)
    }
  }
  busy.value = false
  close('reimported')
}

function markForRegen() {
  // Reset missing_both groups to pending
  for (const d of divergences.value.filter(x => x.type === 'missing_both')) {
    gen.updateGroup?.(d.groupId, {
      stitchStatus: 'pending',
      stitchedAudioKey: null,
      totalDurationMs: null,
    })
  }
  close('marked')
}

function ignore() { close('ignored') }

function close(result) {
  visible.value = false
  _resolve?.(result)
  _resolve = null
}

defineExpose({ open })
</script>

<style scoped>
.modal-backdrop {
  position: fixed; inset: 0;
  background: rgba(14,12,24,0.8); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center; z-index: 300;
}

.modal {
  background: var(--color-surface);
  border: 1px solid rgba(250,204,21,0.3);
  border-radius: 14px; padding: 28px 32px;
  max-width: 440px; width: 90%;
  box-shadow: 0 24px 64px rgba(0,0,0,0.5);
  display: flex; flex-direction: column;
  align-items: center; text-align: center; gap: 14px;
}

.modal__icon { font-size: 32px }

.modal__title {
  font-family: var(--font-display); font-size: 18px; font-weight: 600;
  color: var(--color-text); margin: 0;
}

.modal__summary {
  font-size: 13px; color: var(--color-text-muted);
  line-height: 1.65; display: flex; flex-direction: column; gap: 6px;
}
.modal__summary strong { color: var(--color-text) }

.folder-name {
  font-family: var(--font-mono); font-size: 12px;
  background: var(--color-border); padding: 1px 6px; border-radius: 4px;
  color: var(--color-text);
}

.modal__hint { font-size: 11px; opacity: 0.5; margin-top: 4px }

.modal__actions {
  display: flex; flex-direction: column; gap: 8px; width: 100%;
}

.btn {
  padding: 9px 20px; border-radius: 7px;
  font-size: 13px; font-weight: 500; font-family: var(--font-ui);
  cursor: pointer; border: 1px solid transparent; transition: all 0.15s;
  width: 100%;
}
.btn:disabled { opacity: 0.4; cursor: not-allowed }

.btn--accent { background: var(--color-accent); color: #fff }
.btn--accent:hover:not(:disabled) { background: #e07050 }

.btn--warn {
  background: rgba(250,204,21,0.1); border-color: rgba(250,204,21,0.3);
  color: var(--color-warning);
}
.btn--warn:hover { background: rgba(250,204,21,0.18) }

.btn--ghost {
  background: transparent; border-color: var(--color-border);
  color: var(--color-text-muted);
}
.btn--ghost:hover { border-color: var(--color-text-muted); color: var(--color-text) }

.modal-enter-active, .modal-leave-active { transition: all 0.2s ease }
.modal-enter-from, .modal-leave-to       { opacity: 0; transform: scale(0.96) }
</style>
