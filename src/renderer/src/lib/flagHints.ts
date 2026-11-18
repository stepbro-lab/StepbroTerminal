export const FLAG_HINTS: Record<string, string> = {
  claude: '--dangerously-skip-permissions',
  codex: '--dangerously-bypass-approvals-and-sandbox',
  gemini: '--yolo',
  opencode: '--auto',
  clyra: '--auto',
  codewhale: '--yolo'
}

const TERMINAL_REPLY = /^\x1b(\[[?>]?[\d;]*[cRn]|\[[IO]|\][^\x07]*(\x07|\x1b\\)|P[\s\S]*?\x1b\\)$/

const BRACKETED_PASTE = /^\x1b\[200~([\s\S]*)\x1b\[201~$/

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
