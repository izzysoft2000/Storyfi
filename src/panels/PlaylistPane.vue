<template>
  <div class="playlist-pane">

    <!-- Selection header -->
    <div v-if="gen.groups.length > 0" class="playlist-sel-header">
      <input type="checkbox" class="sel-checkbox"
        :checked="allSelected"
        :indeterminate.prop="someSelected && !allSelected"
        title="Select all"
        @change="toggleSelectAll"
      />
      <span class="sel-col sel-col--count">({{ gen.groups.length }})</span>
      <span class="sel-col sel-col--time">{{ fmtTotal(totalEstimatedMs) }}</span>

      <!-- Follow mode toggle — now in toolbar -->
      <button
        class="follow-toggle"
        :class="{ 'follow-toggle--on': playback.followMode }"
        :title="playback.followMode ? 'Following active sentence (click to disable)' : 'Follow active sentence'"
        @click="playback.followMode = !playback.followMode"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" width="12" height="12" aria-hidden="true">
          <circle cx="10" cy="10" r="5.5" stroke="currentColor" stroke-width="1.6" fill="none"/>
          <circle cx="10" cy="10" r="1.8" fill="currentColor"/>
          <path stroke="currentColor" stroke-width="1.4" stroke-linecap="round"
            d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2"/>
        </svg>
      </button>

      <div v-if="someSelected" class="sel-actions">
        <button class="sel-action-btn sel-action-btn--regen"
          :disabled="!isOnline || gen.isGenerating"
          @click="emit('regenerate-selected', [...selectedIds])"
        >↺ Re-Generate ({{ selectedIds.size }})</button>
        <button class="sel-action-btn sel-action-btn--delete"
          @click="onDeleteSelected"
        >✕ Delete ({{ selectedIds.size }})</button>
      </div>
    </div>

    <!-- Progress bar -->
    <Transition name="progress">
      <div v-if="gen.isGenerating" class="progress-bar-wrap">
        <div class="progress-bar" :style="{ width: `${gen.progress * 100}%` }" />
        <span class="progress-label">{{ gen.progressLabel }}</span>
      </div>
    </Transition>

    <!-- Error banner -->
    <div v-if="gen.currentError && !gen.isGenerating" class="error-banner">
      ⚠ {{ gen.currentError }}
    </div>

    <!-- Body -->
    <div class="playlist-body">

      <!-- Nothing tagged yet -->
      <div v-if="gen.groups.length === 0 && taggedSpans.length === 0" class="playlist-empty">
        <span class="playlist-empty__icon">♪</span>
        <p>No voice tags yet</p>
        <p class="playlist-empty__sub">
          Select text in the editor and assign a role, then click Generate.
        </p>
      </div>

      <!-- Tagged spans preview — shown before first generation -->
      <div v-else-if="gen.groups.length === 0 && taggedSpans.length > 0" class="spans-preview">
        <div class="spans-preview__header">
          <span>{{ taggedSpans.length }} tagged span{{ taggedSpans.length !== 1 ? 's' : '' }} ready</span>
          <span class="spans-hint">Click Generate to create audio</span>
        </div>
        <div v-for="(span, i) in taggedSpans" :key="i" class="span-row">
          <span class="span-row__role" :style="{ color: span.color, borderColor: span.color }">
            {{ span.roleLabel }}
          </span>
          <span class="span-row__text">{{ truncate(span.text, 52) }}</span>
        </div>
      </div>

      <!-- Generated group rows — explicit condition, not v-else -->
      <div v-if="gen.groups.length > 0" class="groups-list">
        <div
          v-for="(group, groupIndex) in gen.groups"
          :key="group.id"
          class="group-row"
          :class="[`group-row--${group.stitchStatus}`, { 'group-row--playing': group.id === activeGroupId, 'group-row--blink': blinkingId === group.id }]"
          :style="{ '--group-color': group.color ?? 'var(--color-accent)' }"
          :data-group-id="group.id"
        >
          <!-- Group header -->
          <div class="group-row__header" @click="onGroupRowClick(group, groupIndex)">
            <input type="checkbox" class="sel-checkbox"
              :checked="groupAllSelected(group)"
              :indeterminate.prop="groupSomeSelected(group) && !groupAllSelected(group)"
              @click.stop
              @change.stop="toggleSelectGroup(group)"
            />
            <span class="expand-btn">{{ expanded[group.id] ? '▾' : '▸' }}</span>
            <span class="group-row__role" :style="{ color: group.color, borderColor: group.color }">
              {{ group.roleLabel }}
            </span>
            <span class="group-row__text">{{ truncate(firstSentenceText(group), 44) }}</span>
            <span class="group-row__sentences">({{ (group.sentences ?? []).length }})</span>
            <span class="group-row__duration">
              {{ fmtGroup(group) }}
            </span>
            <span class="group-row__status">
              <span v-if="gen.diskDivergences[group.id]" class="status-dot status-dot--warn"
                :title="divergenceLabel(gen.diskDivergences[group.id])">⚠</span>
              <span v-else-if="group.stitchStatus === 'ready'"     class="status-dot status-dot--ok">✓</span>
              <span v-else-if="group.stitchStatus === 'stitching'" class="status-dot status-dot--spin">⟳</span>
              <span v-else-if="group.stitchStatus === 'error'"     class="status-dot status-dot--err">✕</span>
              <span v-else                                          class="status-dot status-dot--pending">○</span>
            </span>


          </div>

          <!-- Sentence sub-rows -->
          <Transition name="expand">
            <div v-if="expanded[group.id]" class="sentence-rows">
              <div
                v-for="s in (group.sentences ?? [])"
                :key="s.id"
                class="sentence-row sentence-row--clickable"
                :class="{
                  'sentence-row--blink':  blinkingId === s.id,
                  'sentence-row--active': playback.followMode && s.id === playback.currentSentenceId,
                  'sentence-row--selected': selectedIds.has(s.id),
                }"
                :data-sentence-id="s.id"
                :title="'Click to locate in editor and seek player'"
                @click="onSentenceClick(s, group, groupIndex)"
              >
                <input type="checkbox" class="sel-checkbox sel-checkbox--sentence"
                  :checked="selectedIds.has(s.id)"
                  @click.stop
                  @change.stop="toggleSelectSentence(s.id)"
                />
                <span class="sentence-row__idx">{{ s.sentenceIndex + 1 }}</span>
                <span class="sentence-row__text">{{ truncate(s.text, 50) }}</span>
                <span class="sentence-row__dur">{{ s.durationMs != null ? fmt(s.durationMs) : '—' }}</span>
                <span class="sentence-row__status">
                  <span v-if="s.status === 'ready'"          class="s-dot s-dot--ok">✓</span>
                  <span v-else-if="s.status === 'generating'" class="s-dot s-dot--spin">⟳</span>
                  <span v-else-if="s.status === 'error'"      class="s-dot s-dot--err" :title="s.errorMessage">✕</span>
                  <span v-else                                 class="s-dot s-dot--pending">○</span>
                </span>
              </div>
            </div>
          </Transition>
        </div>
      </div>

    </div>



    <!-- Audio player — docked at bottom -->
    <AudioPlayerBar v-if="hasReadyAudio || playback.isPlaying || playback.isPaused" :groups="gen.groups" />

  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { useGenerationStore } from '@/store/generation.js'
