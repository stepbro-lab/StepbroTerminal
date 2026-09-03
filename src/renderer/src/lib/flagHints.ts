/**
 * Flags worth offering when an agent is typed at a shell prompt: each one skips the
 * agent's own permission prompts, which is how people usually run them in here.
 */
export const FLAG_HINTS: Record<string, string> = {
  claude: '--dangerously-skip-permissions',
  codex: '--dangerously-bypass-approvals-and-sandbox',
  gemini: '--yolo'
}

/**
 * Answers xterm sends on the terminal's behalf (device attributes, cursor position, colour
 * and focus reports). They travel the same way as keystrokes but nobody typed them.
 */
const TERMINAL_REPLY = /^\x1b(\[[?>]?[\d;]*[cRn]|\[[IO]|\][^\x07]*(\x07|\x1b\\)|P[\s\S]*?\x1b\\)$/

const BRACKETED_PASTE = /^\x1b\[200~([\s\S]*)\x1b\[201~$/

/**
 * Follows the current shell line from the keystrokes sent to the PTY. The shell owns the
 * real line, so anything this cannot mirror (history, cursor movement, tab completion,
 * word deletion) marks the line unknown until Enter or Ctrl+C starts a fresh one.
 */
export class InputLine {
  text = ''
  known = true

  feed(data: string): void {
    if (TERMINAL_REPLY.test(data)) return
    const pasted = BRACKETED_PASTE.exec(data)
    if (pasted) data = pasted[1]
    for (let i = 0; i < data.length; i++) {
      const ch = data[i]
      if (ch === '\r' || ch === '\n' || ch === '\x03') {
        this.reset()
        continue
      }
      if (ch === '\x7f' || ch === '\b') {
        this.text = this.text.slice(0, -1)
        continue
      }
      if (ch === '\x1b') {
        // Arrow keys, Alt combinations: the rest of this chunk belongs to them.
        this.known = false
        return
      }
      if (ch < ' ') {
        this.known = false
        continue
      }
      this.text += ch
    }
  }

  reset(): void {
    this.text = ''
    this.known = true
  }
}

/**
 * The ghost text to show after `line`, or null. Only fires when the line is just an agent
 * name, optionally followed by the start of its flag, so it never interrupts a real command.
 */
export function hintFor(line: string, hints: Record<string, string> = FLAG_HINTS): string | null {
  const m = /^\s*([A-Za-z][\w.-]*)(\s+)?(\S*)$/.exec(line)
  if (!m) return null
  const flag = hints[m[1]]
  if (!flag) return null
  const [, , gap, partial] = m
  if (!gap) return partial ? null : ' ' + flag
  if (!partial) return flag
  return flag.startsWith(partial) && partial !== flag ? flag.slice(partial.length) : null
}
