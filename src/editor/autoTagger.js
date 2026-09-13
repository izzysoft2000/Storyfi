/**
 * editor/autoTagger.js
 *
 * Scans the editor document for [LABEL] prefixes and tags text according to
 * the "section ownership" model:
 *
 *   [NARRATOR] Everything here belongs to Narrator...
 *   Even across multiple paragraphs...
 *   ...until the next label appears.
 *   [JOSEPH] Now everything belongs to Joseph.
 *
 * Rules:
 *  - `current` (the active role, or "comment mode") persists across
 *    paragraph/block boundaries
 *  - `current` only changes when a new [LABEL] is found
 *  - Text before the very first [LABEL] is left untagged
 *  - [COMMENT] is a reserved label (like a role name, but never added to the
 *    cast) — everything from a [COMMENT] label until the next [LABEL] is
 *    marked as a Comment instead of voiced. This is an explicit "seen, but
 *    never voiced" override — it always wins, even over the stage-direction
 *    heuristic below.
 *  - A paragraph that is ENTIRELY italic (a full stage-direction line, e.g.
 *    *He turns away.*) is tagged to the "Narrator" role instead of the
 *    current speaker — `current` is left unchanged, since a direction
 *    doesn't change who's speaking next. Requires a "Narrator" role to
 *    exist in the cast (see hasFullItalicParagraph()).
 *  - Italic text that is only PART of a paragraph (inline emphasis mixed
 *    with plain text, e.g. "I *really* mean it.") is tagged the same as
 *    the surrounding text — it is NOT stage direction and must not be
 *    silently dropped from the sentence's audio.
 *  - Text that already has a voiceTag or comment mark is skipped (merge
 *    mode) — only the label matches inside are used to update `current`
 *  - Reports unmatched labels
 */

const LABEL_RE = /\[([^\]]+)\]/g

/**
 * True if `editor`'s document contains at least one paragraph whose entire
 * non-whitespace content is a single italic run (a full stage-direction
 * line). Used to decide whether a "Narrator" role needs to be auto-created
 * before running Auto-Tag.
 *
 * @param {import('@tiptap/core').Editor} editor
 */
export function hasFullItalicParagraph(editor) {
  if (!editor) return false
  let found = false
  editor.state.doc.descendants(node => {
    if (found) return false
    if (node.type.name === 'table') return false
    if (node.type.name !== 'paragraph') return
    if (isFullItalicParagraph(node)) found = true
  })
  return found
}

function isFullItalicParagraph(paragraphNode) {
  const nonEmptyChildren = []
  paragraphNode.forEach(child => {
    if (child.isText && child.text.trim().length > 0) nonEmptyChildren.push(child)
  })
  return nonEmptyChildren.length > 0 &&
    nonEmptyChildren.every(c => c.marks.some(m => m.type.name === 'italic'))
}

/**
 * @param {import('@tiptap/core').Editor} editor
 * @param {Array}  roles    — cast roles [{ id, label, color }]
 * @param {object} [options]
 * @param {number} [options.from] — start of doc range (omit for full doc)
 * @param {number} [options.to]   — end of doc range (omit for full doc)
 *
 * @returns {{ operations: {from,to,role}[]|{from,to,comment:true}[], found: number, unmatched: string[] }}
 */
