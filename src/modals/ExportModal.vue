<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="isOpen" class="modal-backdrop" @mousedown.self="close">
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="export-title">

          <!-- Header -->
          <div class="modal-header">
            <h2 id="export-title" class="modal-title">Export Project</h2>
            <button class="close-btn" title="Close" @click="close">✕</button>
          </div>

          <!-- Summary -->
          <div class="export-summary">
            <span class="summary-title">{{ store.projectTitle }}</span>
            <span class="summary-meta">
              {{ readyCount }} segment{{ readyCount !== 1 ? 's' : '' }} ready
              · {{ fmt(totalDurationMs) }}
            </span>
          </div>

          <!-- Nothing to export -->
          <div v-if="readyCount === 0" class="no-audio">
            <span class="no-audio__icon">♪</span>
            <p>No generated audio yet.</p>
            <p class="no-audio__sub">Generate audio first, then export.</p>
          </div>

          <!-- Format cards -->
          <div v-else class="format-grid">

            <!-- ZIP (primary) -->
            <div class="format-card format-card--primary">
              <div class="format-card__icon">⬇</div>
              <div class="format-card__body">
                <div class="format-card__name">Full Export — ZIP</div>
                <div class="format-card__desc">
                  All MP3s + playlist.json + script.html + timings.csv in one archive
                </div>
              </div>
              <button
                class="format-btn format-btn--primary"
                :disabled="isBusy"
                @click="doZip"
              >
                <span v-if="!isBusy">Download ZIP</span>
                <span v-else class="btn-progress">
                  <svg class="spinner" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="2"
                            stroke-dasharray="17 17" stroke-linecap="round"/>
                  </svg>
                  {{ progressLabel }}
                </span>
              </button>
            </div>

            <!-- Progress bar (shown while zipping) -->
            <Transition name="progress">
              <div v-if="isBusy" class="zip-progress">
                <div class="zip-progress__bar" :style="{ width: `${progressPct}%` }" />
              </div>
            </Transition>

            <!-- Individual formats -->
            <div class="format-row">
              <button class="format-btn format-btn--small" :disabled="isBusy" @click="doJSON">
                <span class="format-btn__icon">{ }</span> playlist.json
              </button>
              <button class="format-btn format-btn--small" :disabled="isBusy" @click="doHTML">
                <span class="format-btn__icon">&lt;/&gt;</span> script.html
              </button>
              <button class="format-btn format-btn--small" :disabled="isBusy" @click="doCSV">
                <span class="format-btn__icon">⊞</span> timings.csv
              </button>
            </div>

          </div>

          <!-- Error -->
          <div v-if="exportError" class="export-error">
            ⚠ {{ exportError }}
          </div>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useProjectStore } from '@/store/project.js'
import { useGenerationStore } from '@/store/generation.js'
import { formatDuration } from '@/audio/timestamps.js'
import { exportZip, exportJSON, exportHTML, exportCSV } from '@/export/exporter.js'

const store = useProjectStore()
const gen   = useGenerationStore()

const isOpen      = ref(false)
const isBusy      = ref(false)
const progress    = ref(0)
const exportError = ref(null)

const readyGroups = computed(() => gen.groups.filter(g => g.stitchStatus === 'ready'))
const readyCount  = computed(() => readyGroups.value.length)

const totalDurationMs = computed(() =>
  readyGroups.value.reduce((sum, g) => sum + (g.totalDurationMs ?? 0), 0)
)

const progressPct = computed(() => Math.round(progress.value * 100))
const progressLabel = computed(() => 
  progressPct.value < 97 ? `${progressPct.value}%` : 'Compressing…'
)

// Helper used in template
const fmt = (ms) => formatDuration(ms)

function open() {
  exportError.value = null
  progress.value = 0
  isBusy.value = false
  isOpen.value = true
}

function close() {
  if (isBusy.value) return
  isOpen.value = false
}

async function doZip() {
  exportError.value = null
  isBusy.value = true
  progress.value = 0
  try {
    await exportZip(store.project, readyGroups.value, p => { progress.value = p })
    await new Promise(r => setTimeout(r, 600)) // let user see 100%
    close()
  } catch (err) {
    exportError.value = err?.message ?? 'Export failed'
  } finally {
    isBusy.value = false
  }
}

function doJSON() {
  exportError.value = null
  try { exportJSON(store.project, readyGroups.value) }
  catch (err) { exportError.value = err?.message ?? 'Export failed' }
}

function doHTML() {
  exportError.value = null
  try { exportHTML(store.project, readyGroups.value) }
  catch (err) { exportError.value = err?.message ?? 'Export failed' }
}

function doCSV() {
  exportError.value = null
  try { exportCSV(readyGroups.value) }
  catch (err) { exportError.value = err?.message ?? 'Export failed' }
}

defineExpose({ open })
</script>

<style scoped>
/* ── Backdrop ───────────────────────────────────────────────────────────────── */
.modal-backdrop {
  position: fixed; inset: 0; z-index: 200;
  background: rgba(0, 0, 0, 0.6);
  display: flex; align-items: center; justify-content: center;
  padding: 20px;
  backdrop-filter: blur(4px);
}

