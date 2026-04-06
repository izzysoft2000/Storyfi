/**
 * audio/timestamps.js
 * Helpers for computing sentence/group durations and the master timeline.
 */

/**
 * Decode an MP3 Blob and return its duration in milliseconds.
 * Uses an HTML <audio> element first (most reliable for MP3),
 * falls back to AudioContext, times out after 8s.
 *
 * @param {Blob} blob
 * @returns {Promise<number>}   duration in ms
 */
export async function getBlobDurationMs(blob) {
  // Method 1: HTML Audio element — most reliable for MP3 from any provider
  try {
    const durationMs = await getAudioElementDuration(blob)
    if (durationMs > 0) return durationMs
  } catch { /* fall through */ }

  // Method 2: AudioContext with 5s timeout
  try {
    return await Promise.race([
      decodeWithAudioContext(blob),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('AudioContext timeout')), 5000)
      )
    ])
  } catch { /* fall through */ }

  // Method 3: estimate from blob size (~128kbps MP3 = 16KB/s)
  return Math.round((blob.size / 16000) * 1000)
}

function getAudioElementDuration(blob) {
  return new Promise((resolve, reject) => {
    const url    = URL.createObjectURL(blob)
    const audio  = new Audio()
    const cleanup = () => URL.revokeObjectURL(url)

    audio.addEventListener('loadedmetadata', () => {
      const ms = Math.round(audio.duration * 1000)
      cleanup()
      resolve(ms)
    }, { once: true })

    audio.addEventListener('error', (e) => {
      cleanup()
      reject(new Error(`Audio load error: ${e.message}`))
    }, { once: true })

    // Timeout in case metadata never fires
    setTimeout(() => { cleanup(); reject(new Error('Audio element timeout')) }, 4000)

    audio.src = url
    audio.load()
  })
}

async function decodeWithAudioContext(blob) {
  const arrayBuffer = await blob.arrayBuffer()
  const ctx = new (window.AudioContext || window.webkitAudioContext)()
  try {
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
    return Math.round(audioBuffer.duration * 1000)
  } finally {
    ctx.close().catch(() => {})
  }
}

/**
 * Given an ordered array of sentences (each with durationMs),
 * compute and return their cumulative startMs / endMs relative
 * to the start of their paragraph group.
 *
 * @param {Array<{ durationMs: number }>} sentences
 * @returns {Array<{ startMs: number, endMs: number }>}
 */
export function computeSentenceTimings(sentences) {
  let cursor = 0
  return sentences.map(s => {
    const startMs = cursor
    const endMs   = cursor + (s.durationMs ?? 0)
    cursor = endMs
    return { startMs, endMs }
  })
}

/**
 * Recompute the master timeline for all paragraph groups.
 * Groups are in document order. Returns updated groups with
 * startMs and endMs set relative to t=0.
 *
 * @param {ParagraphGroup[]} groups   — ordered, each with totalDurationMs
 * @returns {ParagraphGroup[]}
 */
export function recomputeMasterTimeline(groups) {
  let cursor = 0
  return groups.map(g => {
    const startMs = cursor
    const endMs   = cursor + (g.totalDurationMs ?? 0)
    cursor = endMs
    return { ...g, startMs, endMs }
  })
}

/**
 * Format milliseconds as M:SS.s for playlist display.
 * e.g. 4600 → "0:04.6"
 *
 * @param {number|null} ms
 * @returns {string}
 */
export function formatDuration(ms) {
  if (ms == null || ms < 0) return '—'
  const totalSec = ms / 1000
  const m  = Math.floor(totalSec / 60)
  const s  = Math.floor(totalSec % 60)
  const ds = Math.floor((totalSec % 1) * 10) // tenths
  return `${m}:${String(s).padStart(2, '0')}.${ds}`
}