export function buildAutoTagOperations(editor, roles, options) {
  if (!editor || !roles?.length) return { operations: [], found: 0, unmatched: [] }

  const roleMap = new Map()
  for (const role of roles) {
    roleMap.set(role.label.trim().toLowerCase(), role)
  }
  const narratorRole = roleMap.get('narrator')

  // Resolves a raw [LABEL] name to what it should switch `current` to.
  //   [COMMENT] (case-insensitive)     → comment mode
  //   a label matching a cast role     → that role
  //   anything else                    → null (unmatched)
  function resolveLabel(labelRaw) {
    if (labelRaw.trim().toLowerCase() === 'comment') return { type: 'comment' }
    const role = roleMap.get(labelRaw.trim().toLowerCase())
    return role ? { type: 'role', role } : null
  }

  const doc        = editor.state.doc
  const rangeFrom  = options?.from ?? 0
  const rangeTo    = options?.to   ?? doc.content.size
  const operations = []
  let   found      = 0
  const unmatched  = new Set()

  // `current` persists across paragraph boundaries — everything from a
  // [LABEL] (or [COMMENT]) until the next [LABEL] belongs to it.
  //   { type: 'role', role } — normal section-ownership tagging
  //   { type: 'comment' }    — [COMMENT] section: seen, never voiced
  //   null                   — before the first label — leave untagged
  let current = null

  // Set whenever we enter a paragraph node — read by its child text nodes.
  let currentParagraphIsStageDirection = false

  function pushSpan(from, to) {
    if (from < 0 || from >= to) return
    if (current?.type === 'comment') operations.push({ from, to, comment: true })
    else if (current?.type === 'role') operations.push({ from, to, role: current.role })
    // current === null → leave untagged
  }

  doc.descendants((node, pos) => {
    // Skip entire table subtrees — [LABEL] patterns inside tables are
    // metadata (voice assignment reference), not script content to tag
    if (node.type.name === 'table') return false

    if (node.type.name === 'paragraph') {
      currentParagraphIsStageDirection = isFullItalicParagraph(node)
      return
    }

    // Skip non-text nodes — but DON'T reset `current` (it carries across paragraphs)
    if (!node.isText) return

    if (pos + node.nodeSize <= rangeFrom || pos >= rangeTo) return

    const text = node.text ?? ''
    if (!text) return

    const hasVoiceTag = node.marks.some(m => m.type.name === 'voiceTag')
    const hasComment  = node.marks.some(m => m.type.name === 'comment')
    const isItalic    = node.marks.some(m => m.type.name === 'italic')

    LABEL_RE.lastIndex = 0
    const matches = [...text.matchAll(LABEL_RE)]

    if (hasVoiceTag || hasComment) {
      // Already tagged — update `current` if there's a new label here
      if (matches.length > 0) {
        found++
        const lastMatch = matches[matches.length - 1]
        const resolved  = resolveLabel(lastMatch[1])
        if (resolved) current = resolved
      }
      return
    }

    // A full stage-direction line (whole paragraph is italic) — tag to
    // Narrator, if the cast has one. `current` carries through untouched: a
    // direction doesn't change who speaks next. An explicit [COMMENT]
    // section always wins over this heuristic — it's a deliberate override.
    if (isItalic && currentParagraphIsStageDirection && current?.type !== 'comment') {
      if (narratorRole) {
        const trimStart = text.search(/\S/)
        const trimEnd   = text.trimEnd().length
        if (trimStart >= 0 && trimStart < trimEnd) {
          operations.push({ from: pos + trimStart, to: pos + trimEnd, role: narratorRole })
        }
      }
      return
    }

    // Inline italic emphasis (mixed into an otherwise plain paragraph) is
    // NOT a stage direction — fall through and tag it like ordinary text
    // so the word isn't silently dropped from its sentence's audio.

    if (matches.length === 0) {
      // No label — tag entire node with whatever `current` already is
      const trimStart = text.search(/\S/)
      const trimEnd   = text.trimEnd().length
      if (trimStart >= 0) pushSpan(pos + trimStart, pos + trimEnd)
      return
    }

    found++

    // Tag text BEFORE the first label with whatever `current` already is
    if (matches[0].index > 0) {
      const before     = text.slice(0, matches[0].index)
      const trimStart  = before.search(/\S/)
      const trimEnd    = before.trimEnd().length
      if (trimStart >= 0) pushSpan(pos + trimStart, pos + trimEnd)
    }

    // Process each [LABEL] in this node
    for (let i = 0; i < matches.length; i++) {
      const match    = matches[i]
      const labelRaw = match[1]
      const resolved = resolveLabel(labelRaw)

      if (!resolved) {
        unmatched.add(`[${labelRaw}]`)
        // Keep `current` unchanged — unmatched labels don't interrupt flow
        continue
      }

      // Update `current` to this new label
      current = resolved

      const tagStart = match.index + match[0].length
      const tagEnd   = i + 1 < matches.length ? matches[i + 1].index : text.length
      const spanText = text.slice(tagStart, tagEnd)
      const trimStart = spanText.search(/\S/)

      if (trimStart < 0) continue // no text after label in this node — `current` carries over

      const trimEnd = spanText.trimEnd().length
      pushSpan(pos + tagStart + trimStart, pos + tagStart + trimEnd)
    }
  })

  return { operations, found, unmatched: [...unmatched] }
}
