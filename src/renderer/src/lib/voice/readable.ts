/**
 * Turning what is on a terminal into something worth hearing.
 *
 * Agents write for a screen: headings marked with hashes, words wrapped in asterisks, commands in
 * backticks, boxes drawn out of line characters, spinners made of braille. Read out literally that
 * is "hash hash Verificación, star star npm run test star star", which is unbearable. What a
 * person wants to hear is the sentence underneath, so the marks come off and the words stay.
 */

/** Longer than this and nobody is listening any more; the rest is left unread. */
export const READ_LIMIT = 4000

/** Colour and cursor codes, in case a selection ever carries them. */
const ANSI = /\[[0-9;?]*[A-Za-z]|\][^]*(|\\)/g
/** The lines and blocks agents draw frames and bars out of. */
const DRAWING = /[─-╿▀-▟■-◿⠀-⣿]/g
/** Marks that decorate a word rather than say anything: emphasis, code, headings, quotes, rules. */
const FENCE = /^\s*(```|~~~).*$/gm
const HEADING = /^\s{0,3}#{1,6}\s+/gm
const QUOTE = /^\s{0,3}>\s?/gm
const BULLET = /^\s*([-*+•‣]|\d{1,3}[.)])\s+/gm
const RULE = /^\s*([-*_=])\1{2,}\s*$/gm
const EMPHASIS = /(\*{1,3}|_{1,3}|~~)(?=\S)([\s\S]*?\S)\1/g
const CODE = /`+([^`]+)`+/g
const LINK = /\[([^\]]*)\]\(([^)]*)\)/g
const CHECKBOX = /^\s*\[[ xX]\]\s+/gm

/**
 * What a person would read out from a selection: the words, without the marks that only make
 * sense on a screen. Nothing is summarized or reordered; it is the same text, said plainly.
 */
export function readable(text: string): string {
  let out = text
    .replace(ANSI, ' ')
    .replace(FENCE, '')
    .replace(LINK, '$1')
    .replace(CODE, '$1')
    .replace(HEADING, '')
    .replace(QUOTE, '')
    .replace(RULE, '')
    // The bullet comes off before the box it holds: "- [ ] pendiente" is a bullet, then a box.
    .replace(BULLET, '')
    .replace(CHECKBOX, '')
    .replace(EMPHASIS, '$2')
    .replace(DRAWING, ' ')

  out = out
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    // A blank line is a pause worth keeping; two are not.
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return out.length > READ_LIMIT ? out.slice(0, READ_LIMIT).replace(/\s+\S*$/, '') : out
}

export type ReadSpeed = 'slow' | 'normal' | 'fast'

/** How the pace is asked for, since a voice is steered with words rather than a number. */
const PACE: Record<ReadSpeed, string> = {
  slow: 'slowly and clearly, as if reading to someone taking notes',
  normal: 'at a normal, even pace',
  fast: 'briskly, without dragging'
}

/**
 * What to say to the voice so it reads a passage out instead of answering it. Said plainly and
 * twice over, because a model handed a wall of text will otherwise try to be helpful about it.
 */
export function readRequest(text: string, speed: ReadSpeed = 'normal'): string {
  return [
    `Read the following out loud, ${PACE[speed]}.`,
    'Read it as it is written: do not summarize it, do not comment on it, do not answer it, and do not say anything before or after it.',
    'If it is in another language, read it in that language.',
    '',
    text
  ].join('\n')
}
