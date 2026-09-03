/**
 * Streaming parser for OSC 0/2 window-title sequences: ESC ] 0 ; title BEL  (or ESC \ terminator).
 * Feed raw PTY output chunks; returns the titles completed in that chunk.
 */
export class OscTitleParser {
  private state: 'text' | 'esc' | 'osc-num' | 'osc-title' | 'osc-esc' = 'text'
  private num = ''
  private title = ''

  feed(chunk: Uint8Array): string[] {
    const out: string[] = []
    const text = Buffer.from(chunk).toString('utf8')
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]
      switch (this.state) {
        case 'text':
          if (ch === '\x1b') this.state = 'esc'
          break
        case 'esc':
          if (ch === ']') {
            this.state = 'osc-num'
            this.num = ''
          } else this.state = 'text'
          break
        case 'osc-num':
          if (ch >= '0' && ch <= '9') this.num += ch
          else if (ch === ';') {
            if (this.num === '0' || this.num === '2') {
              this.state = 'osc-title'
              this.title = ''
            } else this.state = 'osc-skip' as any
          } else this.state = 'text'
          break
        case 'osc-title':
          if (ch === '\x07') {
            out.push(this.title)
            this.state = 'text'
          } else if (ch === '\x1b') this.state = 'osc-esc'
          else if (this.title.length < 256) this.title += ch
          break
        case 'osc-esc':
          if (ch === '\\') {
            out.push(this.title)
            this.state = 'text'
          } else {
            this.state = 'osc-title'
            if (this.title.length < 256) this.title += ch
          }
          break
        default:
          // osc-skip: consume until BEL or ST
          if (ch === '\x07') this.state = 'text'
          else if (ch === '\x1b') this.state = 'osc-skip-esc' as any
          else if ((this.state as string) === 'osc-skip-esc') this.state = ch === '\\' ? 'text' : ('osc-skip' as any)
      }
    }
    return out
  }
}

const BORING = /^(windows powershell|powershell|pwsh|cmd|command prompt|bash|zsh|fish|sh|terminal|administrator: .*|.*: (bash|zsh|fish|sh))$/i

/** Agents prefix their titles with a spinner glyph ("✳ Fix bug", "◑ Thinking"); the sidebar has its own status mark. */
export function stripTitleGlyph(t: string): string {
  return t.replace(/^[^\p{L}\p{N}\s]{1,2}\s+/u, '').trim()
}

/** Titles that shells emit by default and that would make a poor session name. */
export function isBoringTitle(t: string): boolean {
  const s = t.trim()
  if (!s) return true
  if (BORING.test(s)) return true
  if (/^[A-Za-z]:\\/.test(s) || s.startsWith('/') || s.startsWith('~')) return true
  return false
}
