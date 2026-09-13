/**
 * editor/extensions/Comment.js
 *
 * Custom Tiptap Mark for text that's been seen and deliberately excluded
 * from voice generation — production notes, meta markers
 * (e.g. "— End of Episode 1 —"), or anything else that shouldn't be spoken,
 * but that the writer wants to distinguish from ordinary untagged prose.
 *
 * Mutually exclusive with VoiceTag — applying either mark always removes
 * the other from the same range (see `excludes` below and VoiceTag.js).
 * Only ever applied to whole paragraphs/lines, never a partial span —
 * enforced by the callers (StoryEditor's bubble menu, autoTagger.js), not
 * by the mark itself.
 *
 * Renders as muted gray text — distinct from both plain (untagged) text
 * and any VoiceTag color, so a Comment reads as "seen, deliberately
 * silenced" rather than "not yet handled."
 */

import { Mark, mergeAttributes } from '@tiptap/core'

export const Comment = Mark.create({
  name: 'comment',

  excludes: 'comment voiceTag',

  parseHTML() {
    return [{ tag: 'span[data-comment]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-comment': 'true',
        class: 'comment-mark',
      }),
      0,
    ]
  },

  addCommands() {
    return {
      /** Apply the Comment mark to the current selection. */
      setComment:
        () =>
        ({ commands }) =>
          commands.setMark(this.name),

      /** Remove the Comment mark from the current selection. */
      unsetComment:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    }
  },
})
