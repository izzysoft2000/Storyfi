/**
 * editor/splitter.js
 *
 * Extracts sentences from tagged text spans and splits them
 * into chunks that respect the user's character limit setting.
 *
 * Priority order:
 *   1. Manual SegmentBreak nodes — always split there first
 *   2. Character limit — split at last sentence boundary before limit
 *   3. Hard split at limit if no sentence boundary found (splitWarning: true)
 */

/**
 * Sentence boundary regex.
 * Splits AFTER . ! ? that are followed by whitespace + capital letter.
 * Handles: "Dr. Smith", ellipses (...), dialogue ("Hello." she said).
 */
const SENTENCE_BOUNDARY = /(?<=[.!?][\u201D\u2019"']?)\s+(?=[A-Z\u201C\u2018"'])/g

/**
 * Extract individual sentences from a plain-text string.
 * Returns an array of trimmed, non-empty strings.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function extractSentences(text) {
  if (!text?.trim()) return []

  const sentences = text.split(SENTENCE_BOUNDARY)
  return sentences
    .map(s => s.trim())
    .filter(s => s.length > 0)
}

/**
 * Split a text string into chunks that fit within charLimit,
 * breaking at sentence boundaries where possible.
 *
 * @param {string} text         — plain text to split
 * @param {number} charLimit    — max chars per chunk (default 250)
 * @returns {{ text: string, splitWarning: boolean }[]}
 */
export function splitToChunks(text, charLimit = 250) {
  const chunks = []
  let remaining = text.trim()

  while (remaining.length > charLimit) {
    const window = remaining.slice(0, charLimit)

    // Find the last sentence-ending punctuation within the window.
    // We look for . ! ? optionally followed by closing quote, then space.
    let splitAt = -1
    const punctMatches = [...window.matchAll(/[.!?][\u201D\u2019"']?\s/g)]
    if (punctMatches.length > 0) {
      const last = punctMatches[punctMatches.length - 1]
      // Split after the punctuation + optional quote (before the space)
      splitAt = last.index + last[0].trimEnd().length
    }

    if (splitAt > 0) {
      chunks.push({ text: remaining.slice(0, splitAt).trim(), splitWarning: false })
      remaining = remaining.slice(splitAt).trimStart()
    } else {
      // No sentence boundary — hard split at charLimit
      chunks.push({ text: remaining.slice(0, charLimit).trim(), splitWarning: true })
      remaining = remaining.slice(charLimit).trimStart()
    }
  }

  if (remaining.length > 0) {
    chunks.push({ text: remaining, splitWarning: false })
  }

  return chunks
}

/**
 * Full splitting pipeline for a tagged span.
 *
 * Takes the plain text of a VoiceTag span (with SegmentBreak markers
 * represented as a special delimiter) and returns an ordered array
 * of sentence chunks ready to become Segment records.
 *
 * @param {string}   fullText     — plain text of the tagged span
 * @param {string}   BREAK_TOKEN  — placeholder used for SegmentBreak nodes
 * @param {number}   charLimit    — from project settings
 * @returns {{ text: string, splitWarning: boolean }[]}
 */
export const SEGMENT_BREAK_TOKEN = '\x00BREAK\x00'

export function splitTaggedSpan(fullText, charLimit = 250) {
  if (!fullText?.trim()) return []

  // Split ONLY on manual § SegmentBreak tokens.
  // Paragraph boundaries are already handled by extractTaggedSpans (one span per paragraph).
  // Char-limit auto-splitting is intentionally removed — if a paragraph is too long,
  // the user inserts a § break in the editor.
  return fullText
    .split(SEGMENT_BREAK_TOKEN)
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .map(text => ({ text, splitWarning: false }))
}

/**
 * Given a ProseMirror document node, extract all VoiceTag spans
 * as an array of { roleId, roleLabel, color, text, from, to } objects.
 *
 * Used by the generation pipeline to build ParagraphGroup records.
 *
 * @param {ProseMirrorNode} doc
 * @returns {{ roleId, roleLabel, color, text, from, to }[]}
 */
export function extractTaggedSpans(doc) {
  const spans   = []
  let   current = null

  doc.descendants((node, pos) => {
    if (!node.isText) return

    const voiceTag = node.marks.find(m => m.type.name === 'voiceTag')

    if (voiceTag) {
      const { roleId, roleLabel, color } = voiceTag.attrs

      // Merge only when strictly contiguous (same paragraph, no gap).
      // Paragraph boundaries intentionally create separate spans — each
      // paragraph becomes its own segment. Users use § for manual breaks.
      if (current && current.roleId === roleId && current.to === pos) {
        current.text += node.text
        current.to    = pos + node.nodeSize
      } else {
        if (current) spans.push(current)
        current = {
          roleId, roleLabel, color,
          text: node.text ?? '',
          from: pos,
          to:   pos + node.nodeSize,
        }
      }
    } else {
      if (current) { spans.push(current); current = null }
    }
  })

  if (current) spans.push(current)
  return spans
}
