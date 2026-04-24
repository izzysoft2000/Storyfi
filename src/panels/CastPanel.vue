<template>
  <div class="cast-panel">

    <!-- Role cards — draggable to reorder -->
    <div class="cp-list">
      <draggable
        v-model="reorderableCast"
        item-key="id"
        handle=".drag-handle"
        :animation="180"
        ghost-class="role-card--ghost"
      >
        <template #item="{ element: role }">
          <div
            class="role-card"
            :style="{ '--role-color': role.color }"
          >
            <!-- Row 1: drag handle · colour swatch · name · actions -->
            <div class="card-row">
              <span class="drag-handle" title="Drag to reorder">⠿</span>

              <div class="color-swatch" :style="{ backgroundColor: role.color }">
                <input
                  type="color"
                  class="color-input"
                  :value="role.color"
                  @input="onColorChange(role.id, $event.target.value)"
                />
              </div>

              <input
                v-model="role.label"
                class="name-input"
                placeholder="Name…"
                @blur="commitEdit(role.id, role.label)"
              />

              <div class="action-group">
                <button
                  class="icon-btn"
                  :class="{ 'icon-btn--active': expandedRoleId === role.id }"
                  title="Performance settings"
                  @click="toggleSettings(role.id)"
                >⚙️</button>
                <button
                  class="icon-btn icon-btn--delete"
                  title="Remove character"
                  @click="deleteRole(role)"
                >✕</button>
              </div>
            </div>

          <!-- Row 2: provider selector · voice picker -->
          <div class="card-row card-row--mt">
            <select
              v-model="role.voiceAssignment.providerId"
              class="provider-select"
              @change="onProviderChange(role)"
            >
              <option value="minimax">MiniMax</option>
              <option value="openai">OpenAI</option>
              <option value="elevenlabs">ElevenLabs</option>
              <option value="browser">Browser</option>
            </select>

            <button
              class="voice-selector"
              :class="{ 'voice-selector--assigned': role.voiceAssignment?.voiceId }"
              @click="openVoicePicker(role)"
            >
              {{ role.voiceAssignment?.voiceName || 'Select Voice…' }}
            </button>

            <!-- Quick-play preview of the assigned voice -->
            <button
              v-if="role.voiceAssignment?.voiceId"
              class="voice-preview-btn voice-preview-btn--inline"
              :class="{
                'voice-preview-btn--loading': loadingPreviewId === role.voiceAssignment.voiceId,
                'voice-preview-btn--playing': playingPreviewId === role.voiceAssignment.voiceId,
              }"
              :disabled="loadingPreviewId !== null && loadingPreviewId !== role.voiceAssignment.voiceId"
              :title="playingPreviewId === role.voiceAssignment.voiceId ? 'Stop preview' : 'Preview voice'"
              @click="togglePreview(role.voiceAssignment.providerId, role.voiceAssignment.voiceId)"
            >
              <svg v-if="loadingPreviewId === role.voiceAssignment.voiceId"
                   class="preview-spinner" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="2"
                        stroke-dasharray="17 17" stroke-linecap="round"/>
              </svg>
              <svg v-else-if="playingPreviewId === role.voiceAssignment.voiceId"
                   viewBox="0 0 16 16" fill="currentColor">
                <rect x="4" y="4" width="8" height="8" rx="1.5"/>
              </svg>
              <svg v-else viewBox="0 0 16 16" fill="currentColor">
                <path d="M5 3.5l9 4.5-9 4.5V3.5z"/>
              </svg>
            </button>
          </div>

          <!-- Performance sliders (expandable) -->
          <Transition name="slide">
            <div v-if="expandedRoleId === role.id" class="advanced-area">

              <div class="slider-row">
                <div class="slider-label">
                  Speed
                  <span class="slider-value">{{ role.voiceAssignment.settings.speed }}x</span>
                </div>
                <input
                  type="range" min="0.5" max="2.0" step="0.1"
                  v-model.number="role.voiceAssignment.settings.speed"
                  class="range-input"
                />
              </div>

              <div class="slider-row">
                <div class="slider-label">
                  Volume
                  <span class="slider-value">{{ role.voiceAssignment.settings.volume }}x</span>
                </div>
                <input
                  type="range" min="0" max="2.0" step="0.1"
                  v-model.number="role.voiceAssignment.settings.volume"
                  class="range-input"
                />
              </div>

              <div v-if="role.voiceAssignment.providerId !== 'openai'" class="slider-row">
                <div class="slider-label">
                  Pitch
                  <span class="slider-value">
                    {{ role.voiceAssignment.settings.pitch > 0 ? '+' : '' }}{{ role.voiceAssignment.settings.pitch }}
                  </span>
                </div>
                <input
                  type="range" min="-12" max="12" step="1"
                  v-model.number="role.voiceAssignment.settings.pitch"
                  class="range-input"
                />
              </div>

              <div v-if="role.voiceAssignment.providerId === 'minimax'" class="slider-row">
                <div class="slider-label">
                  Model
                  <span
                    class="model-cost-badge"
                    :class="`model-cost-badge--${modelTier(role.voiceAssignment.settings.model)}`"
                  >{{ modelCostLabel(role.voiceAssignment.settings.model) }}</span>
                </div>
                <select
                  v-model="role.voiceAssignment.settings.model"
                  class="provider-select provider-select--full"
                >
                  <optgroup label="speech-2.8 (Latest)">
                    <option value="speech-2.8-hd">speech-2.8-hd — Best Quality</option>
                    <option value="speech-2.8-turbo">speech-2.8-turbo — Turbo · Lower Cost</option>
                  </optgroup>
                  <optgroup label="speech-2.6">
                    <option value="speech-2.6-hd">speech-2.6-hd — HD</option>
                    <option value="speech-2.6-turbo">speech-2.6-turbo — Turbo · Lower Cost</option>
                  </optgroup>
                  <optgroup label="speech-02 (Legacy)">
                    <option value="speech-02-hd">speech-02-hd — HD</option>
                    <option value="speech-02-turbo">speech-02-turbo — Turbo</option>
                  </optgroup>
                  <optgroup label="speech-01 (Legacy)">
                    <option value="speech-01-hd">speech-01-hd — HD</option>
                    <option value="speech-01-turbo">speech-01-turbo — Cheapest</option>
                  </optgroup>
                </select>
              </div>

              <div v-if="role.voiceAssignment.providerId === 'minimax'" class="slider-row">
                <div class="slider-label">Emotion</div>
                <select
                  v-model="role.voiceAssignment.settings.emotion"
                  class="provider-select provider-select--full"
                >
                  <option value="">— None (API default) —</option>
                  <option value="neutral">Neutral</option>
                  <option value="happy">Happy</option>
                  <option value="sad">Sad</option>
                  <option value="angry">Angry</option>
                </select>
              </div>

            </div>
          </Transition>
        </div>
        </template>
      </draggable>
    </div>

    <!-- Add character -->
    <button
      class="add-role-btn"
      :disabled="roles.length >= 10"
      @click="addRole"
    >
      + Add New Character
    </button>

    <button
      class="autotag-btn"
      title="Scan script for [LABEL] patterns and tag matching spans — creates missing cast members automatically"
      @click="$emit('auto-tag')"
    >
      ⚡ Auto-tag from script
    </button>

    <p class="hint-text">Tag text in editor to assign voices.</p>

    <!-- Voice picker modal -->
    <Teleport to="body">
      <Transition name="modal-fade">
        <div
          v-if="pickerOpen"
          class="modal-overlay"
          @click.self="pickerOpen = false; stopPreview()"
        >
          <div class="modal-box">
            <div class="modal-header">
              <span>Voice for <strong>{{ pickerRole?.label }}</strong></span>
              <button class="icon-btn" @click="pickerOpen = false; stopPreview()">✕</button>
            </div>
            <div class="modal-body">
              <input
                v-model="voiceSearch"
                class="modal-search"
                placeholder="Search voices…"
              />

              <!-- Language filter pills -->
              <div v-if="availableLanguages.length > 1" class="lang-filter">
                <button
                  class="lang-pill"
                  :class="{ 'lang-pill--active': selectedLanguage === null }"
                  @click="selectedLanguage = null"
                >All</button>
                <button
                  v-for="lang in availableLanguages"
                  :key="lang"
                  class="lang-pill"
                  :class="{ 'lang-pill--active': selectedLanguage === lang }"
                  :title="langName(lang)"
                  @click="selectedLanguage = selectedLanguage === lang ? null : lang"
                >{{ langLabel(lang) }}</button>
              </div>

              <!-- Gender filter pills -->
              <div class="lang-filter lang-filter--gender">
                <button
                  class="lang-pill"
                  :class="{ 'lang-pill--active': selectedGender === null }"
                  @click="selectedGender = null"
                >Both</button>
                <button
                  class="lang-pill"
                  :class="{ 'lang-pill--active': selectedGender === 'male' }"
                  @click="selectedGender = selectedGender === 'male' ? null : 'male'"
                >♂ Male</button>
                <button
                  class="lang-pill"
                  :class="{ 'lang-pill--active': selectedGender === 'female' }"
                  @click="selectedGender = selectedGender === 'female' ? null : 'female'"
                >♀ Female</button>
              </div>

              <div v-if="loadingVoices" class="modal-info">Loading…</div>
              <div v-else-if="filteredVoices.length === 0" class="modal-info">No voices match</div>
              <div v-else class="voice-list">
                <div
                  v-for="voice in filteredVoices"
                  :key="voice.id"
                  class="voice-item"
                  :class="{ 'voice-item--active': pickerRole?.voiceAssignment?.voiceId === voice.id }"
                >
                  <button class="voice-item__select" @click="assignVoice(voice)">
                    <span class="voice-item__name">{{ voice.name }}</span>
                    <span class="voice-item__tags">
                      <span
                        class="voice-tag"
                        :class="voice.language !== 'en' ? 'voice-tag--foreign' : 'voice-tag--en'"
                        :title="langName(voice.language)"
                      >{{ langLabel(voice.language) }}</span>
                      <span class="voice-tag voice-tag--gender">{{ voice.gender }}</span>
                    </span>
                  </button>
                  <button
                    class="voice-preview-btn"
                    :class="{
                      'voice-preview-btn--loading': loadingPreviewId === voice.id,
                      'voice-preview-btn--playing': playingPreviewId === voice.id,
                      'voice-preview-btn--cached':  cachedPreviewIds.has(voice.id) && loadingPreviewId !== voice.id && playingPreviewId !== voice.id,
                    }"
                    :disabled="loadingPreviewId !== null && loadingPreviewId !== voice.id"
                    :title="playingPreviewId === voice.id
                      ? 'Stop preview'
                      : cachedPreviewIds.has(voice.id)
                        ? 'Play preview (cached)'
                        : 'Generate preview'"
                    @click.stop="togglePreview(pickerRole.voiceAssignment.providerId, voice.id)"
                  >
                    <!-- Spinner while generating -->
                    <svg v-if="loadingPreviewId === voice.id"
                         class="preview-spinner" viewBox="0 0 16 16" fill="none">
                      <circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="2"
                              stroke-dasharray="17 17" stroke-linecap="round"/>
                    </svg>
                    <!-- Stop square while playing -->
                    <svg v-else-if="playingPreviewId === voice.id"
                         viewBox="0 0 16 16" fill="currentColor">
                      <rect x="4" y="4" width="8" height="8" rx="1.5"/>
                    </svg>
                    <!-- Play triangle otherwise -->
                    <svg v-else viewBox="0 0 16 16" fill="currentColor">
                      <path d="M5 3.5l9 4.5-9 4.5V3.5z"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useProjectStore } from '@/store/project.js'
