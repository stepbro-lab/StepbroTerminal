/**
 * At startup ConPTY probes the outer terminal and BLOCKS the shell until it answers. On Windows
 * that means a new shell shows nothing for about three seconds before its prompt. The real
 * terminal is the renderer, which only attaches later, so nobody answers in time. The host
 * answers these probes itself, which brings a new shell up in tens of milliseconds.
 *
 * Only two queries matter and only at startup:
 *  - Primary Device Attributes, ESC[c or ESC[0c  -> "I am a VT100 with an advanced video option"
 *  - Cursor Position Report,     ESC[6n           -> row 1, column 1
 *
 * A view that attaches afterwards must not answer again (the renderer already drops its replies
 * while replaying the snapshot), or the program would read the second answer as typed input.
 */
const DA = /\x1b\[0?c/
const DSR = /\x1b\[6n/

export function conptyReply(chunk: string): string {
  let out = ''
  if (DA.test(chunk)) out += '\x1b[?1;2c'
  if (DSR.test(chunk)) out += '\x1b[1;1R'
  return out
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
