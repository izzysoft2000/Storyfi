<template>
  <div class="cast-panel">
    <div class="cast-panel__header">
      <span class="cast-panel__title">Voice Cast</span>
      <span class="cast-panel__count">{{ roles.length }}/10</span>
    </div>

    <div class="cast-panel__list">
      <TransitionGroup name="role-list">
        <div v-for="role in roles" :key="role.id" class="role-row">

          <!-- Color swatch -->
          <label class="color-swatch" :title="`${role.label} colour`">
            <span class="color-swatch__dot" :style="{ background: role.color }" />
            <input type="color" :value="role.color" class="color-swatch__input"
              @input="onColorChange(role.id, $event.target.value)" />
          </label>

          <!-- Role name -->
          <div class="role-row__info">
            <input v-if="editingId === role.id" ref="editInputRef"
              class="role-row__name-input" :value="role.label" maxlength="30"
              @blur="commitEdit(role.id, $event.target.value)"
              @keydown.enter="commitEdit(role.id, $event.target.value)"
              @keydown.esc="editingId = null" />
            <button v-else class="role-row__name" :style="{ color: role.color }"
              @click="startEdit(role.id)">{{ role.label }}</button>

            <!-- Voice assignment button -->
            <button
              class="role-row__voice"
              :class="{ 'role-row__voice--assigned': role.voiceAssignment }"
              :title="role.voiceAssignment ? `Voice: ${role.voiceAssignment.voiceName}` : 'Click to assign a voice'"
              @click="openVoicePicker(role)"
            >
              {{ role.voiceAssignment?.voiceName ?? '+ Assign voice' }}
            </button>
          </div>

          <!-- Delete -->
          <button class="role-row__delete" :disabled="roles.length <= 1"
            :title="`Remove ${role.label}`" @click="deleteRole(role)">✕</button>
        </div>
      </TransitionGroup>
    </div>

    <button class="cast-panel__add" :disabled="roles.length >= 10" @click="addRole">
      + Add role
    </button>

    <p class="cast-panel__hint">
      Select text in the editor, then choose a role to tag it.
    </p>

    <!-- Voice Picker Modal -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="pickerOpen" class="picker-backdrop" @click.self="pickerOpen = false">
          <div class="picker-modal">
            <div class="picker-header">
              <h4 class="picker-title">Assign voice — <span :style="{ color: pickerRole?.color }">{{ pickerRole?.label }}</span></h4>
              <button class="picker-close" @click="pickerOpen = false">✕</button>
            </div>

            <div class="picker-search">
              <input v-model="voiceSearch" class="picker-search__input"
                placeholder="Search voices…" autofocus />
            </div>

            <div v-if="loadingVoices" class="picker-loading">Loading voices…</div>
            <div v-else-if="voiceError" class="picker-error">{{ voiceError }}</div>
            <div v-else class="picker-list">
              <button
                v-for="voice in filteredVoices"
                :key="voice.id"
                class="picker-voice"
                :class="{ 'picker-voice--active': pickerRole?.voiceAssignment?.voiceId === voice.id }"
                @click="assignVoice(voice)"
              >
                <span class="picker-voice__name">{{ voice.name }}</span>
                <span class="picker-voice__meta">
                  {{ voice.gender ?? '' }}
                  <span v-if="voice.language" class="picker-voice__lang">{{ voice.language }}</span>
                  <span v-if="voice.source === 'cloned'" class="picker-voice__cloned">cloned</span>
                </span>
              </button>
              <div v-if="filteredVoices.length === 0" class="picker-empty">
                No voices match "{{ voiceSearch }}"
              </div>
            </div>

            <div v-if="pickerRole?.voiceAssignment" class="picker-footer">
              <button class="picker-clear" @click="clearVoice">Remove assignment</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import { useProjectStore } from '@/store/project.js'
import { getProvider, getVoices } from '@/tts/provider.js'
import { getApiKey, getSetting }   from '@/store/db.js'

const emit = defineEmits(['role-updated', 'role-deleted'])

const store     = useProjectStore()
const roles     = computed(() => store.cast)
const editingId = ref(null)
const editInputRef = ref(null)

// ─── Edit role name ───────────────────────────────────────────────────────────
function startEdit(roleId) {
  editingId.value = roleId
  nextTick(() => {
    const input = editInputRef.value
    if (Array.isArray(input)) input[0]?.focus()
    else input?.focus()
  })
}

function commitEdit(roleId, rawLabel) {
  const label = rawLabel?.trim()
  if (!label) { editingId.value = null; return }
  store.updateRoleLabel(roleId, label)
  emit('role-updated', roleId, { roleLabel: label })
  editingId.value = null
}

function onColorChange(roleId, color) {
  store.updateRoleColor(roleId, color)
  emit('role-updated', roleId, { color })
}

function addRole() {
  if (roles.value.length >= 10) return
  const role = store.addRole()
  nextTick(() => startEdit(role.id))
}