import { getProvider }     from '@/tts/provider.js'
import { getApiKey }       from '@/store/db.js'
import { getVoicePreview, saveVoicePreview, getAllVoicePreviewKeys } from '@/store/db.js'
import draggable           from 'vuedraggable'

// Module-level Audio element — not reactive (same pattern as Web Audio in playback.js)
let _previewAudio = null

// Short text used for all preview generations — cheap and voice-characterising
const PREVIEW_TEXT = 'Hello. How does this sound to you?'

// ─── Store ────────────────────────────────────────────────────────────────────

const store = useProjectStore()
const roles = computed(() => store.cast)

const emit = defineEmits(['auto-tag'])

// Writable computed so vuedraggable can write the new order back to the store
const reorderableCast = computed({
  get: () => store.cast,
  set: (newOrder) => store.reorderCast(newOrder),
})

// ─── Normalize voiceAssignment ────────────────────────────────────────────────
// Guard against roles loaded from older saves or created before the store fix,
// where voiceAssignment is null or settings is missing.

const DEFAULT_SETTINGS = {
  speed: 1.0, pitch: 0, volume: 1.0, emotion: '', model: 'speech-2.6-hd',
}

function normalizeRoles(cast) {
  cast?.forEach(role => {
    if (!role.voiceAssignment) {
      role.voiceAssignment = {
        providerId: 'minimax', voiceId: null, voiceName: null,
        settings: { ...DEFAULT_SETTINGS },
      }
    } else if (!role.voiceAssignment.settings) {
      role.voiceAssignment.settings = { ...DEFAULT_SETTINGS }
    } else {
      // Backfill any keys added after the role was first saved
      role.voiceAssignment.settings = {
        ...DEFAULT_SETTINGS,
        ...role.voiceAssignment.settings,
      }
    }
  })
}

