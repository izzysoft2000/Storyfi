/**
 * editor/extensions/VoiceTag.js
 *
 * Custom Tiptap Mark that tags a text selection as belonging
 * to a specific voice role. Renders as a coloured highlight
 * with a solid bottom border in the role's colour.
 *
 * Attributes:
 *   roleId    — FK to VoiceRole.id
 *   roleLabel — display name (denormalised for render speed)
 *   color     — hex colour of the role
 */

import { Mark, mergeAttributes } from '@tiptap/core'

export const VoiceTag = Mark.create({
  name: 'voiceTag',

  // Allow VoiceTag to span across multiple paragraphs
  spanning: false,

  // Only one VoiceTag at a time on any given text range
  excludes: 'voiceTag',

  addAttributes() {
    return {
      roleId: {
        default: null,
        parseHTML: el => el.getAttribute('data-role-id'),
        renderHTML: attrs => ({ 'data-role-id': attrs.roleId }),
      },
      roleLabel: {
        default: 'Narrator',
        parseHTML: el => el.getAttribute('data-role-label'),
        renderHTML: attrs => ({ 'data-role-label': attrs.roleLabel }),
      },
      color: {
        default: '#6B7FD4',
        parseHTML: el => el.getAttribute('data-role-color'),
        renderHTML: attrs => ({ 'data-role-color': attrs.color }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-role-id]' }]
  },

  renderHTML({ HTMLAttributes }) {
    const color = HTMLAttributes['data-role-color'] ?? '#6B7FD4'
    const r = parseInt(color.slice(1, 3), 16)
    const g = parseInt(color.slice(3, 5), 16)
    const b = parseInt(color.slice(5, 7), 16)
    const bg = `rgba(${r},${g},${b},0.15)`

    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        class: 'voice-tag',
        style: [
          `background: ${bg}`,
          `border-bottom: 2px solid ${color}`,
          `border-radius: 2px`,
          `padding: 0 2px`,
          `cursor: default`,
        ].join('; '),
      }),
      0,
    ]
  },

  addCommands() {
    return {
      /**
       * Apply a voice tag to the current selection.
       * editor.commands.setVoiceTag({ roleId, roleLabel, color })
       */
      setVoiceTag:
        attrs =>
        ({ commands }) =>
          commands.setMark(this.name, attrs),

      /**
       * Remove any voice tag from the current selection.
       */
      unsetVoiceTag:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),

      /**
       * Update the label/color of all tags with a given roleId.
       * Called when the user renames or recolours a role.
       */
      updateVoiceTagsForRole:
        (roleId, updates) =>
        ({ tr, state, dispatch }) => {
          let changed = false
          state.doc.descendants((node, pos) => {
            node.marks.forEach(mark => {
              if (mark.type.name === 'voiceTag' && mark.attrs.roleId === roleId) {
                tr.removeMark(pos, pos + node.nodeSize, mark.type)
                tr.addMark(
                  pos,
                  pos + node.nodeSize,
                  mark.type.create({ ...mark.attrs, ...updates })
                )
                changed = true
              }
            })
          })
          if (changed && dispatch) dispatch(tr)
          return changed
        },
    }
  },
})
