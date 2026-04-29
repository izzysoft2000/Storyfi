<template>
  <div class="audio-player-bar" :class="{ 'player--loading': playback.isLoading }">

    <!-- ── Waveform / progress track + overlaid time labels ────────────── -->
    <div class="waveform-wrap" :class="{ 'waveform-wrap--flat': !playback.waveformData }">
      <canvas
        ref="canvasEl"
        class="waveform-canvas"
        role="slider"
        :aria-valuenow="Math.round(playback.currentMs)"
        :aria-valuemax="Math.round(playback.totalMs)"
        aria-valuemin="0"
        aria-label="Playback position"
        @mousedown="onCanvasMouseDown"
        @touchstart.passive="onCanvasTouch"
      />
      <!-- Time labels overlay on waveform (translucent bg so waveform shows through) -->
      <span class="player-time player-time--current">{{ playback.currentTimeDisplay }}</span>
      <span class="player-time player-time--total">{{ playback.totalTimeDisplay }}</span>
    </div>

    <!-- ── Controls row (stop + play/pause only) ───────────────────────── -->
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
        :disabled="playback.isLoading || (!hasReadyAudio && !playback.isPlaying && !playback.isPaused)"
        @click="onPlayPause"
      >
        <svg v-if="playback.isLoading" class="player-spinner" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="2.5"
                  stroke-dasharray="22 22" stroke-linecap="round"/>
        </svg>
        <svg v-else-if="playback.isPlaying" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <rect x="5"  y="4" width="4" height="12" rx="1.5"/>
          <rect x="11" y="4" width="4" height="12" rx="1.5"/>
        </svg>
        <svg v-else viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M7 4.5l9 5.5-9 5.5V4.5z"/>
        </svg>
      </button>

    </div>

    <!-- ── Error banner ────────────────────────────────────────────────── -->
    <div v-if="playback.loadError" class="player-error" :title="playback.loadError">
      <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm-.75 4.25a.75.75 0 011.5 0v3.5a.75.75 0 01-1.5 0v-3.5zm.75 7a.875.875 0 110-1.75.875.875 0 010 1.75z"/>
      </svg>
      <span>{{ playback.loadError }}</span>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { usePlaybackStore } from '../store/playback.js'

// ─── Props ────────────────────────────────────────────────────────────────────

const props = defineProps({
  groups: { type: Array, required: true },
})

// ─── Store ────────────────────────────────────────────────────────────────────

const playback = usePlaybackStore()

// ─── Refs ─────────────────────────────────────────────────────────────────────

const canvasEl = ref(null)

// ─── Computed ─────────────────────────────────────────────────────────────────

const hasReadyAudio = computed(() =>
  playback.hasAudio || props.groups.some(g => g.stitchStatus === 'ready')
)

// ─── Waveform drawing ─────────────────────────────────────────────────────────

// Accent colour — matches --color-accent. Read once to avoid style recalc per frame.
const ACCENT     = 'var(--color-accent)'
const ACCENT_LIT = '#ffb49a'   // playhead — lighter coral
const UNPLAYED   = 'rgba(255,255,255,0.10)'
const PLAYED     = ACCENT

function drawWaveform() {
  const canvas = canvasEl.value
  if (!canvas) return

  const dpr = window.devicePixelRatio || 1
  const W   = canvas.clientWidth
  const H   = canvas.clientHeight
  if (W === 0 || H === 0) return

  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
    canvas.width  = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
  }

  const ctx      = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, W, H)

  const data     = playback.waveformData
  const progress = playback.progress
  const mid      = H / 2
  const px       = progress * W

  if (!data || data.length === 0) {
    // ── Flat progress track (browser TTS / no amplitude) ──────────────
    const trackH = 3
    const radius = trackH / 2

    // Track background
    ctx.fillStyle = UNPLAYED
    ctx.beginPath()
    ctx.roundRect ? ctx.roundRect(0, mid - radius, W, trackH, radius)
                  : ctx.rect(0, mid - radius, W, trackH)
    ctx.fill()

    // Played fill
    if (px > 0) {
      ctx.fillStyle = PLAYED
      ctx.beginPath()
      ctx.roundRect ? ctx.roundRect(0, mid - radius, px, trackH, radius)
                    : ctx.rect(0, mid - radius, px, trackH)
      ctx.fill()
    }

    // Dot playhead
    const DOT_R = 5
    ctx.fillStyle = ACCENT_LIT
    ctx.beginPath()
    ctx.arc(Math.max(DOT_R, Math.min(W - DOT_R, px)), mid, DOT_R, 0, Math.PI * 2)
    ctx.fill()

    return
  }

  // ── Waveform bars (HD audio) ────────────────────────────────────────
  const bars = data.length
  const barW = W / bars
  const gap  = Math.max(0.5, barW * 0.2)
  const bw   = Math.max(1, barW - gap)

  for (let i = 0; i < bars; i++) {
    const x     = i * barW + gap / 2
    const amp   = data[i]
    const halfH = Math.max(2, amp * mid * 0.88)
    const ratio = i / bars
    const played = ratio < progress

    ctx.fillStyle = played ? PLAYED : UNPLAYED
    ctx.beginPath()
    if (ctx.roundRect) {
      ctx.roundRect(x, mid - halfH, bw, halfH * 2, 1)
    } else {
      ctx.rect(x, mid - halfH, bw, halfH * 2)
    }
    ctx.fill()
  }

  // Dot playhead (instead of line)
  const DOT_R = 5
  ctx.fillStyle = ACCENT_LIT
  // Glow ring
  ctx.beginPath()
  ctx.arc(Math.max(DOT_R, Math.min(W - DOT_R, px)), mid, DOT_R + 3, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255, 180, 154, 0.20)'
  ctx.fill()
  // Dot
  ctx.fillStyle = ACCENT_LIT
  ctx.beginPath()
  ctx.arc(Math.max(DOT_R, Math.min(W - DOT_R, px)), mid, DOT_R, 0, Math.PI * 2)
  ctx.fill()
}