watch(roles, normalizeRoles, { immediate: true })

// ─── Role card actions ────────────────────────────────────────────────────────

const expandedRoleId = ref(null)

function toggleSettings(id) {
  expandedRoleId.value = expandedRoleId.value === id ? null : id
}

function onColorChange(id, color) {
  store.updateRoleColor(id, color)
}

function commitEdit(id, label) {
  store.updateRoleLabel(id, label)
}

function addRole() {
  store.addRole()
}

function deleteRole(role) {
  store.deleteRole(role.id)
}

function onProviderChange(role) {
  role.voiceAssignment.settings = {
    ...DEFAULT_SETTINGS,
    ...role.voiceAssignment.settings,
  }
}

// ─── Voice preview ────────────────────────────────────────────────────────────

/** voiceId currently being fetched/generated — shows spinner */
const loadingPreviewId = ref(null)

/** voiceId currently playing audio — shows stop icon */
const playingPreviewId = ref(null)

/** Set of voiceIds that have a cached preview blob for the current picker's provider */
const cachedPreviewIds = ref(new Set())

/**
 * Preview a voice. Plays from cache if available, otherwise generates
 * a short TTS sample and caches it for all future previews.
 *
 * @param {string} providerId
 * @param {string} voiceId
 */
async function previewVoice(providerId, voiceId) {
  // Stop any current playback first
  stopPreview()

  // Browser provider — use SpeechSynthesis directly, no API key needed
  if (providerId === 'browser') {
    speechSynthesis.cancel()
    const utt = new SpeechSynthesisUtterance(PREVIEW_TEXT)
    if (voiceId) {
      const v = speechSynthesis.getVoices().find(v => v.voiceURI === voiceId)
      if (v) utt.voice = v
    }
    playingPreviewId.value = voiceId
    utt.onend = () => { playingPreviewId.value = null }
    utt.onerror = () => { playingPreviewId.value = null }
    speechSynthesis.speak(utt)
    return
  }

  const cacheKey = `${providerId}_${voiceId}`

  // Check cache
  let blob = await getVoicePreview(cacheKey)

  if (!blob) {
    loadingPreviewId.value = voiceId
    try {
      const provider  = getProvider(providerId)
      const keyRecord = await getApiKey(provider.id)
      if (!keyRecord) {
        console.warn('[preview] No API key for', providerId)
        loadingPreviewId.value = null
        return
      }
      const result = await provider.generate({
        text:     PREVIEW_TEXT,
        voiceId,
        apiKey:   keyRecord.encrypted,
        groupId:  keyRecord.groupId ?? null,
        settings: { speed: 1.0, pitch: 0, volume: 1.0, emotion: '', model: 'speech-2.6-hd' },
      })
      blob = result.blob
      await saveVoicePreview(cacheKey, blob)
      // Mark as cached so the picker indicator updates immediately
      cachedPreviewIds.value = new Set([...cachedPreviewIds.value, voiceId])
    } catch (err) {
      console.error('[preview] generation failed:', err)
      loadingPreviewId.value = null
      return
    }
    loadingPreviewId.value = null
  }

  // Play
  const url = URL.createObjectURL(blob)
  _previewAudio = new Audio(url)
  playingPreviewId.value = voiceId
  _previewAudio.onended = () => {
    playingPreviewId.value = null
    URL.revokeObjectURL(url)
    _previewAudio = null
  }
  _previewAudio.play().catch(err => {
    console.error('[preview] playback failed:', err)
    playingPreviewId.value = null
  })
}