import { usePlaybackStore }   from '@/store/playback.js'
import { formatDuration }     from '@/audio/timestamps.js'
import AudioPlayerBar         from '@/components/AudioPlayerBar.vue'

const props = defineProps({
  hasTaggedSpans: { type: Boolean, default: false },
  taggedSpans:    { type: Array,   default: () => [] },
  isOnline:       { type: Boolean, default: true },
})

const emit = defineEmits(['generate', 'regenerate-selected', 'delete-selected', 'regenerate-group', 'auto-tag', 'export', 'focus-sentence'])

const gen      = useGenerationStore()
const playback = usePlaybackStore()
const expanded = ref({})

const hasReadyAudio = computed(() => gen.groups.some(g => g.stitchStatus === 'ready'))

// Selection operates at sentence level
const selectedIds  = ref(new Set())  // sentence IDs

// All sentence IDs across all groups
const allSentenceIds = computed(() => gen.groups.flatMap(g => g.sentences?.map(s => s.id) ?? []))
const allSelected    = computed(() => allSentenceIds.value.length > 0 && allSentenceIds.value.every(id => selectedIds.value.has(id)))
const someSelected   = computed(() => allSentenceIds.value.some(id => selectedIds.value.has(id)))

function groupAllSelected(group) {
  return group.sentences?.every(s => selectedIds.value.has(s.id)) ?? false
}
function groupSomeSelected(group) {
  return group.sentences?.some(s => selectedIds.value.has(s.id)) ?? false
}
function toggleSelectSentence(id) {
  const s = new Set(selectedIds.value)
  s.has(id) ? s.delete(id) : s.add(id)
  selectedIds.value = s
}
function toggleSelectGroup(group) {
  const s = new Set(selectedIds.value)
  const ids = group.sentences?.map(s2 => s2.id) ?? []
  const allOn = ids.every(id => s.has(id))
  ids.forEach(id => allOn ? s.delete(id) : s.add(id))
  selectedIds.value = s
}
function toggleSelectAll() {
  selectedIds.value = allSelected.value ? new Set() : new Set(allSentenceIds.value)
}
function onDeleteSelected() {
  if (!selectedIds.value.size) return
  const ids = [...selectedIds.value]
  selectedIds.value = new Set()
  emit('delete-selected', ids)
}