function deleteRole(role) {
  if (roles.value.length <= 1) return
  emit('role-deleted', role.id)
  store.deleteRole(role.id)
}

// ─── Voice Picker ─────────────────────────────────────────────────────────────
const pickerOpen    = ref(false)
const pickerRole    = ref(null)
const voiceList     = ref([])
const voiceSearch   = ref('')
const loadingVoices = ref(false)
const voiceError    = ref(null)

const filteredVoices = computed(() => {
  const q = voiceSearch.value.toLowerCase()
  if (!q) return voiceList.value
  return voiceList.value.filter(v =>
    v.name.toLowerCase().includes(q) ||
    (v.language ?? '').toLowerCase().includes(q) ||
    (v.gender ?? '').toLowerCase().includes(q)
  )
})

async function openVoicePicker(role) {
  pickerRole.value  = role
  voiceSearch.value = ''
  voiceError.value  = null
  voiceList.value   = []
  pickerOpen.value  = true
  loadingVoices.value = true

  try {
    // Find active provider
    const providerId = await getSetting('activeProvider') ?? 'minimax'
    const provider   = getProvider(providerId)

    if (!provider) {
      voiceError.value = `Provider "${providerId}" not registered. Open ⚙ Settings first.`
      return
    }

    // Get API key if needed
    let apiKey = null, groupId = null
    if (providerId !== 'browser') {
      const keyRecord = await getApiKey(providerId)
      if (!keyRecord) {
        voiceError.value = `No API key saved for ${provider.name}. Open ⚙ Settings to add one.`
        return
      }
      apiKey  = keyRecord.encrypted // plaintext in Phase 3
      groupId = keyRecord.groupId   ?? null
    }

    // Fetch voices (uses session cache after first load)
    voiceList.value = await provider.voices(apiKey, groupId)

    if (voiceList.value.length === 0) {
      voiceError.value = 'No voices returned. Check your API key and network connection.'
    }
  } catch (err) {
    voiceError.value = `Failed to load voices: ${err.message}`
  } finally {
    loadingVoices.value = false
  }
}

function assignVoice(voice) {
  if (!pickerRole.value) return
  const assignment = {
    voiceId:    voice.id,
    voiceName:  voice.name,
    providerId: 'minimax', // TODO: pass provider dynamically
    settings:   {},
  }
  store.updateRoleVoice(pickerRole.value.id, assignment)
  pickerOpen.value = false
}

function clearVoice() {
  if (!pickerRole.value) return
  store.updateRoleVoice(pickerRole.value.id, null)
  pickerOpen.value = false
}
</script>

<style scoped>
.cast-panel {
  display: flex; flex-direction: column;
  padding: 0 8px 8px; overflow: hidden;
}

.cast-panel__header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px 8px 8px;
}
.cast-panel__title {
  font-size: 10px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.1em; color: var(--color-text-muted);
}
.cast-panel__count {
  font-size: 10px; font-family: var(--font-mono);
  color: var(--color-text-muted); opacity: 0.5;
}

/* Role rows */
.cast-panel__list { display: flex; flex-direction: column; gap: 3px; overflow-y: auto }

.role-row {
  display: grid; grid-template-columns: 22px 1fr 18px;
  align-items: start; gap: 6px;
  padding: 5px 6px; border-radius: 6px; transition: background 0.1s;
}
.role-row:hover { background: var(--color-bg) }

/* Color swatch */
.color-swatch { position: relative; cursor: pointer; display: flex; align-items: center; padding-top: 3px }
.color-swatch__dot {
  width: 12px; height: 12px; border-radius: 50%; display: block; flex-shrink: 0;
  border: 1px solid rgba(255,255,255,0.1); transition: transform 0.1s;
}
.color-swatch:hover .color-swatch__dot { transform: scale(1.2) }
.color-swatch__input { position: absolute; opacity: 0; width: 0; height: 0; pointer-events: none }

/* Role info stack */
.role-row__info { display: flex; flex-direction: column; gap: 2px; min-width: 0 }

.role-row__name {
  background: none; border: none; font-size: 13px; font-weight: 500;
  font-family: var(--font-ui); cursor: pointer; text-align: left; padding: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; transition: opacity 0.1s;
}
.role-row__name:hover { opacity: 0.75 }

.role-row__name-input {
  background: var(--color-border); border: 1px solid var(--color-accent);
  border-radius: 4px; color: var(--color-text);
  font-size: 13px; font-weight: 500; font-family: var(--font-ui);
  padding: 2px 6px; outline: none; width: 100%;
}

/* Voice button */
.role-row__voice {
  background: none; border: 1px dashed var(--color-border); border-radius: 4px;
  color: var(--color-text-muted); font-size: 10px; font-family: var(--font-ui);
  padding: 2px 6px; cursor: pointer; text-align: left;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  transition: all 0.12s; width: 100%;
}
.role-row__voice:hover                { border-color: var(--color-accent); color: var(--color-accent) }
.role-row__voice--assigned            { border-style: solid; border-color: rgba(124,92,191,0.4); color: var(--color-accent) }
.role-row__voice--assigned:hover      { border-color: var(--color-accent) }