/* ── Modal shell ────────────────────────────────────────────────────────────── */
.modal {
  background: var(--color-surface, #1a1625);
  border: 1px solid var(--color-border, rgba(255,255,255,0.08));
  border-radius: 14px;
  box-shadow: 0 24px 64px rgba(0,0,0,0.6);
  width: 100%;
  max-width: 460px;
  overflow: hidden;
}

/* ── Header ─────────────────────────────────────────────────────────────────── */
.modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 18px 20px 14px;
  border-bottom: 1px solid var(--color-border, rgba(255,255,255,0.08));
}

.modal-title {
  font-family: var(--font-display); font-size: 16px; font-weight: 600;
  color: var(--color-text); margin: 0;
}

.close-btn {
  background: none; border: none; color: var(--color-text-muted);
  font-size: 14px; cursor: pointer; padding: 4px 6px; border-radius: 4px;
  line-height: 1; transition: color 0.12s, background 0.12s;
}
.close-btn:hover { color: var(--color-text); background: var(--color-border) }

/* ── Summary bar ────────────────────────────────────────────────────────────── */
.export-summary {
  display: flex; align-items: baseline; justify-content: space-between;
  padding: 12px 20px 0;
  gap: 8px;
}

.summary-title {
  font-size: 13px; font-weight: 600; color: var(--color-text);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.summary-meta {
  font-size: 11px; color: var(--color-text-muted);
  font-variant-numeric: tabular-nums; white-space: nowrap; flex-shrink: 0;
}

/* ── No audio state ─────────────────────────────────────────────────────────── */
.no-audio {
  display: flex; flex-direction: column; align-items: center;
  text-align: center; gap: 6px; padding: 40px 20px;
  color: var(--color-text-muted);
}
.no-audio__icon { font-size: 28px; opacity: 0.2 }
.no-audio p     { font-size: 13px }
.no-audio__sub  { font-size: 11px; opacity: 0.6 }

/* ── Format cards ───────────────────────────────────────────────────────────── */
.format-grid {
  display: flex; flex-direction: column; gap: 0;
  padding: 16px 20px 20px;
}

/* Primary ZIP card */
.format-card {
  display: flex; align-items: center; gap: 14px;
  padding: 14px 16px; border-radius: 10px;
  background: rgba(139, 92, 246, 0.08);
  border: 1px solid rgba(139, 92, 246, 0.22);
  margin-bottom: 8px;
}

.format-card__icon {
  font-size: 22px; opacity: 0.8; flex-shrink: 0;
  width: 32px; text-align: center;
}

.format-card__body { flex: 1; min-width: 0 }

.format-card__name {
  font-size: 13px; font-weight: 600; color: var(--color-text); margin-bottom: 2px;
}

.format-card__desc {
  font-size: 11px; color: var(--color-text-muted); line-height: 1.45;
}

/* Progress bar under ZIP card */
.zip-progress {
  height: 3px; background: var(--color-border, rgba(255,255,255,0.08));
  border-radius: 2px; margin: -4px 0 10px; overflow: hidden;
}

.zip-progress__bar {
  height: 100%;
  background: linear-gradient(90deg, var(--color-accent, #8b5cf6), #a78bfa);
  border-radius: 2px;
  transition: width 0.25s ease;
}

/* Individual format row */
.format-row {
  display: flex; gap: 8px; flex-wrap: wrap;
  padding-top: 4px;
}

/* ── Buttons ────────────────────────────────────────────────────────────────── */
.format-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  border-radius: 7px; border: 1px solid var(--color-border, rgba(255,255,255,0.12));
  background: none; color: var(--color-text-muted);
  font-size: 12px; font-family: var(--font-ui);
  cursor: pointer; white-space: nowrap;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}
.format-btn:disabled { opacity: 0.35; cursor: not-allowed }

.format-btn--primary {
  padding: 8px 16px; font-size: 13px; font-weight: 500;
  background: var(--color-accent, #8b5cf6); border-color: transparent;
  color: #fff; border-radius: 8px; flex-shrink: 0;
}
.format-btn--primary:hover:not(:disabled) {
  background: var(--color-accent-hover, #7c3aed);
}

.format-btn--small {
  padding: 7px 12px; flex: 1; min-width: 0;
}
.format-btn--small:hover:not(:disabled) {
  color: var(--color-text);
  border-color: var(--color-border-hover, rgba(255,255,255,0.2));
  background: var(--color-surface-hover, rgba(255,255,255,0.04));
}

.format-btn__icon {
  font-size: 11px; opacity: 0.55; font-family: var(--font-mono);
}

/* Progress spinner inside primary button */
.btn-progress {
  display: inline-flex; align-items: center; gap: 7px;
}

.spinner {
  width: 14px; height: 14px; flex-shrink: 0;
  animation: spin 0.75s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg) } }

/* ── Error ──────────────────────────────────────────────────────────────────── */
.export-error {
  margin: 0 20px 16px;
  padding: 10px 14px; border-radius: 7px;
  background: rgba(248, 113, 113, 0.08);
  border: 1px solid rgba(248, 113, 113, 0.25);
  font-size: 12px; color: var(--color-error, #f87171);
}

/* ── Transitions ────────────────────────────────────────────────────────────── */
.modal-enter-active, .modal-leave-active { transition: opacity 0.18s, transform 0.18s }
.modal-enter-from, .modal-leave-to       { opacity: 0; transform: scale(0.97) translateY(6px) }

.progress-enter-active, .progress-leave-active { transition: all 0.2s }
.progress-enter-from, .progress-leave-to       { opacity: 0; transform: scaleY(0) }
</style>
