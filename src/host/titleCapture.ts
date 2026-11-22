const dropWord = (s: string): string => s.replace(/\S*\s*$/, '')

export class TitleCapture {
  private line = ''
  private escape = false
  private csi = false
  private osc = false

  constructor(private readonly max = 60) {}

  feed(input: Uint8Array): string | null {
    const text = Buffer.from(input).toString('utf8')
    let sent: string | null = null
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
        if (ch === '\x7f') this.line = dropWord(this.line)
        else if (ch === '[') this.csi = true
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
        if (t.length) sent ??= t.length > this.max ? t.slice(0, this.max - 1) + '…' : t
        continue
      }
      if (ch === '\x7f' || ch === '\b') {
        this.line = this.line.slice(0, -1)
        continue
      }
      if (ch === '\x03' || ch === '\x15') {
        this.line = ''
        continue
      }
      if (ch === '\x17') {
        this.line = dropWord(this.line)
        continue
      }
      if (code < 0x20) continue
      if (this.line.length < 512) this.line += ch
    }

    this.escape = false
    return sent
  }

  get drafting(): boolean {
    return this.line.trim().length > 0
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

const STARTS_OVER = /^\/(clear|new|reset|resume|continue)(\s|$)/i

export function startsOver(line: string): boolean {
  return STARTS_OVER.test(line.trim())
}

export function titleFromLine(line: string, inAgent: boolean): string | null {
  const t = line.trim()
  if (detectAgentFromCommand(t)) return null
  if (!inAgent) return t || null
  if (t.startsWith('/')) return null
  if (t.length < 3 || !/\p{L}{2}/u.test(t)) return null
  return t
}
