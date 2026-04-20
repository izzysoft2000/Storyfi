/**
 * editor/autoTagger.js
 *
 * Scans the editor document for [LABEL] prefixes and returns a list of
 * tagging operations. The caller applies them one-by-one through the
 * normal Tiptap path so each fires onUpdate → editorState save → playlist sync.
 *
 * Rules:
 *  - Only tags text with NO existing voiceTag mark (merge mode)
 *  - Leaves the [LABEL] text itself untagged
 *  - Matching is case-insensitive
 *  - Reports unmatched labels
 *  - Handles split-node structure: [LABEL] node (possibly code/italic marked)
 *    followed by speech text in the next sibling node
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

  // pendingRole: set when a [LABEL] node has no taggable text after it.
  // The NEXT untagged text node (e.g. the speech text that follows) gets tagged.
  // This handles: [NARRATOR](code mark) | "They say..." — two separate nodes.
  let pendingRole = null

  doc.descendants((node, pos) => {
    // Non-inline block boundary — reset pending role
    if (!node.isText) {
      if (!node.isInline) pendingRole = null
      return
    }

    if (pos + node.nodeSize <= rangeFrom || pos >= rangeTo) return

    const text = node.text ?? ''
    if (!text) return

    const hasVoiceTag = node.marks.some(m => m.type.name === 'voiceTag')

    if (hasVoiceTag) {
      // Already tagged — cancel any pending role, count for "found" if label is inside
      pendingRole = null
      if ([...text.matchAll(LABEL_RE)].length > 0) found++
      return
    }

    // Apply a pending role from a previous label-only node
    if (pendingRole) {
      const trimStart = text.search(/\S/)
      const trimEnd   = text.trimEnd().length
      if (trimStart >= 0 && trimStart < trimEnd) {
        operations.push({ from: pos + trimStart, to: pos + trimEnd, role: pendingRole })
      }
      pendingRole = null
      // Fall through — this node might itself contain [LABEL] patterns
    }

    LABEL_RE.lastIndex = 0
    const matches = [...text.matchAll(LABEL_RE)]
    if (matches.length === 0) return
    found++

    for (let i = 0; i < matches.length; i++) {
      const match    = matches[i]
      const labelRaw = match[1]
      const role     = roleMap.get(labelRaw.trim().toLowerCase())

      if (!role) { unmatched.add(`[${labelRaw}]`); continue }

      const tagStart = match.index + match[0].length
      const tagEnd   = i + 1 < matches.length ? matches[i + 1].index : text.length

      // Check if there's any non-whitespace text after the label in this node
      const spanText  = tagStart < tagEnd ? text.slice(tagStart, tagEnd) : ''
      const trimStart = spanText.search(/\S/)

      if (tagStart >= tagEnd || trimStart < 0) {
        // Label fills this node — set pending role for the next sibling text node
        pendingRole = role
        continue
      }

      const trimEnd = spanText.trimEnd().length
      const from    = pos + tagStart + trimStart
      const to      = pos + tagStart + trimEnd
      if (from >= to) continue

      operations.push({ from, to, role })
    }
  })

  return { operations, found, unmatched: [...unmatched] }
}
