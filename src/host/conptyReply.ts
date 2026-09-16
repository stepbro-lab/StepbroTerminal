/**
 * At startup ConPTY probes the outer terminal and BLOCKS the shell until it answers. On Windows
 * that means a new shell shows nothing for about three seconds before its prompt. The real
 * terminal is the renderer, which only attaches later, so nobody answers in time. The host
 * answers the probe itself, which brings a new shell up in tens of milliseconds.
 *
 * Only one query is answered: Primary Device Attributes, ESC[c or ESC[0c, with "I am a VT100
 * with an advanced video option". That alone lifts the block.
 *
 * ConPTY also asks for the cursor position (ESC[6n, because the PTY inherits the cursor) and
 * it must NOT be answered from here. Measured on Windows PowerShell 5.1 with PSReadLine 2.0:
 * an ESC[1;1R reply leaves the shell's input in a state where the first key the user types is
 * swallowed ("echo" arrives as "cho") and the bell rings; without it the prompt is just as fast
 * and the first key arrives whole.
 *
 * A view that attaches afterwards must not answer again (the renderer already drops its replies
 * while replaying the snapshot), or the program would read the second answer as typed input.
 */
const DA = /\x1b\[0?c/

export function conptyReply(chunk: string): string {
  return DA.test(chunk) ? '\x1b[?1;2c' : ''
}

/** Whether a chunk is only terminal control sequences (no printable output yet), so the probe window is still open. */
export function isControlOnly(chunk: string): boolean {
  // Strip CSI/OSC/escape sequences and control bytes; if nothing printable remains it is control-only.
  const stripped = chunk
    .replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, '')
    .replace(/\x1b[[\]()#;?]*[0-9;]*[A-Za-z@`~]/g, '')
    .replace(/\x1b./g, '')
    .replace(/[\x00-\x1f\x7f]/g, '')
  return stripped.trim().length === 0
}

/**
 * Replies a terminal emulator sends to those same probes: the DA answer and a cursor-position
 * report. A view that is attached while the shell starts (a restored session, whose pane is on
 * screen before the respawn) produces them for its own copy of the output. The host has already
 * answered, so while the probe window is open these are dropped from the input.
 */
const PROBE_REPLIES = /\x1b\[\?[\d;]*c|\x1b\[\d+;\d+R/g

export function stripProbeReplies(input: string): string {
  return input.replace(PROBE_REPLIES, '')
}

/**
 * A program asking the terminal about itself: which colours it draws in (OSC 10, 11 and 12, sent
 * with a "?"), what kind of terminal it is, where the cursor sits. Programs ask at startup and
 * wait a moment for an answer.
 */
const QUERIES = /\x1b\][\d;]*;\?(\x07|\x1b\\)|\x1b\[>?0?c|\x1b\[6n/

export function hasQuery(chunk: string): boolean {
  return QUERIES.test(chunk)
}

/**
 * Every answer a terminal gives about itself, including the colours it draws in. None of these
 * is anything a person types or a program sends as input, so dropping one costs nothing; keeping
 * a late one costs the program reading it as though it had been typed, which is how
 * "]11;rgb:1616/1616/1919" ends up sitting in an agent's prompt.
 */
const REPLIES = /\x1b\[\?[\d;]*c|\x1b\[\d+;\d+R|\x1b\][\d;]*;rgb:[\da-fA-F/]*(\x07|\x1b\\)/g

export function stripStaleReplies(input: string): string {
  return input.replace(REPLIES, '')
}
