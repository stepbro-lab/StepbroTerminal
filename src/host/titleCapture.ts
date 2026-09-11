/**
 * Reconstructs the command lines the user types into a PTY (used for the session
 * title and for agent detection). Ignores escape sequences and control bytes,
 * applies backspace.
 */
export class TitleCapture {
  private line = ''
  private escape = false
  private csi = false
  private osc = false

  constructor(private readonly max = 60) {}

  /** Returns the submitted line when a non-empty line is completed in this chunk, else null. */
  feed(input: Uint8Array): string | null {
    const text = Buffer.from(input).toString('utf8')
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]
      const code = text.charCodeAt(i)
      if (this.osc) {
        if (ch === '\x07' || (ch === '\\' && text[i - 1] === '\x1b')) this.osc = false
        continue
      }
      if (this.csi) {
        if (code >= 0x40 && code <= 0x7e) this.csi = false
        continue
      }
      if (this.escape) {
        this.escape = false
        if (ch === '[') this.csi = true
        else if (ch === ']') this.osc = true
        continue
      }
      if (ch === '\x1b') {
        this.escape = true
        continue
      }
      if (ch === '\r' || ch === '\n') {
        const t = this.line.trim()
        this.line = ''
        if (t.length) return t.length > this.max ? t.slice(0, this.max - 1) + '…' : t
        continue
      }
      if (ch === '\x7f' || ch === '\b') {
        this.line = this.line.slice(0, -1)
        continue
      }
      if (code < 0x20) continue
      if (this.line.length < 512) this.line += ch
    }
    return null
  }

  reset(): void {
    this.line = ''
    this.escape = this.csi = this.osc = false
  }
}

const AGENT_BINARIES: Record<string, string> = {
  claude: 'claude',
  codex: 'codex',
  gemini: 'gemini',
  'cursor-agent': 'cursor',
  agent: 'cursor',
  opencode: 'opencode',
  clyra: 'clyra',
  kimi: 'kimi',
  deepcode: 'deepcode',
  codewhale: 'codewhale',
  codew: 'codewhale'
}

/** Returns the agent preset id when a typed command line starts with a known agent binary. */
export function detectAgentFromCommand(line: string): string | null {
  const first = line.trim().split(/\s+/)[0] ?? ''
  if (!first) return null
  const name = first
    .split(/[\\/]/)
    .pop()!
    .replace(/\.(exe|cmd|bat|ps1)$/i, '')
    .toLowerCase()
  return AGENT_BINARIES[name] ?? null
}
