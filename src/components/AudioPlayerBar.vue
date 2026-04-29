<template>
  <div class="audio-player-bar" :class="{ 'player--loading': playback.isLoading }">

    <!-- ── Main row: play button + waveform/progress ────────────────────── -->
    <div class="player-main-row">

      <!-- Play / Pause circle button -->
      <button
        class="player-play-btn"
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

      <!-- Waveform / progress track + overlaid time labels -->
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
        <!-- Time labels overlay -->
        <span class="player-time player-time--current">{{ playback.currentTimeDisplay }}</span>
        <span class="player-time player-time--total">{{ playback.totalTimeDisplay }}</span>
      </div>

    </div>

    <!-- ── Error banner ──────────────────────────────────────────────────── -->
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
  const baseline = H - 2   // 2px from bottom
  const px       = progress * W
  const DOT_R    = 5

  if (!data || data.length === 0) {
    // ── Flat progress track (browser TTS) ─────────────────────────────
    const trackH = 3

    // Track bg
    ctx.fillStyle = UNPLAYED
    ctx.beginPath()
    ctx.roundRect ? ctx.roundRect(0, baseline - trackH, W, trackH, 1.5)
                  : ctx.rect(0, baseline - trackH, W, trackH)
    ctx.fill()

    // Played portion
    if (px > 0) {
      ctx.fillStyle = PLAYED
      ctx.beginPath()
      ctx.roundRect ? ctx.roundRect(0, baseline - trackH, px, trackH, 1.5)
                    : ctx.rect(0, baseline - trackH, px, trackH)
      ctx.fill()
    }

    // Dot on baseline
    ctx.fillStyle = ACCENT_LIT
    ctx.beginPath()
    ctx.arc(Math.max(DOT_R, Math.min(W - DOT_R, px)), baseline - trackH / 2, DOT_R, 0, Math.PI * 2)
    ctx.fill()

    return
  }

  // ── Waveform bars growing from baseline upward (positive only) ────────
  const bars   = data.length
  const barW   = W / bars
  const gap    = Math.max(0.5, barW * 0.2)
  const bw     = Math.max(1, barW - gap)
  const maxH   = baseline - 4   // leave 4px headroom at top

  for (let i = 0; i < bars; i++) {
    const x      = i * barW + gap / 2
    const amp    = data[i]
    const barH   = Math.max(2, amp * maxH)
    const ratio  = i / bars
    const played = ratio < progress

    ctx.fillStyle = played ? PLAYED : UNPLAYED
    ctx.beginPath()
    if (ctx.roundRect) {
      ctx.roundRect(x, baseline - barH, bw, barH, 1)
    } else {
      ctx.rect(x, baseline - barH, bw, barH)
    }
    ctx.fill()
  }

  // Baseline rule
  ctx.fillStyle = 'rgba(255,255,255,0.08)'
  ctx.fillRect(0, baseline, W, 1)

  // Dot playhead on baseline — glow ring + dot
  const dotX = Math.max(DOT_R, Math.min(W - DOT_R, px))
  ctx.fillStyle = 'rgba(255,180,154,0.20)'
  ctx.beginPath()
  ctx.arc(dotX, baseline, DOT_R + 3, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = ACCENT_LIT
  ctx.beginPath()
  ctx.arc(dotX, baseline, DOT_R, 0, Math.PI * 2)
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
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  user-select: none;
}

/* ── Main row: play button + waveform side by side ──────────────────────────── */
.player-main-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* ── Large circle play button ───────────────────────────────────────────────── */
.player-play-btn {
  width: 36px; height: 36px;
  border-radius: 50%;
  border: none;
  background: var(--color-accent);
  color: var(--color-on-accent, #1a1418);
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  transition: opacity 0.15s, transform 0.12s;
  box-shadow: 0 2px 10px rgba(255,142,110,0.35);
}
.player-play-btn svg { width: 16px; height: 16px; }
.player-play-btn:hover:not(:disabled) { opacity: 0.88; transform: scale(1.06); }
.player-play-btn:disabled { opacity: 0.3; cursor: not-allowed; box-shadow: none; }

/* ── Waveform ───────────────────────────────────────────────────────────────── */
.waveform-wrap {
  position: relative;
  flex: 1;
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
.player-time--current { left: 8px; top: 4px; transform: none; }
.player-time--total   { right: 8px; top: 4px; transform: none; }

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
