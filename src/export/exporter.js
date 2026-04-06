/**
 * src/export/exporter.js
 * Production-ready export engine for Storyfi Phase 5.
 * Pure functions — no Vue/Pinia dependency.
 *
 * Requires: npm install jszip
 */

import JSZip from 'jszip'
import { getAudioStitched } from '@/store/db.js'

// ─── Filename helpers ────────────────────────────────────────────────────────

/**
 * Deterministic, filesystem-safe MP3 filename.
 * Format: 02_rolelabel_shortid.mp3
 */
function buildFilename(group) {
  const order = String(group.order ?? 1).padStart(2, '0')
  const label = String(group.roleLabel ?? 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24)
  const shortId = String(group.id ?? '').slice(0, 8)
  return `${order}_${label}_${shortId}.mp3`
}

/**
 * Safe slug for ZIP filename.
 */
function projectSlug(title) {
  return String(title ?? 'storyfi')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'storyfi'
}

// ─── Download helper ────────────────────────────────────────────────────────

function triggerDownload(content, filename, mimeType = 'application/octet-stream') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

// ─── Escape & CSV helpers ───────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function csvCell(val) {
  const s = String(val ?? '')
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

function formatMs(ms) {
  if (ms == null || ms < 0) return '—'
  const totalSec = ms / 1000
  const m = Math.floor(totalSec / 60)
  const s = Math.floor(totalSec % 60)
  const ds = Math.floor((totalSec % 1) * 10)
  return `${m}:${String(s).padStart(2, '0')}.${ds}`
}

// ─── Build JSON manifest ────────────────────────────────────────────────────

export function buildJSON(project, groups) {
  return {
    title: project.title ?? 'Untitled',
    exportedAt: new Date().toISOString(),
    totalDurationMs: groups.reduce((sum, g) => sum + (g.totalDurationMs ?? 0), 0),
    groups: groups.map(g => ({
      order: g.order,
      roleLabel: g.roleLabel,
      color: g.color,
      file: buildFilename(g),
      totalDurationMs: g.totalDurationMs ?? 0,
      startMs: g.startMs ?? 0,
      endMs: g.endMs ?? 0,
      sentences: (g.sentences ?? []).map(s => ({
        index: s.sentenceIndex,
        text: s.text,
        startMs: s.startMs ?? 0,
        endMs: s.endMs ?? 0,
        durationMs: s.durationMs ?? 0,
        wordTimings: s.wordTimings ?? null,
      })),
    })),
  }
}

export function exportJSON(project, groups) {
  const ready = groups.filter(g => g.stitchStatus === 'ready')
  const json = JSON.stringify(buildJSON(project, ready), null, 2)
  triggerDownload(json, 'playlist.json', 'application/json')
}

// ─── Build HTML annotated script ────────────────────────────────────────────