function stopPreview() {
  if ('speechSynthesis' in window) speechSynthesis.cancel()
  if (_previewAudio) {
    _previewAudio.pause()
    _previewAudio.onended = null
    _previewAudio = null
  }
  playingPreviewId.value  = null
  loadingPreviewId.value  = null
}

function togglePreview(providerId, voiceId) {
  if (playingPreviewId.value === voiceId) {
    stopPreview()
  } else {
    previewVoice(providerId, voiceId)
  }
}

// ─── Voice picker ─────────────────────────────────────────────────────────────

const pickerOpen    = ref(false)
const pickerRole    = ref(null)
const voiceList     = ref([])
const voiceSearch   = ref('')
const loadingVoices = ref(false)
const selectedLanguage = ref(null)  // null = show all
const selectedGender   = ref(null)  // null = show all

// Short display labels and full names for each language code
const LANG_LABELS = {
  en: { code: 'EN', name: 'English' },
  fr: { code: 'FR', name: 'French' },
  es: { code: 'ES', name: 'Spanish' },
  de: { code: 'DE', name: 'German' },
  it: { code: 'IT', name: 'Italian' },
  ru: { code: 'RU', name: 'Russian' },
  ja: { code: 'JA', name: 'Japanese' },
  ko: { code: 'KO', name: 'Korean' },
  zh: { code: 'ZH', name: 'Chinese' },
  yue:{ code: 'YUE', name: 'Cantonese' },
  pt: { code: 'PT', name: 'Portuguese' },
  ar: { code: 'AR', name: 'Arabic' },
  hi: { code: 'HI', name: 'Hindi' },
  id: { code: 'ID', name: 'Indonesian' },
  nl: { code: 'NL', name: 'Dutch' },
  pl: { code: 'PL', name: 'Polish' },
  tr: { code: 'TR', name: 'Turkish' },
  uk: { code: 'UK', name: 'Ukrainian' },
}