// ID of the group currently under the playhead — drives row highlight + icon
const activeGroupId = computed(() =>
  (playback.isPlaying || playback.isPaused)
    ? playback.groupOffsets[playback.currentGroupIdx]?.groupId ?? null
    : null
)

function toggleExpand(id) {
  expanded.value[id] = !expanded.value[id]
}

function onGroupRowClick(group, index) {
  toggleExpand(group.id)
}

function onSentenceClick(s, group, groupIndex) {
  // Jump to tagged text in editor
  if (s.editorFrom != null) {
    emit('focus-sentence', { from: s.editorFrom, to: s.editorTo })
  }

  if (group.stitchStatus !== 'ready') return

  // Compute absolute master-timeline position for this sentence
  // group.startMs = absolute group start; s.startMs = offset within group
  const sentenceAbsMs = (group.startMs ?? 0) + (s.startMs ?? 0)

  if (playback.isPlaying || playback.isPaused) {
    playback.seekToMs(sentenceAbsMs)
  } else {
    // Cold start — load from this group then seek to sentence if not at group start
    playback.loadAndPlay(gen.groups, groupIndex)
  }
}

function firstSentenceText(group) {
  return group.sentences?.[0]?.text ?? '…'
}

function truncate(s, n) {
  return !s ? '' : s.length <= n ? s : s.slice(0, n) + '…'
}

function divergenceLabel(type) {
  if (type === 'missing_from_disk') return '⚠ File missing from output folder'
  if (type === 'missing_from_idb')  return '⚠ Audio missing from app storage'
  if (type === 'missing_both')      return '⚠ No audio found — needs regeneration'
  return '⚠ Out of sync'
}

function fmt(ms) { return formatDuration(ms) }

// ── Duration estimation ────────────────────────────────────────────────────────
// ~15 chars/second is a reasonable average for TTS narration/dialogue
const CHARS_PER_SEC = 15

function groupText(group) {
  return (group.sentences ?? []).map(s => s.text ?? '').join(' ')
}

function estimatedMs(group) {
  if (group.totalDurationMs != null) return group.totalDurationMs
  const chars = groupText(group).length
  return Math.round((chars / CHARS_PER_SEC) * 1000)
}

function fmtGroup(group) {
  const ms       = estimatedMs(group)
  const isActual = group.totalDurationMs != null
  const secs     = Math.ceil(ms / 1000)
  return (isActual ? '' : '~') + secs + 's'
}

