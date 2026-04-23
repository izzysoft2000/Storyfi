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
 *  - pendingRole carries across paragraph/block boundaries
 *  - pendingRole only changes when a new [LABEL] is found
 *  - Text before the very first [LABEL] is left untagged
 *  - Italic text (stage directions) is skipped — not tagged, pendingRole still carries
 *  - Text that already has a voiceTag mark is skipped (merge mode)
 *  - Reports unmatched labels
 */

const LABEL_RE = /\[([^\]]+)\]/g

/**
 * @param {import('@tiptap/core').Editor} editor
 * @param {Array}  roles    — cast roles [{ id, label, color }]
 * @param {object} [options]
 * @param {number} [options.from] — start of doc range (omit for full doc)
 * @param {number} [options.to]   — end of doc range (omit for full doc)
 *
 * @returns {{ operations: {from,to,role}[], found: number, unmatched: string[] }}
 */
export function buildAutoTagOperations(editor, roles, options) {
  if (!editor || !roles?.length) return { operations: [], found: 0, unmatched: [] }

  const roleMap = new Map()
  for (const role of roles) {
    roleMap.set(role.label.trim().toLowerCase(), role)
  }

  const doc        = editor.state.doc
  const rangeFrom  = options?.from ?? 0
  const rangeTo    = options?.to   ?? doc.content.size
  const operations = []
  let   found      = 0
  const unmatched  = new Set()

  // pendingRole persists across paragraph boundaries.
  // Everything from a [LABEL] until the next [LABEL] belongs to that role.
  let pendingRole = null

  doc.descendants((node, pos) => {
    // Skip entire table subtrees — [LABEL] patterns inside tables are
    // metadata (voice assignment reference), not script content to tag
    if (node.type.name === 'table') return false

    // Skip non-text nodes — but DON'T reset pendingRole (it carries across paragraphs)
    if (!node.isText) return

    if (pos + node.nodeSize <= rangeFrom || pos >= rangeTo) return

    const text = node.text ?? ''
    if (!text) return

    const hasVoiceTag = node.marks.some(m => m.type.name === 'voiceTag')
    const isItalic    = node.marks.some(m => m.type.name === 'italic')

    LABEL_RE.lastIndex = 0
    const matches = [...text.matchAll(LABEL_RE)]

    if (hasVoiceTag) {
      // Already tagged — update pendingRole if there's a new label here
      if (matches.length > 0) {
        found++
        const lastMatch = matches[matches.length - 1]
        const lastRole  = roleMap.get(lastMatch[1].trim().toLowerCase())
        if (lastRole) pendingRole = lastRole
      }
      return
    }

    // Stage directions (italic) — don't tag, but let pendingRole carry through
    if (isItalic) return

    if (matches.length === 0) {
      // No label — tag entire node with current pendingRole (if any)
      if (pendingRole) {
        const trimStart = text.search(/\S/)
        const trimEnd   = text.trimEnd().length
        if (trimStart >= 0 && trimStart < trimEnd) {
          operations.push({ from: pos + trimStart, to: pos + trimEnd, role: pendingRole })
        }
      }
      return
    }

    found++

    // Tag text BEFORE the first label with the current pendingRole
    if (pendingRole && matches[0].index > 0) {
      const before     = text.slice(0, matches[0].index)
      const trimStart  = before.search(/\S/)
      const trimEnd    = before.trimEnd().length
      if (trimStart >= 0 && trimStart < trimEnd) {
        operations.push({ from: pos + trimStart, to: pos + trimEnd, role: pendingRole })
      }
    }

    // Process each [LABEL] in this node
    for (let i = 0; i < matches.length; i++) {
      const match    = matches[i]
      const labelRaw = match[1]
      const role     = roleMap.get(labelRaw.trim().toLowerCase())

      if (!role) {
        unmatched.add(`[${labelRaw}]`)
        // Keep pendingRole unchanged — unmatched labels don't interrupt flow
        continue
      }

      // Update pendingRole to this new label
      pendingRole = role

      const tagStart = match.index + match[0].length
      const tagEnd   = i + 1 < matches.length ? matches[i + 1].index : text.length
      const spanText = text.slice(tagStart, tagEnd)
      const trimStart = spanText.search(/\S/)

      if (trimStart < 0) continue // no text after label in this node — pendingRole carries over

      const trimEnd = spanText.trimEnd().length
      const from    = pos + tagStart + trimStart
      const to      = pos + tagStart + trimEnd
      if (from < to) operations.push({ from, to, role })
    }
  })

  return { operations, found, unmatched: [...unmatched] }
}
