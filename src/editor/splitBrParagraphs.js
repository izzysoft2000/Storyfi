/**
 * Splits any <p> containing <br> into multiple separate <p> elements, one
 * per line. Used after markdown import (with `breaks: true`) so that a
 * script written with single line breaks and no blank lines between them —
 * the common case, e.g.:
 *
 *   [JOSE]
 *   *A beat.*
 *   It's going *up?*
 *
 * — ends up as three separate ProseMirror paragraphs, exactly like typing
 * each line with Enter would produce, instead of one paragraph mixing
 * plain and italic text. Auto-Tag's "whole paragraph is italic == stage
 * direction" heuristic (see autoTagger.js) only works when each line is
 * its own paragraph; CommonMark's `breaks:false` default silently merges
 * blank-line-less lines into one paragraph, which broke that heuristic.
 *
 * Only touches <p> elements — tables/lists (already separate DOM
 * structures from marked's block-level parsing) are unaffected regardless
 * of the `breaks` option.
 */
export function splitParagraphsOnBr(html) {
  const container = document.createElement('div')
  container.innerHTML = html

  for (const p of [...container.querySelectorAll('p')]) {
    if (!p.querySelector('br')) continue

    const paragraphs = []
    let current = document.createElement('p')
    for (const child of [...p.childNodes]) {
      if (child.nodeName === 'BR') {
        paragraphs.push(current)
        current = document.createElement('p')
      } else {
        current.appendChild(child)
      }
    }
    paragraphs.push(current)
    p.replaceWith(...paragraphs)
  }

  return container.innerHTML
}
