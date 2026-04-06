<template>
  <!--
    AudioPlayerBar.vue
    Fixed bar docked at the bottom of PlaylistPane.
    Receives the groups array so it can call loadAndPlay() directly.
  -->
  <div class="audio-player-bar" :class="{ 'player--loading': playback.isLoading }">

    <!-- ── Progress row ──────────────────────────────────────────────── -->
    <div class="player-progress-row">
      <span class="player-time player-time--current">
        {{ playback.currentTimeDisplay }}
      </span>

      <div
        class="player-track"
        ref="trackEl"
        @mousedown="onTrackMouseDown"
        @touchstart.passive="onTrackTouch"
        role="slider"
        :aria-valuenow="Math.round(playback.currentMs)"
        :aria-valuemax="Math.round(playback.totalMs)"
        aria-valuemin="0"
        aria-label="Playback position"
      >
        <div class="player-track__fill" :style="{ width: fillPct }"></div>
        <div class="player-track__thumb" :style="{ left: fillPct }"></div>
      </div>

      <span class="player-time player-time--total">
        {{ playback.totalTimeDisplay }}
      </span>
    </div>

    <!-- ── Controls row ─────────────────────────────────────────────── -->
    <div class="player-controls-row">

      <!-- Stop -->
      <button
        class="player-btn"
        title="Stop"
        :disabled="!playback.isPlaying && !playback.isPaused"
        @click="onStop"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <rect x="4" y="4" width="12" height="12" rx="2"/>
        </svg>
      </button>

      <!-- Play / Pause -->
      <button
        class="player-btn player-btn--primary"
        :title="playback.isPlaying ? 'Pause' : 'Play all'"
        :disabled="playback.isLoading || (!playback.hasAudio && !playback.isPlaying && !playback.isPaused)"
        @click="onPlayPause"
      >
        <!-- Loading spinner -->
        <svg
          v-if="playback.isLoading"
          class="player-spinner"
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
        >
          <circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="2.5"
                  stroke-dasharray="22 22" stroke-linecap="round"/>
        </svg>

        <!-- Pause bars -->
        <svg
          v-else-if="playback.isPlaying"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <rect x="5"  y="4" width="4" height="12" rx="1.5"/>
          <rect x="11" y="4" width="4" height="12" rx="1.5"/>
        </svg>

        <!-- Play triangle -->
        <svg
          v-else
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M7 4.5l9 5.5-9 5.5V4.5z"/>
        </svg>
      </button>

    </div>

    <!-- ── Error banner ──────────────────────────────────────────────── -->
    <div v-if="playback.loadError" class="player-error" :title="playback.loadError">
      <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm-.75 4.25a.75.75 0 011.5 0v3.5a.75.75 0 01-1.5 0v-3.5zm.75 7a.875.875 0 110-1.75.875.875 0 010 1.75z"/>
      </svg>
      <span>{{ playback.loadError }}</span>
    </div>

  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { usePlaybackStore } from '../store/playback.js'

// ─── Props ────────────────────────────────────────────────────────────────────

const props = defineProps({
  /**
   * The project's paragraphGroups array.
   * Passed here so Play triggers loadAndPlay() with fresh data.
   */
  groups: {
    type: Array,
    required: true,
  },
})

// ─── Store ────────────────────────────────────────────────────────────────────

const playback = usePlaybackStore()

// ─── Template refs ────────────────────────────────────────────────────────────

const trackEl = ref(null)

// ─── Computed ─────────────────────────────────────────────────────────────────

const fillPct = computed(() => `${(playback.progress * 100).toFixed(2)}%`)

// ─── Handlers ─────────────────────────────────────────────────────────────────

function onPlayPause() {
  if (playback.isLoading) return

  if (playback.isPaused) {
    playback.resume()
  } else if (playback.isPlaying) {
    playback.pause()
  } else {
    // Stopped — start fresh from group 0
    playback.loadAndPlay(props.groups, 0)
  }
}

function onStop() {
  playback.stop()
}

// ── Progress scrubbing ────────────────────────────────────────────────────────

function msFromPointerX(clientX) {
  if (!trackEl.value || !playback.totalMs) return null
  const rect = trackEl.value.getBoundingClientRect()
  const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  return ratio * playback.totalMs
}

