<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="visible" class="modal-backdrop" @click.self="skip">
        <div class="modal">
          <div class="modal__icon">📁</div>
          <h3 class="modal__title">Where should audio files be saved?</h3>
          <p class="modal__body">
            Storyfi can write MP3 files directly to a folder on your computer
            as they're generated — so your audio is always on disk, not just in the browser.
          </p>

          <div v-if="!hasFileSystemAccess" class="modal__note modal__note--warn">
            Your browser doesn't support direct folder access.
            Audio will be stored in the app and available via ZIP export.
          </div>

          <label v-if="hasFileSystemAccess" class="modal__checkbox">
            <input type="checkbox" v-model="dontAskAgain" />
            Don't ask again for this project
          </label>

          <div class="modal__actions">
            <button class="btn btn--ghost" @click="skip">
              Skip — use app only
            </button>
            <button
              v-if="hasFileSystemAccess"
              class="btn btn--accent"
              :disabled="picking"
              @click="chooseFolder"
            >
              {{ picking ? 'Choosing…' : 'Choose a folder' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref } from 'vue'
import { hasFileSystemAccess as checkFSA, pickOutputFolder } from '@/storage/filesystem.js'
import { useProjectStore } from '@/store/project.js'

const store   = useProjectStore()
const visible = ref(false)
const picking = ref(false)
const dontAskAgain = ref(false)
const hasFileSystemAccess = checkFSA()

let _resolve = null

/** Open the modal. Returns a Promise that resolves when user picks or skips. */
function open() {
  visible.value = true
  return new Promise(resolve => { _resolve = resolve })
}

async function chooseFolder() {
  picking.value = true
  try {
    const handle = await pickOutputFolder()
    if (handle) {
      store.setOutputFolder(handle, handle.name)
    }
  } catch { /* user cancelled */ }
  finally { picking.value = false }

  close()
}

function skip() {
  if (dontAskAgain.value) {
    store.dismissFolderPrompt()
  }
  close()
}

function close() {
  visible.value = false
  _resolve?.()
  _resolve = null
}

defineExpose({ open })
</script>

<style scoped>
.modal-backdrop {
  position: fixed; inset: 0;
  background: rgba(14,12,24,0.8);
  backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  z-index: 200;
}

.modal {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 14px;
  padding: 32px;
  max-width: 440px;
  width: 90%;
  box-shadow: 0 24px 64px rgba(0,0,0,0.5);
  display: flex; flex-direction: column; gap: 14px;
  text-align: center; align-items: center;
}

.modal__icon  { font-size: 36px }

.modal__title {
  font-family: var(--font-display);
  font-size: 20px; font-weight: 600;
  color: var(--color-text); margin: 0;
}

.modal__body {
  font-size: 14px; color: var(--color-text-muted);
  line-height: 1.65; margin: 0; max-width: 340px;
}

.modal__note {
  font-size: 12px; padding: 8px 14px;
  border-radius: 6px; width: 100%;
}
.modal__note--warn {
  background: rgba(250,204,21,0.08);
  border: 1px solid rgba(250,204,21,0.2);
  color: var(--color-warning);
}

.modal__checkbox {
  display: flex; align-items: center; gap: 8px;
  font-size: 13px; color: var(--color-text-muted);
  cursor: pointer;
}
.modal__checkbox input { accent-color: var(--color-accent) }

.modal__actions { display: flex; gap: 10px; justify-content: center; width: 100% }

.btn {
  padding: 9px 20px; border-radius: 7px;
  font-size: 13px; font-weight: 500; font-family: var(--font-ui);
  cursor: pointer; border: 1px solid transparent; transition: all 0.15s;
}
.btn:disabled { opacity: 0.4; cursor: not-allowed }
.btn--ghost {
  background: transparent; border-color: var(--color-border);
  color: var(--color-text-muted);
}
.btn--ghost:hover { border-color: var(--color-text-muted); color: var(--color-text) }
.btn--accent { background: var(--color-accent); color: #fff }
.btn--accent:hover:not(:disabled) { background: #e07050 }

.modal-enter-active, .modal-leave-active { transition: all 0.2s ease }
.modal-enter-from, .modal-leave-to       { opacity: 0; transform: scale(0.95) }
</style>