const totalEstimatedMs = computed(() =>
  gen.groups.reduce((sum, g) => sum + estimatedMs(g), 0)
)

function fmtTotal(ms) {
  if (!ms) return ''
  const totalSec = Math.ceil(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
// ── Jump to entry from editor bubble ─────────────────────────────────────────
const blinkingId = ref(null)

async function jumpTo(groupId, sentenceId) {
  // 1. Expand the group
  expanded.value = { ...expanded.value, [groupId]: true }

  // 2. Wait a tick for the DOM to render the sentence rows
  await new Promise(r => setTimeout(r, 60))

  // 3. Find and scroll the sentence row into view
  const selector = sentenceId
    ? `[data-sentence-id="${sentenceId}"]`
    : `[data-group-id="${groupId}"]`
  const el = document.querySelector(selector)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })

  // 4. Blink the row
  blinkingId.value = sentenceId ?? groupId
  setTimeout(() => { blinkingId.value = null }, 1400)
}

// ── Follow mode — auto-expand + scroll to active sentence ────────────────────
watch(() => playback.currentSentenceId, async (sentenceId) => {
  if (!playback.followMode || !sentenceId) return

  const group = gen.groups.find(g => g.sentences?.some(s => s.id === sentenceId))
  if (!group) return

  if (!expanded.value[group.id]) {
    expanded.value = { ...expanded.value, [group.id]: true }
    await nextTick()
  }

  const el = document.querySelector(`[data-sentence-id="${sentenceId}"]`)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
})

defineExpose({ jumpTo })
</script>

<style scoped>
.playlist-pane {
  display: flex; flex-direction: column;
  background: var(--color-surface); overflow: hidden;
  flex: 1;        /* fill the .playlist-wrapper height */
  min-height: 0;
}

.playlist-toolbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 10px; border-bottom: 1px solid var(--color-border); flex-shrink: 0;
}

.playlist-count {
  font-family: var(--font-mono); font-size: 11px;
  color: var(--color-text-muted); opacity: 0.7;
  display: flex; align-items: center; gap: 8px;
}
.playlist-count__time {
  opacity: 0.6;
  font-size: 11px;
}

.toolbar-right { display: flex; gap: 5px }