function langLabel(code) {
  return LANG_LABELS[code]?.code ?? (code ?? '').toUpperCase()
}

function langName(code) {
  return LANG_LABELS[code]?.name ?? code
}

// Unique languages present in the current voice list, English first
const availableLanguages = computed(() => {
  const seen = new Set()
  const langs = []
  for (const v of voiceList.value) {
    if (v.language && !seen.has(v.language)) {
      seen.add(v.language)
      langs.push(v.language)
    }
  }
  return langs.sort((a, b) => a === 'en' ? -1 : b === 'en' ? 1 : a.localeCompare(b))
})

const filteredVoices = computed(() => {
  const q      = voiceSearch.value.toLowerCase()
  const lang   = selectedLanguage.value
  const gender = selectedGender.value
  return voiceList.value.filter(v => {
    if (lang   && v.language !== lang)    return false
    if (gender && v.gender   !== gender)  return false
    if (q      && !v.name.toLowerCase().includes(q)) return false
    return true
  })
})

async function openVoicePicker(role) {
  pickerRole.value    = role
  pickerOpen.value    = true
  loadingVoices.value = true
  voiceSearch.value   = ''
  stopPreview()
  cachedPreviewIds.value = new Set()
  selectedLanguage.value = null
  selectedGender.value   = null

  try {
    const provider  = getProvider(role.voiceAssignment.providerId || 'minimax')
    const keyRecord = await getApiKey(provider.id)
    voiceList.value = await provider.voices(keyRecord?.encrypted, keyRecord?.groupId)

    // Load which voices already have a cached preview for this provider
    const prefix   = `${role.voiceAssignment.providerId}_`
    const allKeys  = await getAllVoicePreviewKeys()
    cachedPreviewIds.value = new Set(
      allKeys
        .filter(k => k.startsWith(prefix))
        .map(k => k.slice(prefix.length))
    )
  } catch (err) {
    console.error('[CastPanel] voice load failed', err)
  } finally {
    loadingVoices.value = false
  }
}

function assignVoice(voice) {
  store.updateRoleVoice(pickerRole.value.id, {
    voiceId:    voice.id,
    voiceName:  voice.name,
    providerId: pickerRole.value.voiceAssignment.providerId || 'minimax',
    settings:   pickerRole.value.voiceAssignment.settings  || { ...DEFAULT_SETTINGS },
  })
  pickerOpen.value = false
}
// ─── Model helpers ────────────────────────────────────────────────────────────

