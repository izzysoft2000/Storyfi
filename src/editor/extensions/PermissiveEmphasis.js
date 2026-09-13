/**
 * Tiptap's stock Bold/Italic input rules only trigger when the opening
 * `**`/`*`/`__`/`_` marker is preceded by whitespace or the very start of a
 * line. That breaks a common script-writing pattern — bolded/italicized
 * dialogue starting right inside a quote mark, e.g. "**Wait.**" she said. —
 * since the leading `"` isn't whitespace, the mark never applies while typing.
 *
 * These extend the stock Bold/Italic marks with input rules that also accept
 * common leading punctuation (quotes, parens, brackets, dashes) as a valid
 * boundary, in addition to whitespace/start-of-line. Everything else
 * (schema, keyboard shortcuts, paste rules) is inherited unchanged.
 */
import Bold from '@tiptap/extension-bold'
import Italic from '@tiptap/extension-italic'
import { markInputRule } from '@tiptap/core'

// A lookbehind (not a consumed leading character class) so the boundary is
// merely checked, never part of match[0] — markInputRule assumes anything
// before the mark delimiters in the full match is whitespace it can skip
// past via `fullMatch.search(/\S/)`; a consumed non-whitespace boundary
// (e.g. a literal quote in the match) breaks that math and gets eaten.
const LEADING = String.raw`(?<=^|[\s"'“‘(\[{\-–—])`

const boldStarRegex         = new RegExp(`${LEADING}(\\*\\*(?!\\s+\\*\\*)([^*]+)\\*\\*(?!\\s+\\*\\*))$`)
const boldUnderscoreRegex   = new RegExp(`${LEADING}(__(?!\\s+__)([^_]+)__(?!\\s+__))$`)
const italicStarRegex       = new RegExp(`${LEADING}(\\*(?!\\s+\\*)([^*]+)\\*(?!\\s+\\*))$`)
const italicUnderscoreRegex = new RegExp(`${LEADING}(_(?!\\s+_)([^_]+)_(?!\\s+_))$`)

export const PermissiveBold = Bold.extend({
  addInputRules() {
    return [
      markInputRule({ find: boldStarRegex, type: this.type }),
      markInputRule({ find: boldUnderscoreRegex, type: this.type }),
    ]
  },
})

export const PermissiveItalic = Italic.extend({
  addInputRules() {
    return [
      markInputRule({ find: italicStarRegex, type: this.type }),
      markInputRule({ find: italicUnderscoreRegex, type: this.type }),
    ]
  },
})
