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
    // An escape sequence arrives whole; an ESC ending what was typed is the Escape key, pressed on
    // its own, and the next key is a key of its own too.
    this.escape = false
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

/** What an agent is told to start a conversation over: the title the old one gave no longer fits. */
const STARTS_OVER = /^\/(clear|new|reset|resume|continue)(\s|$)/i

/** Whether a line typed into an agent leaves the conversation it names behind. */
export function startsOver(line: string): boolean {
  return STARTS_OVER.test(line.trim())
}

/**
 * The title a typed line gives a session still without one, or null when it names nothing. In an
 * agent, the first prompt names the session: not the command that launched the agent, not a
 * slash command, not the answer to one of its menus ("1", "y"). A shell's first command names it.
 */
export function titleFromLine(line: string, inAgent: boolean): string | null {
  const t = line.trim()
  if (detectAgentFromCommand(t)) return null
  if (!inAgent) return t || null
  if (t.startsWith('/')) return null
  // A menu answer or a keystroke: too short, or no word in it.
  if (t.length < 3 || !/\p{L}{2}/u.test(t)) return null
  return t
}