// Redraw on progress tick, waveform data change, or panel resize
watch(() => [playback.progress, playback.waveformVersion], drawWaveform)

let _ro = null
onMounted(() => {
  _ro = new ResizeObserver(drawWaveform)
  if (canvasEl.value) _ro.observe(canvasEl.value.parentElement)
  drawWaveform()
})
onUnmounted(() => _ro?.disconnect())

// ─── Placeholder heights (sine wave pattern before data loads) ────────────────

function placeholderH(i) {
  const h = 4 + Math.abs(Math.sin(i * 0.45) * 14)
  return `${Math.round(h)}px`
}

// ─── Transport ────────────────────────────────────────────────────────────────

function onPlayPause() {
  if (playback.isLoading) return
  if (playback.isPaused)       playback.resume()
  else if (playback.isPlaying) playback.pause()
  else                         playback.loadAndPlay(props.groups, 0)
}

function onStop() { playback.stop() }

// ─── Scrubbing ────────────────────────────────────────────────────────────────

function msFromX(clientX) {
  const canvas = canvasEl.value
  if (!canvas || !playback.totalMs) return null
  const rect  = canvas.getBoundingClientRect()
  const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  return ratio * playback.totalMs
}

function scrubTo(ms) {
  if (!hasReadyAudio.value) return
  if (playback.isPlaying || playback.isPaused) {
    // Already loaded — seek directly
    playback.seekToMs(ms)
  } else {
    // Cold start — find which group this ms position falls in and load from there
    let elapsed  = 0
    let startIdx = 0
    for (let i = 0; i < props.groups.length; i++) {
      const dur = props.groups[i].totalDurationMs ?? 0
      if (elapsed + dur > ms) { startIdx = i; break }
      elapsed  += dur
      startIdx  = i
    }
    playback.loadAndPlay(props.groups, startIdx)
  }
}

function onCanvasMouseDown(e) {
  if (e.button !== 0) return
  const ms = msFromX(e.clientX)
  if (ms != null) scrubTo(ms)

  function onMove(mv) {
    const m = msFromX(mv.clientX)
    if (m != null) scrubTo(m)
  }
  function onUp() {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

function onCanvasTouch(e) {
  const ms = msFromX(e.touches[0]?.clientX)
  if (ms != null) scrubTo(ms)
}
</script>

<style scoped>
/* ── Shell ──────────────────────────────────────────────────────────────────── */
.audio-player-bar {
  flex-shrink: 0;
  background: var(--color-surface-raised, #2a222a);
  border-top: 1px solid var(--color-border, rgba(255 255 255 / 0.08));
  padding: 10px 14px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  user-select: none;
}

/* ── Waveform ───────────────────────────────────────────────────────────────── */
.waveform-wrap {
  position: relative;
  height: 48px;
  cursor: pointer;
}
.waveform-wrap--flat {
  height: 28px;
}

.waveform-canvas {
  display: block;
  width: 100%;
  height: 100%;
}

/* Time labels overlaid on waveform/track with translucent bg */
.player-time--current,
.player-time--total {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  font-family: var(--font-mono);
  color: var(--color-text);
  background: rgba(26, 20, 24, 0.60);
  padding: 1px 5px;
  border-radius: 4px;
  pointer-events: none;
  white-space: nowrap;
  backdrop-filter: blur(2px);
}
.player-time--current { left: 8px; }
.player-time--total   { right: 8px; }

/* ── Controls row ───────────────────────────────────────────────────────────── */
.player-controls-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* player-time styles moved to waveform overlay */

/* ── Buttons ────────────────────────────────────────────────────────────────── */
.player-btn {
  display: flex; align-items: center; justify-content: center;
  background: none;
  border: 1px solid var(--color-border, rgba(255 255 255 / 0.12));
  border-radius: 8px;
  color: var(--color-text-muted, rgba(255 255 255 / 0.55));
  cursor: pointer;
  padding: 0;
  width: 32px; height: 32px;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  flex-shrink: 0;
}
.player-btn svg { width: 16px; height: 16px }
.player-btn:hover:not(:disabled) {
  background: var(--color-surface-hover, rgba(255 255 255 / 0.06));
  color: var(--color-text, rgba(255 255 255 / 0.9));
  border-color: var(--color-border-hover, rgba(255 255 255 / 0.2));
}
.player-btn:disabled { opacity: 0.3; cursor: not-allowed }

.player-btn--primary {
  width: 36px; height: 36px;
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
  background: var(--color-surface-raised, #2a222a);
  border-color: var(--color-border, rgba(255 255 255 / 0.08));
  color: var(--color-text-muted, rgba(255 255 255 / 0.25));
}

/* follow toggle moved to PlaylistPane sel-header */

/* ── Spinner ────────────────────────────────────────────────────────────────── */
.player-spinner { animation: player-spin 0.8s linear infinite }
@keyframes player-spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }

/* ── Error ──────────────────────────────────────────────────────────────────── */
.player-error {
  display: flex; align-items: center; gap: 6px;
  font-size: 11px;
  color: var(--color-danger, #f87171);
  overflow: hidden;
}
.player-error svg { width: 14px; height: 14px; flex-shrink: 0 }
.player-error span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
</style>
