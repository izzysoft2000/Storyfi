<template>
  <div class="playlist-pane">

    <!-- Toolbar -->
    <div class="playlist-toolbar">
      <span class="toolbar-label">Playlist</span>
      <div class="toolbar-right">
        <button class="tb-btn" title="Settings" @click="$emit('open-settings')">⚙ Settings</button>
        <button
          class="tb-btn tb-btn--primary"
          :disabled="gen.isGenerating || (!hasTaggedSpans && gen.groups.length === 0)"
          @click="$emit('generate')"
        >{{ gen.isGenerating ? '⟳ Generating…' : '▶ Generate' }}</button>
        <button class="tb-btn" :disabled="!hasReadyAudio" @click="$emit('export')">↓ Export</button>
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
      <div v-else-if="gen.groups.length > 0" class="groups-list">
        <div
          v-for="(group, groupIndex) in gen.groups"
          :key="group.id"
          class="group-row"
          :class="[`group-row--${group.stitchStatus}`, { 'group-row--playing': group.id === activeGroupId }]"
        >
          <!-- Group header -->
          <div class="group-row__header" @click="toggleExpand(group.id)">
            <span class="expand-btn">{{ expanded[group.id] ? '▾' : '▸' }}</span>
            <span class="group-row__role" :style="{ color: group.color, borderColor: group.color }">
              {{ group.roleLabel }}
            </span>
            <span class="group-row__text">{{ truncate(firstSentenceText(group), 44) }}</span>
            <span class="group-row__sentences">{{ (group.sentences ?? []).length }}s</span>
            <span class="group-row__duration">
              {{ group.totalDurationMs != null ? fmt(group.totalDurationMs) : '—' }}
            </span>
            <span class="group-row__status">
              <span v-if="gen.diskDivergences[group.id]" class="status-dot status-dot--warn"
                :title="divergenceLabel(gen.diskDivergences[group.id])">⚠</span>
              <span v-else-if="group.stitchStatus === 'ready'"     class="status-dot status-dot--ok">✓</span>
              <span v-else-if="group.stitchStatus === 'stitching'" class="status-dot status-dot--spin">⟳</span>
              <span v-else-if="group.stitchStatus === 'error'"     class="status-dot status-dot--err">✕</span>
              <span v-else                                          class="status-dot status-dot--pending">○</span>
            </span>
            <!-- Play button — only shown when group has audio -->
            <button
              class="group-row__play"
              :class="{ 'group-row__play--active': group.id === activeGroupId }"
              :disabled="group.stitchStatus !== 'ready'"
              :title="group.id === activeGroupId ? 'Now playing' : 'Play from here'"
              @click.stop="onGroupPlay(group, groupIndex)"
            >
              <!-- Animated bars: this group is active and playing -->
              <svg v-if="group.id === activeGroupId && playback.isPlaying"
                   viewBox="0 0 10 10" fill="currentColor" class="play-bars" aria-hidden="true">
                <rect x="0" y="2" width="2" height="8" rx="1" class="bar bar--1"/>
                <rect x="4" y="0" width="2" height="10" rx="1" class="bar bar--2"/>
                <rect x="8" y="3" width="2" height="7" rx="1" class="bar bar--3"/>
              </svg>
              <!-- Pause icon: this group is active but paused -->
              <svg v-else-if="group.id === activeGroupId && playback.isPaused"
                   viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
                <rect x="1" y="1" width="3" height="8" rx="1"/>
                <rect x="6" y="1" width="3" height="8" rx="1"/>
              </svg>
              <!-- Static play triangle: not active or no audio -->
              <svg v-else viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
                <path d="M2 1.5l7 3.5-7 3.5V1.5z"/>
              </svg>
            </button>
            <button class="group-row__regen" title="Regenerate"
              @click.stop="$emit('regenerate-group', group.id)">🔄</button>
          </div>

          <!-- Sentence sub-rows -->
          <Transition name="expand">
            <div v-if="expanded[group.id]" class="sentence-rows">
              <div
                v-for="s in (group.sentences ?? [])"
                :key="s.id"
                class="sentence-row"
              >
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

    <!-- Audio player — docked at bottom of pane -->
    <AudioPlayerBar v-if="hasReadyAudio || playback.isPlaying || playback.isPaused" :groups="gen.groups" />

  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useGenerationStore } from '@/store/generation.js'