const MODEL_TIERS = {
  'speech-2.8-hd':    { tier: 'premium',  label: 'Premium' },
  'speech-2.8-turbo': { tier: 'standard', label: 'Standard' },
  'speech-2.6-hd':    { tier: 'premium',  label: 'Premium' },
  'speech-2.6-turbo': { tier: 'standard', label: 'Standard' },
  'speech-02-hd':     { tier: 'standard', label: 'Standard' },
  'speech-02-turbo':  { tier: 'budget',   label: 'Budget' },
  'speech-01-hd':     { tier: 'budget',   label: 'Budget' },
  'speech-01-turbo':  { tier: 'budget',   label: 'Budget' },
}

function modelTier(model) {
  return MODEL_TIERS[model]?.tier ?? 'standard'
}

function modelCostLabel(model) {
  return MODEL_TIERS[model]?.label ?? ''
}
</script>

<style scoped>
/* ─── Panel shell ────────────────────────────────────────────────────────────── */

.cast-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  overflow-x: hidden;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-ui);
}

/* ─── List ───────────────────────────────────────────────────────────────────── */

.cp-list {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
  min-height: 0;
}

/* ─── Role card ──────────────────────────────────────────────────────────────── */

.role-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-left: 3px solid var(--role-color);
  border-radius: 8px;
  padding: 11px 12px;
  margin-bottom: 8px;
}

.card-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.card-row--mt {
  margin-top: 9px;
}

/* ─── Colour swatch ──────────────────────────────────────────────────────────── */

.color-swatch {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.15);
  position: relative;
  flex-shrink: 0;
  cursor: pointer;
}

.color-input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
  width: 100%;
  height: 100%;
}

/* ─── Name input ─────────────────────────────────────────────────────────────── */

.name-input {
  all: unset;
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  font-family: var(--font-ui);
  color: var(--color-text);
  background: transparent;
  border-bottom: 1px solid transparent;
  transition: border-color 0.15s;
  min-width: 0;
}

.name-input:focus {
  border-bottom-color: var(--color-accent);
}

/* ─── Action buttons ─────────────────────────────────────────────────────────── */

.action-group {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.icon-btn {
  all: unset;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  font-size: 13px;
  opacity: 0.35;
  border-radius: 4px;
  padding: 2px 3px;
  transition: opacity 0.15s, color 0.15s;
}

.icon-btn:hover {
  opacity: 1;
}

.icon-btn--active {
  opacity: 1;
  color: var(--color-accent);
}

.icon-btn--delete:hover {
  color: var(--color-error);
}

/* ─── Provider select ────────────────────────────────────────────────────────── */

.provider-select {
  all: unset;
  box-sizing: border-box;
  appearance: none;
  -webkit-appearance: none;
  cursor: pointer;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  color: var(--color-text);
  font-size: 11px;
  font-family: var(--font-ui);
  padding: 4px 8px;
  border-radius: 5px;
  min-width: 78px;
  transition: border-color 0.15s;
}

.provider-select:focus {
  border-color: var(--color-accent);
}

.provider-select--full {
  width: 100%;
}

/* ─── Voice selector button ──────────────────────────────────────────────────── */

.voice-selector {
  all: unset;
  cursor: pointer;
  box-sizing: border-box;
  flex: 1;
  background: var(--color-bg);
  border: 1px dashed var(--color-border);
  color: var(--color-text-muted);
  font-size: 11px;
  font-family: var(--font-ui);
  padding: 4px 8px;
  border-radius: 5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: border-color 0.15s, color 0.15s;
}

.voice-selector:hover {
  border-color: var(--color-accent);
  color: var(--color-text);
}

.voice-selector--assigned {
  border-style: solid;
  border-color: var(--color-accent);
  color: var(--color-highlight);
}

/* ─── Performance sliders ────────────────────────────────────────────────────── */

.advanced-area {
  margin-top: 11px;
  padding-top: 11px;
  border-top: 1px solid var(--color-border);
  overflow: hidden;
}

.slider-row {
  margin-bottom: 9px;
}

.slider-row:last-child {
  margin-bottom: 0;
}

.slider-label {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: var(--color-text-muted);
  margin-bottom: 5px;
}

.slider-value {
  font-family: var(--font-mono);
  color: var(--color-accent);
}

.range-input {
  width: 100%;
  cursor: pointer;
  accent-color: var(--color-accent);
  height: 4px;
}

/* ─── Add character button ───────────────────────────────────────────────────── */

.add-role-btn {
  all: unset;
  cursor: pointer;
  box-sizing: border-box;
  display: block;
  width: calc(100% - 20px);
  margin: 4px 10px 0;
  background: transparent;
  border: 1px dashed var(--color-border);
  color: var(--color-text-muted);
  font-size: 12px;
  font-family: var(--font-ui);
  padding: 9px;
  border-radius: 7px;
  text-align: center;
  transition: border-color 0.15s, color 0.15s;
}

.add-role-btn:hover:not(:disabled) {
  border-color: var(--color-accent);
  color: var(--color-text);
}

.add-role-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* ─── Auto-tag button ────────────────────────────────────────────────────────── */

.autotag-btn {
  all: unset;
  cursor: pointer;
  box-sizing: border-box;
  display: block;
  width: calc(100% - 20px);
  margin: 6px 10px 0;
  background: rgba(124, 92, 191, 0.08);
  border: 1px solid rgba(124, 92, 191, 0.3);
  color: var(--color-accent);
  font-size: 12px;
  font-family: var(--font-ui);
  padding: 8px;
  border-radius: 7px;
  text-align: center;
  transition: background 0.15s, border-color 0.15s;
}

.autotag-btn:hover {
  background: rgba(124, 92, 191, 0.18);
  border-color: var(--color-accent);
}

/* ─── Hint text ──────────────────────────────────────────────────────────────── */

.hint-text {
  font-size: 11px;
  color: var(--color-text-muted);
  opacity: 0.5;
  font-style: italic;
  padding: 8px 12px 10px;
}

/* ─── Voice picker modal ─────────────────────────────────────────────────────── */

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(3px);
}

