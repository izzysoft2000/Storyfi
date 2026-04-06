<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="visible" class="modal-backdrop" @click.self="close">
        <div class="modal">
          <div class="modal__header">
            <h3 class="modal__title">Settings</h3>
            <button class="modal__close" @click="close">✕</button>
          </div>

          <!-- Provider Tabs -->
          <div class="provider-tabs">
            <button
              v-for="p in providerList"
              :key="p.id"
              class="provider-tab"
              :class="{ active: activeTab === p.id }"
              @click="activeTab = p.id"
            >{{ p.name }}</button>
          </div>

          <!-- Provider Settings -->
          <div class="provider-settings">
            <template v-if="activeTab === 'minimax'">
              <label class="field-label">API Key</label>
              <input
                v-model="keys.minimax"
                type="password"
                class="field-input"
                placeholder="eyJ…"
                autocomplete="off"
              />
              <label class="field-label" style="margin-top:12px">Group ID</label>
              <input
                v-model="groupIds.minimax"
                type="text"
                class="field-input"
                placeholder="Your MiniMax Group ID"
                autocomplete="off"
              />
              <p class="field-hint">
                Find these in your
                <a href="https://platform.minimaxi.com" target="_blank" rel="noopener">MiniMax dashboard</a>.
              </p>
            </template>

            <template v-if="activeTab === 'openai'">
              <label class="field-label">API Key</label>
              <input
                v-model="keys.openai"
                type="password"
                class="field-input"
                placeholder="sk-…"
                autocomplete="off"
              />
              <p class="field-hint">
                Find this in your
                <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener">OpenAI dashboard</a>.
              </p>
            </template>

            <template v-if="activeTab === 'browser'">
              <div class="browser-info">
                <span class="browser-info__icon">🔊</span>
                <p>
                  Browser TTS uses your device's built-in speech engine —
                  no API key needed. Quality varies by OS and voice.
                </p>
                <p style="margin-top:8px; opacity: 0.7">
                  Audio preview only — no MP3 download for browser voices.
                </p>
              </div>
            </template>
          </div>

          <!-- Security note -->
          <p class="security-note">
            🔒 Keys are stored in your browser only.
            <em>Encryption coming in a future update.</em>
          </p>

          <!-- Active provider selector -->
          <div class="active-provider">
            <label class="field-label">Active provider</label>
            <select v-model="activeProvider" class="field-select">
              <option v-for="p in providerList" :key="p.id" :value="p.id">
                {{ p.name }}
              </option>
            </select>
          </div>

          <div class="modal__actions">
            <button class="btn btn--ghost" @click="close">Cancel</button>
            <button class="btn btn--accent" @click="save">Save</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { saveApiKey, getApiKey } from '@/store/db.js'
import { getSetting, setSetting } from '@/store/db.js'

const emit = defineEmits(['saved'])

const visible        = ref(false)
const activeTab      = ref('minimax')
const activeProvider = ref('minimax')

const providerList = [
  { id: 'minimax', name: 'MiniMax Audio' },
  { id: 'openai',  name: 'OpenAI TTS'   },
  { id: 'browser', name: 'Browser (offline)' },
]

const keys     = reactive({ minimax: '', openai: '' })
const groupIds = reactive({ minimax: '' })

async function open() {
  // Load saved keys (show masked if present)
  for (const pid of ['minimax', 'openai']) {
    const record = await getApiKey(pid)
    if (record) keys[pid] = record.encrypted ?? '' // plaintext stored in encrypted field
  }
  const saved = await getSetting('activeProvider')
  if (saved) activeProvider.value = saved

  visible.value = true
}

async function save() {
  // Save non-empty keys as plaintext (Phase 3; encryption UI in Phase 6)
  for (const pid of ['minimax', 'openai']) {
    const key = keys[pid]?.trim()
    if (key) {
      await saveApiKey({
        providerId:  pid,
        isEncrypted: false,
        encrypted:   key,  // stored in encrypted field for interface consistency
        salt:        null,
        iv:          null,
        savedAt:     Date.now(),
      })
    }
  }

  await setSetting('activeProvider', activeProvider.value)
  emit('saved', activeProvider.value)
  close()
}

function close() { visible.value = false }
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
  padding: 0;
  width: 480px; max-width: 95vw;
  box-shadow: 0 24px 64px rgba(0,0,0,0.5);
  display: flex; flex-direction: column;
  overflow: hidden;
}

.modal__header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 20px 24px 16px; border-bottom: 1px solid var(--color-border);
}

.modal__title {
  font-family: var(--font-display); font-size: 20px; font-weight: 600;
  color: var(--color-text); margin: 0;
}

.modal__close {
  background: none; border: none; color: var(--color-text-muted);
  font-size: 16px; cursor: pointer; padding: 4px 8px; border-radius: 4px;
  transition: color 0.1s;
}
.modal__close:hover { color: var(--color-text) }

/* Provider tabs */
.provider-tabs {
  display: flex; gap: 0;
  border-bottom: 1px solid var(--color-border);
  padding: 0 24px;
}

.provider-tab {
  background: none; border: none; border-bottom: 2px solid transparent;
  color: var(--color-text-muted); font-size: 13px; font-family: var(--font-ui);
  padding: 10px 14px; cursor: pointer; transition: all 0.15s;
  margin-bottom: -1px;
}
.provider-tab:hover  { color: var(--color-text) }
.provider-tab.active { border-bottom-color: var(--color-accent); color: var(--color-accent) }

/* Settings area */
.provider-settings { padding: 20px 24px 0; display: flex; flex-direction: column; gap: 6px }

.field-label {
  font-size: 11px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.08em; color: var(--color-text-muted);
}

.field-input, .field-select {
  background: var(--color-bg); border: 1px solid var(--color-border);
  border-radius: 7px; padding: 9px 12px;
  font-size: 13px; font-family: var(--font-mono); color: var(--color-text);
  outline: none; transition: border-color 0.15s; width: 100%;
}
.field-input:focus, .field-select:focus { border-color: var(--color-accent) }
.field-input::placeholder { color: var(--color-text-muted); opacity: 0.5 }

.field-hint {
  font-size: 11px; color: var(--color-text-muted); opacity: 0.7;
  margin: 0; line-height: 1.5;
}
.field-hint a { color: var(--color-accent) }

.browser-info {
  display: flex; flex-direction: column; align-items: center; text-align: center;
  gap: 10px; padding: 20px; color: var(--color-text-muted); font-size: 13px;
  line-height: 1.6;
}
.browser-info__icon { font-size: 32px }

/* Active provider */
.active-provider { padding: 16px 24px 0; display: flex; flex-direction: column; gap: 6px }

/* Security note */
.security-note {
  font-size: 11px; color: var(--color-text-muted); opacity: 0.6;
  padding: 12px 24px 0; line-height: 1.5;
}

.modal__actions {
  display: flex; gap: 10px; justify-content: flex-end;
  padding: 20px 24px;
}

.btn {
  padding: 9px 20px; border-radius: 7px;
  font-size: 13px; font-weight: 500; font-family: var(--font-ui);
  cursor: pointer; border: 1px solid transparent; transition: all 0.15s;
}
.btn--ghost { background: transparent; border-color: var(--color-border); color: var(--color-text-muted) }
.btn--ghost:hover { border-color: var(--color-text-muted); color: var(--color-text) }
.btn--accent { background: var(--color-accent); color: #fff }
.btn--accent:hover { background: #6a4db0 }

.modal-enter-active, .modal-leave-active { transition: all 0.2s ease }
.modal-enter-from, .modal-leave-to       { opacity: 0; transform: scale(0.95) }
</style>