import { usePlaybackStore }   from '@/store/playback.js'
import { formatDuration }     from '@/audio/timestamps.js'
import AudioPlayerBar         from '@/components/AudioPlayerBar.vue'

const props = defineProps({
  hasTaggedSpans: { type: Boolean, default: false },
  taggedSpans:    { type: Array,   default: () => [] },
})

defineEmits(['generate', 'regenerate-group', 'open-settings', 'export'])

const gen      = useGenerationStore()
const playback = usePlaybackStore()
const expanded = ref({})

const hasReadyAudio = computed(() => gen.groups.some(g => g.stitchStatus === 'ready'))

// ID of the group currently under the playhead — drives row highlight + icon
const activeGroupId = computed(() =>
  (playback.isPlaying || playback.isPaused)
    ? playback.groupOffsets[playback.currentGroupIdx]?.groupId ?? null
    : null
)

function toggleExpand(id) {
  expanded.value[id] = !expanded.value[id]
}

function onGroupPlay(group, index) {
  if (group.stitchStatus !== 'ready') return
  // If already loaded (playing or paused), seek directly — avoids re-decoding all buffers
  if (playback.isPlaying || playback.isPaused) {
    playback.seekToGroup(index)
  } else {
    // Cold start: load all stitched blobs and begin from this group
    playback.loadAndPlay(gen.groups, index)
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

.toolbar-label {
  font-size: 10px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.1em; color: var(--color-text-muted);
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
.tb-btn--primary:hover:not(:disabled) { background: #6a4db0 }

/* Progress */
.progress-bar-wrap {
  position: relative; height: 28px;
  background: rgba(124,92,191,0.08);
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
  grid-template-columns: 14px auto 1fr auto auto auto auto auto;
  align-items: center; gap: 6px; padding: 7px 8px; cursor: pointer;
}

.expand-btn { font-size: 10px; color: var(--color-text-muted) }

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

.group-row__regen {
  background: none; border: none; cursor: pointer;
  font-size: 12px; opacity: 0; transition: opacity 0.1s;
  padding: 2px 4px; border-radius: 3px;
}
.group-row__header:hover .group-row__regen { opacity: 0.6 }
.group-row__regen:hover { opacity: 1 !important }

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
  padding: 4px 8px 6px 28px;
  display: flex; flex-direction: column; gap: 2px;
}
.sentence-row {
  display: grid; grid-template-columns: 18px 1fr auto auto;
  align-items: center; gap: 6px; padding: 3px 4px; border-radius: 4px;
}
.sentence-row:hover { background: rgba(255,255,255,0.03) }
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
  background: rgba(124, 92, 191, 0.07);
  border-color: rgba(124, 92, 191, 0.3) !important;
}

/* Per-group play button */
.group-row__play {
  background: none;
  border: 1px solid transparent;
  border-radius: 5px;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 2px 3px;
  display: flex; align-items: center; justify-content: center;
  width: 22px; height: 22px;
  opacity: 0;
  transition: opacity 0.1s, color 0.1s, border-color 0.1s, background 0.1s;
  flex-shrink: 0;
}
.group-row__play svg { width: 10px; height: 10px }
.group-row__header:hover .group-row__play { opacity: 0.55 }
.group-row__play:hover:not(:disabled) {
  opacity: 1 !important;
  color: var(--color-accent);
  border-color: rgba(124, 92, 191, 0.3);
  background: rgba(124, 92, 191, 0.1);
}
.group-row__play--active {
  opacity: 1 !important;
  color: var(--color-accent) !important;
}
.group-row__play:disabled { opacity: 0 !important; cursor: default }

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