export function buildHTML(project, groups, { standalone = false } = {}) {
  const title = escapeHtml(project.title ?? 'Untitled')
  const exportedAt = new Date().toLocaleString()

  const groupsHtml = groups.map(g => {
    const filename = buildFilename(g)
    const badgeStyle = `background:${escapeHtml(g.color)}22;border:1px solid ${escapeHtml(g.color)};color:${escapeHtml(g.color)}`
    const duration = g.totalDurationMs != null ? formatMs(g.totalDurationMs) : ''
    const audioTag = standalone ? '' : `
      <audio controls preload="none" style="width:100%;margin-top:8px;height:32px">
        <source src="./${escapeHtml(filename)}" type="audio/mpeg">
      </audio>`

    const sentences = (g.sentences ?? [])
      .map(s => `<span class="sentence">${escapeHtml(s.text)}</span>`)
      .join(' ')

    return `
  <section class="group">
    <div class="group-header">
      <span class="badge" style="${badgeStyle}">${escapeHtml(g.roleLabel)}</span>
      ${duration ? `<span class="duration">${escapeHtml(duration)}</span>` : ''}
    </div>
    <p class="group-text">${sentences}</p>${audioTag}
  </section>`
  }).join('\n')

  const standaloneNote = standalone ? `
  <div class="note">
    ℹ Audio files are not included in this standalone HTML export.
    Download the full ZIP to get the MP3s alongside this script.
  </div>` : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — Storyfi Export</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0 }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0e0c18; color: #e2dff0; line-height: 1.7; padding: 40px 24px; max-width: 800px; margin: 0 auto; }
    h1 { font-size: 26px; font-weight: 700; margin-bottom: 4px; color: #fff }
    .meta { font-size: 12px; color: #6b6880; margin-bottom: 32px }
    .note { background: rgba(139,92,246,0.12); border: 1px solid rgba(139,92,246,0.3); border-radius: 8px; padding: 12px 16px; margin-bottom: 28px; font-size: 13px; color: #a89fc0; }
    .group { margin-bottom: 28px; padding: 16px 20px; border-radius: 10px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07) }
    .group-header { display: flex; align-items: center; gap: 10px; margin-bottom: 10px }
    .badge { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.07em; border-radius: 20px; padding: 2px 10px; }
    .duration { font-size: 11px; color: #6b6880; font-variant-numeric: tabular-nums }
    .group-text { font-size: 15px; color: #c8c3d8; line-height: 1.8 }
    .sentence { display: inline }
    audio { display: block; border-radius: 6px; background: rgba(255,255,255,0.05) }
    audio::-webkit-media-controls-panel { background: rgba(30,26,46,0.9) }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <p class="meta">Exported by Storyfi · ${escapeHtml(exportedAt)}</p>
  ${standaloneNote}
  ${groupsHtml}
</body>
</html>`
}

export function exportHTML(project, groups) {
  const ready = groups.filter(g => g.stitchStatus === 'ready')
  const html = buildHTML(project, ready, { standalone: true })
  triggerDownload(html, 'script.html', 'text/html')
}

// ─── Build CSV timings ──────────────────────────────────────────────────────

export function buildCSV(groups) {
  const header = 'group_order,role,sentence_index,text,start_ms,end_ms,duration_ms\r\n'
  const rows = []
  for (const g of groups) {
    for (const s of (g.sentences ?? [])) {
      rows.push([
        g.order ?? '',
        csvCell(g.roleLabel ?? ''),
        s.sentenceIndex ?? '',
        csvCell(s.text ?? ''),
        s.startMs ?? '',
        s.endMs ?? '',
        s.durationMs ?? '',
      ].join(','))
    }
  }
  return header + rows.join('\r\n')
}

export function exportCSV(groups) {
  const ready = groups.filter(g => g.stitchStatus === 'ready')
  triggerDownload(buildCSV(ready), 'timings.csv', 'text/csv')
}

// ─── Main ZIP export ────────────────────────────────────────────────────────

/**
 * Build and download full ZIP with MP3s + manifests.
 */
export async function exportZip(project, groups, onProgress) {
  const ready = groups.filter(g => g.stitchStatus === 'ready')
  if (ready.length === 0) throw new Error('No generated audio to export.')

  const zip = new JSZip()
  const total = ready.length + 3
  let done = 0

  const tick = () => { done++; onProgress?.(done / total) }

  // Audio files
  for (const group of ready) {
    const blob = await getAudioStitched(group.id)
    if (blob) zip.file(buildFilename(group), blob)
    tick()
  }

  // Manifests
  zip.file('playlist.json', JSON.stringify(buildJSON(project, ready), null, 2))
  tick()

  zip.file('script.html', buildHTML(project, ready, { standalone: false }))
  tick()

  zip.file('timings.csv', buildCSV(ready))
  tick()

  onProgress?.(0.97)
  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  }, ({ percent }) => onProgress?.(0.97 + (percent / 100) * 0.03))

  triggerDownload(zipBlob, `${projectSlug(project.title)}_export.zip`)
  onProgress?.(1)
}