function onTrackMouseDown(e) {
  if (e.button !== 0) return
  const ms = msFromPointerX(e.clientX)
  if (ms != null) scrubTo(ms)

  // Allow drag-scrubbing
  function onMove(mv) {
    const m = msFromPointerX(mv.clientX)
    if (m != null) scrubTo(m)
  }
  function onUp() {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

function onTrackTouch(e) {
  const touch = e.touches[0]
  if (!touch) return
  const ms = msFromPointerX(touch.clientX)
  if (ms != null) scrubTo(ms)
}

/**
 * Seek to an absolute ms position in the master timeline.
 * If not yet loaded (no audio context or buffers), do nothing.
 */
function scrubTo(ms) {
  if (!playback.hasAudio) return

  if (playback.isPlaying || playback.isPaused) {
    playback.seekToMs(ms)
  } else {
    // Just reposition the display
    playback.currentMs = ms
  }
}
</script>

<style scoped>
/* ── Shell ──────────────────────────────────────────────────────────────────── */

.audio-player-bar {
  flex-shrink: 0;
  background: var(--color-surface-raised, #1e1a2e);
  border-top: 1px solid var(--color-border, rgba(255 255 255 / 0.08));
  padding: 10px 14px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  user-select: none;
}

/* ── Progress row ───────────────────────────────────────────────────────────── */

.player-progress-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.player-time {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-muted, rgba(255 255 255 / 0.45));
  white-space: nowrap;
  min-width: 34px;
}
.player-time--total {
  text-align: right;
}

.player-track {
  flex: 1;
  height: 20px; /* taller hit area */
  display: flex;
  align-items: center;
  position: relative;
  cursor: pointer;
}

.player-track::before {
  /* Visible rail */
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  height: 3px;
  background: var(--color-border, rgba(255 255 255 / 0.12));
  border-radius: 2px;
}

.player-track__fill {
  position: absolute;
  left: 0;
  height: 3px;
  background: var(--color-accent, #8b5cf6);
  border-radius: 2px;
  transition: width 0.05s linear;
  pointer-events: none;
}

.player-track__thumb {
  position: absolute;
  width: 11px;
  height: 11px;
  background: var(--color-accent, #8b5cf6);
  border-radius: 50%;
  transform: translateX(-50%);
  transition: left 0.05s linear, opacity 0.15s;
  pointer-events: none;
  opacity: 0;
  box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.25);
}

.player-track:hover .player-track__thumb {
  opacity: 1;
}

/* ── Controls row ───────────────────────────────────────────────────────────── */

.player-controls-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.player-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: 1px solid var(--color-border, rgba(255 255 255 / 0.12));
  border-radius: 8px;
  color: var(--color-text-muted, rgba(255 255 255 / 0.55));
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.player-btn svg {
  width: 16px;
  height: 16px;
}
.player-btn:hover:not(:disabled) {
  background: var(--color-surface-hover, rgba(255 255 255 / 0.06));
  color: var(--color-text, rgba(255 255 255 / 0.9));
  border-color: var(--color-border-hover, rgba(255 255 255 / 0.2));
}
.player-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.player-btn--primary {
  width: 38px;
  height: 38px;
  background: var(--color-accent, #8b5cf6);
  border-color: transparent;
  color: #fff;
  border-radius: 50%;
}
.player-btn--primary:hover:not(:disabled) {
  background: var(--color-accent-hover, #7c3aed);
  border-color: transparent;
  color: #fff;
}
.player-btn--primary:disabled {
  background: var(--color-surface-raised, #1e1a2e);
  border-color: var(--color-border, rgba(255 255 255 / 0.08));
  color: var(--color-text-muted, rgba(255 255 255 / 0.25));
}

/* ── Loading spinner ────────────────────────────────────────────────────────── */

.player-spinner {
  animation: player-spin 0.8s linear infinite;
}
@keyframes player-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

/* ── Error banner ───────────────────────────────────────────────────────────── */

.player-error {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--color-danger, #f87171);
  overflow: hidden;
}
.player-error svg {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}
.player-error span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
