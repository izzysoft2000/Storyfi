<template>
  <div class="audio-player-bar" :class="{ 'player--loading': playback.isLoading }">

    <!-- ── Waveform canvas (replaces thin progress track) ──────────────── -->
    <div class="waveform-wrap">
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
      <!-- Placeholder bars shown before waveform is decoded -->
      <div v-if="!playback.waveformData" class="waveform-placeholder">
        <div
          v-for="i in 40" :key="i"
          class="waveform-placeholder__bar"
          :style="{ height: placeholderH(i) }"
        />
      </div>
    </div>

    <!-- ── Time + controls row ─────────────────────────────────────────── -->
    <div class="player-controls-row">

      <span class="player-time">{{ playback.currentTimeDisplay }}</span>

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

      <!-- Follow mode toggle — tracks active sentence in playlist -->
      <button
        class="player-btn player-btn--follow"
        :class="{ 'player-btn--follow-on': playback.followMode }"
        :title="playback.followMode ? 'Following playlist (click to disable)' : 'Follow playlist'"
        @click="playback.followMode = !playback.followMode"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M3 4a1 1 0 000 2h14a1 1 0 100-2H3zm0 5a1 1 0 000 2h8a1 1 0 100-2H3zm0 5a1 1 0 000 2h5a1 1 0 100-2H3z"/>
          <circle cx="16" cy="14" r="3" class="follow-dot"/>
        </svg>
      </button>

      <span class="player-time player-time--right">{{ playback.totalTimeDisplay }}</span>

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

  const dpr    = window.devicePixelRatio || 1
  const W      = canvas.clientWidth
  const H      = canvas.clientHeight
  if (W === 0 || H === 0) return

  // Resize backing store if needed
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
    canvas.width  = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
  }

  const ctx  = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)   // reset + scale in one call — prevents scale accumulation on repeated redraws
  ctx.clearRect(0, 0, W, H)

  const data     = playback.waveformData   // Float32Array | null getter
  const progress = playback.progress       // 0..1
  const bars     = data ? data.length : 0
  const mid      = H / 2

  if (!data || bars === 0) return

  const barW  = W / bars
  const gap   = Math.max(0.5, barW * 0.2)
  const bw    = Math.max(1, barW - gap)

  for (let i = 0; i < bars; i++) {
    const x      = i * barW + gap / 2
    const amp    = data[i]
    const halfH  = Math.max(2, amp * mid * 0.92)
    const ratio  = i / bars
    const played = ratio < progress
    const isHead = Math.abs(ratio - progress) < 1.5 / bars

    ctx.fillStyle = isHead ? ACCENT_LIT : played ? PLAYED : UNPLAYED
    ctx.beginPath()
    if (ctx.roundRect) {
      ctx.roundRect(x, mid - halfH, bw, halfH * 2, 1)
    } else {
      ctx.rect(x, mid - halfH, bw, halfH * 2)
    }
    ctx.fill()
  }

  // Playhead line
  const px = progress * W
  ctx.strokeStyle = ACCENT_LIT
  ctx.lineWidth   = 1.5
  ctx.beginPath()
  ctx.moveTo(px, 3)
  ctx.lineTo(px, H - 3)
  ctx.stroke()
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
  height: 52px;
  cursor: pointer;
}

.waveform-canvas {
  display: block;
  width: 100%;
  height: 100%;
}

/* Placeholder shown before audio is decoded */
.waveform-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 1px;
  pointer-events: none;
}

.waveform-placeholder__bar {
  flex: 1;
  background: var(--color-border, rgba(255 255 255 / 0.1));
  border-radius: 1px;
  min-height: 3px;
  opacity: 0.5;
}

/* ── Controls row ───────────────────────────────────────────────────────────── */
.player-controls-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.player-time {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-muted, rgba(255 255 255 / 0.45));
  white-space: nowrap;
  min-width: 40px;
  font-family: var(--font-mono);
}

.player-time--right {
  text-align: right;
  margin-left: auto;
}

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

.player-btn--follow {
  width: 28px; height: 28px; padding: 0;
  color: var(--color-text-muted);
  opacity: 0.35;
}
.player-btn--follow:hover { opacity: 0.7; color: rgba(251, 191, 36, 0.8); }
.player-btn--follow svg { width: 14px; height: 14px; }
.player-btn--follow-on {
  opacity: 1 !important;
  color: rgba(251, 191, 36, 1.0);
}
.player-btn--follow-on .follow-dot { fill: rgba(251, 191, 36, 1.0); }
.follow-dot { fill: currentColor; }

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