/* Delete */
.role-row__delete {
  background: none; border: none; color: var(--color-text-muted);
  font-size: 11px; cursor: pointer; padding: 3px 4px; border-radius: 3px;
  opacity: 0; transition: all 0.1s; font-family: var(--font-ui); line-height: 1;
}
.role-row:hover .role-row__delete   { opacity: 0.6 }
.role-row__delete:hover             { opacity: 1 !important; color: var(--color-error) }
.role-row__delete:disabled          { opacity: 0 !important; cursor: not-allowed }

/* Add role */
.cast-panel__add {
  margin: 6px 2px 0; background: none;
  border: 1px dashed var(--color-border); border-radius: 6px;
  color: var(--color-text-muted); font-size: 12px; font-family: var(--font-ui);
  cursor: pointer; padding: 6px 8px; text-align: left; transition: all 0.15s; width: 100%;
}
.cast-panel__add:hover:not(:disabled) { border-color: var(--color-accent); color: var(--color-accent) }
.cast-panel__add:disabled             { opacity: 0.3; cursor: not-allowed }

.cast-panel__hint {
  font-size: 11px; color: var(--color-text-muted); opacity: 0.5;
  line-height: 1.5; padding: 8px 8px 0; font-style: italic;
}

/* Transitions */
.role-list-enter-active, .role-list-leave-active { transition: all 0.2s ease }
.role-list-enter-from, .role-list-leave-to       { opacity: 0; transform: translateX(-8px) }

/* ─── Voice Picker Modal ───────────────────────────────────── */
.picker-backdrop {
  position: fixed; inset: 0;
  background: rgba(14,12,24,0.75); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center; z-index: 500;
}

.picker-modal {
  background: var(--color-surface); border: 1px solid var(--color-border);
  border-radius: 14px; width: 400px; max-width: 95vw; max-height: 70vh;
  display: flex; flex-direction: column;
  box-shadow: 0 24px 64px rgba(0,0,0,0.5); overflow: hidden;
}

.picker-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 18px 20px 14px; border-bottom: 1px solid var(--color-border); flex-shrink: 0;
}
.picker-title {
  font-size: 15px; font-weight: 600; font-family: var(--font-display);
  color: var(--color-text); margin: 0;
}
.picker-close {
  background: none; border: none; color: var(--color-text-muted);
  font-size: 14px; cursor: pointer; padding: 4px 8px; border-radius: 4px;
  transition: color 0.1s;
}
.picker-close:hover { color: var(--color-text) }

.picker-search { padding: 12px 16px; border-bottom: 1px solid var(--color-border); flex-shrink: 0 }
.picker-search__input {
  width: 100%; background: var(--color-bg); border: 1px solid var(--color-border);
  border-radius: 7px; padding: 8px 12px; font-size: 13px; font-family: var(--font-ui);
  color: var(--color-text); outline: none; transition: border-color 0.15s;
}
.picker-search__input:focus    { border-color: var(--color-accent) }
.picker-search__input::placeholder { color: var(--color-text-muted); opacity: 0.5 }

.picker-loading, .picker-error, .picker-empty {
  padding: 24px; text-align: center; font-size: 13px; color: var(--color-text-muted);
}
.picker-error { color: var(--color-error) }

.picker-list { overflow-y: auto; padding: 8px; flex: 1 }

.picker-voice {
  display: flex; align-items: center; justify-content: space-between;
  width: 100%; background: none; border: none; border-radius: 7px;
  padding: 9px 12px; cursor: pointer; transition: background 0.1s; gap: 10px;
}
.picker-voice:hover         { background: var(--color-bg) }
.picker-voice--active       { background: rgba(124,92,191,0.15) }
.picker-voice--active:hover { background: rgba(124,92,191,0.2) }

.picker-voice__name {
  font-size: 13px; font-weight: 500; color: var(--color-text); text-align: left;
}
.picker-voice__meta {
  display: flex; align-items: center; gap: 6px;
  font-size: 11px; font-family: var(--font-mono); color: var(--color-text-muted);
  flex-shrink: 0;
}
.picker-voice__lang   { opacity: 0.6 }
.picker-voice__cloned {
  background: rgba(124,92,191,0.2); color: var(--color-accent);
  border-radius: 3px; padding: 1px 5px; font-size: 10px;
}

.picker-footer {
  padding: 10px 16px; border-top: 1px solid var(--color-border); flex-shrink: 0;
}
.picker-clear {
  background: none; border: none; color: var(--color-error); font-size: 12px;
  font-family: var(--font-ui); cursor: pointer; opacity: 0.7; padding: 0;
  transition: opacity 0.1s;
}
.picker-clear:hover { opacity: 1 }

.modal-enter-active, .modal-leave-active { transition: all 0.2s ease }
.modal-enter-from, .modal-leave-to       { opacity: 0; transform: scale(0.96) }
</style>