.modal-box {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  width: 340px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  background: var(--color-border);
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text);
  flex-shrink: 0;
}

.modal-header strong {
  color: var(--color-highlight);
}

.modal-body {
  padding: 14px;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.modal-search {
  all: unset;
  box-sizing: border-box;
  width: 100%;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  color: var(--color-text);
  font-size: 12px;
  font-family: var(--font-ui);
  padding: 8px 10px;
  border-radius: 6px;
  margin-bottom: 10px;
  transition: border-color 0.15s;
  flex-shrink: 0;
}

.modal-search:focus {
  border-color: var(--color-accent);
}

.modal-info {
  font-size: 12px;
  color: var(--color-text-muted);
  text-align: center;
  padding: 20px;
}

.voice-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 260px;
}

.voice-item {
  display: flex;
  align-items: center;
  gap: 0;
  border-radius: 6px;
  transition: background 0.1s;
}

.voice-item:hover {
  background: var(--color-bg);
}

.voice-item--active .voice-item__select {
  color: var(--color-highlight);
}

.voice-item__select {
  all: unset;
  cursor: pointer;
  box-sizing: border-box;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 9px 10px;
  font-size: 12px;
  font-family: var(--font-ui);
  color: var(--color-text-muted);
  transition: color 0.1s;
  min-width: 0;
}

.voice-item:hover .voice-item__select {
  color: var(--color-text);
}

.voice-item__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.voice-item__meta {
  font-size: 10px;
  color: var(--color-text-muted);
  opacity: 0.55;
  flex-shrink: 0;
}

/* ─── Language filter pills ──────────────────────────────────────────────────── */

.lang-filter {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 8px;
  /* Cap at ~3.5 rows so users can see there's more to scroll to */
  max-height: calc(3.5 * (20px + 5px));
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--color-border) transparent;
  padding-right: 2px;
  /* Fade bottom edge to hint at scrollability */
  mask-image: linear-gradient(to bottom, black 75%, transparent 100%);
  -webkit-mask-image: linear-gradient(to bottom, black 75%, transparent 100%);
}

.lang-filter--gender {
  margin-bottom: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--color-border);
}

.lang-pill {
  all: unset;
  cursor: pointer;
  box-sizing: border-box;
  font-size: 10px;
  font-weight: 600;
  font-family: var(--font-mono);
  padding: 2px 7px;
  border-radius: 20px;
  border: 1px solid var(--color-border);
  color: var(--color-text-muted);
  transition: border-color 0.12s, color 0.12s, background 0.12s;
}