.tb-btn {
  background: none; border: 1px solid var(--color-border);
  border-radius: 5px; color: var(--color-text-muted);
  font-size: 11px; font-family: var(--font-ui);
  padding: 4px 9px; cursor: pointer; transition: all 0.12s; white-space: nowrap;
}
.tb-btn:hover:not(:disabled) { border-color: var(--color-accent); color: var(--color-accent) }
.tb-btn:disabled              { opacity: 0.35; cursor: not-allowed }
.tb-btn--primary              { background: var(--color-accent); border-color: var(--color-accent); color: #fff }
.tb-btn--primary:hover:not(:disabled) { background: #e07050 }

/* Progress */
.progress-bar-wrap {
  position: relative; height: 28px;
  background: rgba(255,142,110,0.08);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0; overflow: hidden;
}
.progress-bar {
  position: absolute; left: 0; top: 0; bottom: 0;
  background: linear-gradient(90deg, var(--color-accent), var(--color-highlight));
  transition: width 0.4s ease;
}
.progress-label {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-family: var(--font-mono);
  color: var(--color-text); z-index: 1;
}

/* Error */
.error-banner {
  padding: 8px 12px; font-size: 12px;
  background: rgba(248,113,113,0.08);
  border-bottom: 1px solid rgba(248,113,113,0.2);
  color: var(--color-error); flex-shrink: 0;
}

/* Body */
.playlist-body { flex: 1; overflow-y: auto; padding: 8px; min-height: 0; }

/* Empty */
.playlist-empty {
  display: flex; flex-direction: column; align-items: center;
  text-align: center; gap: 6px; padding: 40px 20px;
  color: var(--color-text-muted);
}
.playlist-empty__icon { font-size: 28px; opacity: 0.2; margin-bottom: 4px }
.playlist-empty p     { font-size: 13px; margin: 0 }
.playlist-empty__sub  { font-size: 11px; opacity: 0.6; max-width: 180px; line-height: 1.5 }

/* Tagged spans preview */
.spans-preview { display: flex; flex-direction: column; gap: 3px }

.spans-preview__header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 0 4px 8px; font-size: 11px; color: var(--color-text-muted);
  font-family: var(--font-mono); border-bottom: 1px solid var(--color-border);
  margin-bottom: 4px;
}
.spans-hint { opacity: 0.5; font-style: italic }

.span-row {
  display: flex; align-items: baseline; gap: 8px;
  padding: 5px 6px; border-radius: 6px; transition: background 0.1s;
}
.span-row:hover { background: var(--color-bg) }

.span-row__role {
  font-size: 10px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.06em; border: 1px solid; border-radius: 20px;
  padding: 1px 7px; white-space: nowrap; flex-shrink: 0;
}
.span-row__text {
  font-size: 12px; color: var(--color-text-muted);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* Group rows */
.groups-list { display: flex; flex-direction: column; gap: 2px }

.group-row {
  border-radius: 7px; border: 1px solid transparent;
  transition: background 0.1s; overflow: hidden;
}
.group-row:hover        { background: var(--color-bg) }
.group-row--ready       { border-color: rgba(74,222,128,0.15) }
.group-row--error       { border-color: rgba(248,113,113,0.2) }

.group-row__header {
  display: grid;
  grid-template-columns: 20px 14px auto 1fr auto auto auto auto;
  align-items: center; gap: 6px; padding: 7px 8px; cursor: pointer;
}

.expand-btn { font-size: 10px; color: var(--color-text-muted) }

.playlist-sel-header {
  display: grid; grid-template-columns: 20px auto auto 1fr;
  align-items: center; gap: 6px; padding: 5px 8px; min-height: 32px;
  border-bottom: 1px solid var(--color-border); background: var(--color-surface);
}
.sel-checkbox { width: 14px; height: 14px; accent-color: var(--color-accent); cursor: pointer; flex-shrink: 0; }
.sel-col { font-family: var(--font-mono); font-size: 11px; color: var(--color-text-muted); opacity: 0.7; white-space: nowrap; }
.sel-actions { display: flex; gap: 6px; justify-content: flex-end; grid-column: 4; }

/* Follow toggle in sel-header */
.follow-toggle {
  display: flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; border-radius: 50%; padding: 0;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-muted);
  opacity: 0.45;
  cursor: pointer;
  flex-shrink: 0;
  transition: opacity 0.15s, color 0.15s, border-color 0.15s;
}
.follow-toggle:hover { opacity: 0.8; color: rgba(251,191,36,0.9); }
.follow-toggle--on {
  opacity: 1;
  color: rgba(251,191,36,1.0);
  border-color: rgba(251,191,36,0.5);
  background: rgba(251,191,36,0.08);
}
.sel-action-btn { all: unset; cursor: pointer; font-size: 11px; font-family: var(--font-ui); padding: 3px 9px; border-radius: 6px; white-space: nowrap; transition: background 0.12s; }
.sel-action-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.sel-action-btn--regen { background: var(--color-accent); color: #fff; }
.sel-action-btn--regen:hover:not(:disabled) { background: #e07050; }
.sel-action-btn--delete { background: rgba(248,113,113,0.15); color: var(--color-error); border: 1px solid rgba(248,113,113,0.3); }
.sel-action-btn--delete:hover:not(:disabled) { background: rgba(248,113,113,0.25); }

.group-row__role {
  font-size: 10px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.06em; border: 1px solid; border-radius: 20px;
  padding: 1px 7px; white-space: nowrap; flex-shrink: 0;
}
.group-row__text {
  font-size: 12px; color: var(--color-text-muted);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.group-row__sentences {
  font-size: 10px; font-family: var(--font-mono);
  color: var(--color-text-muted); opacity: 0.5; white-space: nowrap;
}
.group-row__duration {
  font-size: 11px; font-family: var(--font-mono);
  color: var(--color-text-muted); white-space: nowrap;
  min-width: 42px; text-align: right;
}
.group-row__status { display: flex; align-items: center }



/* Status dots */
.status-dot        { font-size: 12px }
.status-dot--ok    { color: var(--color-success) }
.status-dot--warn  { color: var(--color-warning); cursor: help }
.status-dot--err   { color: var(--color-error) }
.status-dot--pending { color: var(--color-text-muted); opacity: 0.4 }
.status-dot--spin  { color: var(--color-accent); animation: spin 1s linear infinite; display: inline-block }

@keyframes spin { to { transform: rotate(360deg) } }

/* Sentence sub-rows */
.sentence-rows {
  border-top: 1px solid var(--color-border);
  padding: 4px 8px 6px 6px;
  display: flex; flex-direction: column; gap: 2px;
}
@keyframes playlist-blink {
  0%, 100% { background: transparent; }
  25%, 75% { background: rgba(251, 191, 36, 0.25); }
}
.group-row--blink    { animation: playlist-blink 0.7s ease 2; }
.sentence-row--blink  { animation: playlist-blink 0.7s ease 2; }
.sentence-row--active {
  background: rgba(251, 191, 36, 0.18) !important;
  border-left: 2px solid rgba(251, 191, 36, 0.8);
  padding-left: 4px;
}
.sentence-row--selected { background: rgba(255,142,110,0.08); }
.sentence-row {
  display: grid; grid-template-columns: 16px 18px 1fr auto auto;
  align-items: center; gap: 5px; padding: 3px 4px; border-radius: 4px;
}
.sentence-row--clickable { cursor: pointer; }
.sentence-row--clickable:hover { background: rgba(255,142,110,0.12); }
.sentence-row--selected { background: rgba(255,142,110,0.08); }
.sel-checkbox--sentence { width: 12px; height: 12px; accent-color: var(--color-accent); cursor: pointer; }
.sentence-row__idx {
  font-size: 10px; font-family: var(--font-mono);
  color: var(--color-text-muted); opacity: 0.5; text-align: right;
}
.sentence-row__text {
  font-size: 11px; color: var(--color-text-muted);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.sentence-row__dur {
  font-size: 10px; font-family: var(--font-mono);
  color: var(--color-text-muted); white-space: nowrap;
}
.sentence-row__status { display: flex; align-items: center; justify-content: center }
.s-dot         { font-size: 10px }
.s-dot--ok     { color: var(--color-success) }
.s-dot--err    { color: var(--color-error) }
.s-dot--pending { color: var(--color-text-muted); opacity: 0.3 }
.s-dot--spin   { color: var(--color-accent); animation: spin 1s linear infinite; display: inline-block }

/* Active (currently playing) group row */
.group-row--playing {
  background: color-mix(in srgb, var(--group-color, var(--color-accent)) 10%, transparent);
  border-color: color-mix(in srgb, var(--group-color, var(--color-accent)) 40%, transparent) !important;
}
.group-row--playing > .group-row__header {
  border-left: 3px solid var(--group-color, var(--color-accent));
  padding-left: 5px;
}

/* Per-group play button */
/* Animated playback bars (shown while group is actively playing) */
.play-bars .bar { transform-origin: bottom }
.play-bars .bar--1 { animation: bar-bounce 0.85s ease-in-out infinite }
.play-bars .bar--2 { animation: bar-bounce 0.85s ease-in-out infinite 0.18s }
.play-bars .bar--3 { animation: bar-bounce 0.85s ease-in-out infinite 0.36s }
@keyframes bar-bounce {
  0%, 100% { transform: scaleY(0.4) }
  50%       { transform: scaleY(1) }
}

/* Transitions */
.expand-enter-active, .expand-leave-active { transition: all 0.18s ease }
.expand-enter-from, .expand-leave-to       { opacity: 0; transform: translateY(-4px) }
.progress-enter-active, .progress-leave-active { transition: all 0.2s ease }
.progress-enter-from, .progress-leave-to       { opacity: 0; height: 0 }
</style>
