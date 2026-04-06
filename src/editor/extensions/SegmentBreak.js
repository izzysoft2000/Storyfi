/**
 * editor/extensions/SegmentBreak.js
 *
 * Custom Tiptap inline Node that acts as a manual segment boundary —
 * like a page break in Word but for voice segments.
 *
 * Renders as a subtle dashed violet rule across the editor width.
 * Inserted at cursor with Ctrl/Cmd+Shift+Enter or toolbar button.
 * Selected and deleted like any inline atom (Backspace / Delete).
 *
 * Only meaningful inside a VoiceTag-marked span; the splitter
 * will use these as hard boundaries before applying char-limit splitting.
 */

import { Node, mergeAttributes } from '@tiptap/core'

export const SegmentBreak = Node.create({
  name: 'segmentBreak',

  group: 'inline',
  inline: true,
  atom: true,       // selected as a unit; not editable internally
  selectable: true,
  draggable: false,

  parseHTML() {
    return [{ tag: 'span[data-segment-break]' }]
  },

  renderHTML() {
    return [
      'span',
      mergeAttributes({
        'data-segment-break': 'true',
        'contenteditable':    'false',
        'class':              'segment-break',
      }),
    ]
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Shift-Enter': () =>
        this.editor.commands.insertSegmentBreak(),
    }
  },

  addCommands() {
    return {
      /**
       * Insert a SegmentBreak node at the current cursor position.
       */
      insertSegmentBreak:
        () =>
        ({ commands }) =>
          commands.insertContent({ type: this.name }),
    }
  },
})