.lang-pill:hover {
  border-color: var(--color-accent);
  color: var(--color-text);
}

.lang-pill--active {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: #fff;
}

/* ─── Voice row tag badges ───────────────────────────────────────────────────── */

.voice-item__tags {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.voice-tag {
  font-size: 9px;
  font-weight: 600;
  font-family: var(--font-mono);
  padding: 1px 5px;
  border-radius: 3px;
  border: 1px solid currentColor;
  white-space: nowrap;
}

/* English — subtle, doesn't need emphasis */
.voice-tag--en {
  color: var(--color-text-muted);
  opacity: 0.45;
}

/* Non-English — slightly accented so duplicates stand out */
.voice-tag--foreign {
  color: var(--color-highlight);
  opacity: 0.75;
}

.voice-tag--gender {
  color: var(--color-text-muted);
  opacity: 0.45;
  text-transform: capitalize;
}

/* ─── Voice preview button ───────────────────────────────────────────────────── */

.voice-preview-btn {
  all: unset;
  cursor: pointer;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 5px;
  color: var(--color-text-muted);
  opacity: 0;
  transition: opacity 0.15s, color 0.15s, background 0.15s;
}

.voice-preview-btn svg {
  width: 12px;
  height: 12px;
}

/* Show on row hover in the picker list */
.voice-item:hover .voice-preview-btn {
  opacity: 0.6;
}

.voice-preview-btn:hover:not(:disabled) {
  opacity: 1 !important;
  color: var(--color-accent);
  background: rgba(124, 92, 191, 0.12);
}

.voice-preview-btn--playing {
  opacity: 1 !important;
  color: var(--color-accent) !important;
}

.voice-preview-btn--loading {
  opacity: 1 !important;
  color: var(--color-text-muted);
  cursor: default;
}

/* Cached — accent color, always visible (no hover needed) */
.voice-preview-btn--cached {
  opacity: 0.65 !important;
  color: var(--color-accent);
}

.voice-preview-btn--cached:hover:not(:disabled) {
  opacity: 1 !important;
  background: rgba(124, 92, 191, 0.15);
}

.voice-preview-btn:disabled {
  opacity: 0.2 !important;
  cursor: not-allowed;
}

/* Inline variant on the role card — always visible when voice is assigned */
.voice-preview-btn--inline {
  opacity: 0.4;
  width: 24px;
  height: 24px;
}

.voice-preview-btn--inline:hover:not(:disabled) {
  opacity: 1 !important;
}

/* Spinner animation */
.preview-spinner {
  animation: preview-spin 0.75s linear infinite;
}

@keyframes preview-spin {
  to { transform: rotate(360deg) }
}

/* ─── Model cost badge ───────────────────────────────────────────────────────── */

.model-cost-badge {
  font-size: 9px;
  font-family: var(--font-mono);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 1px 6px;
  border-radius: 20px;
  border: 1px solid currentColor;
}

.model-cost-badge--premium  { color: var(--color-highlight) }
.model-cost-badge--standard { color: var(--color-text-muted) }
.model-cost-badge--budget   { color: var(--color-success) }

/* ─── Drag handle ────────────────────────────────────────────────────────────── */

.drag-handle {
  cursor: grab;
  font-size: 14px;
  color: var(--color-text-muted);
  opacity: 0;
  flex-shrink: 0;
  line-height: 1;
  padding: 0 2px;
  transition: opacity 0.15s;
  user-select: none;
}

.role-card:hover .drag-handle {
  opacity: 0.45;
}

.drag-handle:hover {
  opacity: 1 !important;
}

.drag-handle:active {
  cursor: grabbing;
}

/* Ghost card shown at the drop destination while dragging */
.role-card--ghost {
  opacity: 0.35;
  border-style: dashed;
  background: rgba(124, 92, 191, 0.06);
}

/* ─── Transitions ────────────────────────────────────────────────────────────── */

/* Slider expand/collapse */
.slide-enter-active,
.slide-leave-active {
  transition: max-height 0.25s ease, opacity 0.2s ease;
  max-height: 300px;
  overflow: hidden;
}

.slide-enter-from,
.slide-leave-to {
  max-height: 0;
  opacity: 0;
}

/* Modal appear */
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.18s;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

</style>
