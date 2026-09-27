/**
 * Streaming parser for the OSC sequences a session's program uses to say where it is: window
 * titles (OSC 0 and 2) and the working directory, as OSC 7 (file://host/path, what posix shells
 * send) or OSC 9;9 (a path, what PowerShell and cmd send, as for Windows Terminal). Each is
 * ESC ] … ended by BEL or ESC \. Feed raw PTY output chunks; each call returns the titles
 * completed in that chunk, and `takeCwd` the last directory reported since it was last asked.
 */
export class OscTitleParser {
  private state: 'text' | 'esc' | 'osc-num' | 'osc-9' | 'osc-body' | 'osc-esc' | 'osc-skip' | 'osc-skip-esc' = 'text'
  private num = ''
  private sub = ''
  /** What the sequence being read carries. */
  private kind: 'title' | 'cwd7' | 'cwd9' = 'title'
  private body = ''
  private cwd: string | null = null

  feed(chunk: Uint8Array): string[] {
    const out: string[] = []
    const text = Buffer.from(chunk).toString('utf8')
    const done = (): void => {
      if (this.kind === 'title') out.push(this.body)
      else {
        const dir = cwdFromOsc(this.kind === 'cwd7' ? 7 : 9, this.body)
        if (dir) this.cwd = dir
      }
      this.state = 'text'
    }
    const begin = (kind: 'title' | 'cwd7' | 'cwd9'): void => {
      this.kind = kind
      this.body = ''
      this.state = 'osc-body'
    }
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
          } else this.state = ch === '\x1b' ? 'esc' : 'text'
          break
        case 'osc-num':
          if (ch >= '0' && ch <= '9') this.num += ch
          else if (ch === ';') {
            if (this.num === '0' || this.num === '2') begin('title')
            else if (this.num === '7') begin('cwd7')
            else if (this.num === '9') {
              this.sub = ''
              this.state = 'osc-9'
            } else this.state = 'osc-skip'
          } else this.state = 'text'
          break
        case 'osc-9':
          // OSC 9 carries several things; 9;9 is the working directory.
          if (ch >= '0' && ch <= '9') this.sub += ch
          else if (ch === ';' && this.sub === '9') begin('cwd9')
          else this.state = ch === '\x07' ? 'text' : ch === '\x1b' ? 'osc-skip-esc' : 'osc-skip'
          break
        case 'osc-body':
          if (ch === '\x07') done()
          else if (ch === '\x1b') this.state = 'osc-esc'
          else if (this.body.length < (this.kind === 'title' ? 256 : 4096)) this.body += ch
          break
        case 'osc-esc':
          if (ch === '\\') done()
          else {
            this.state = 'osc-body'
            if (this.body.length < 4096) this.body += ch
          }
          break
        case 'osc-skip':
          if (ch === '\x07') this.state = 'text'
          else if (ch === '\x1b') this.state = 'osc-skip-esc'
          break
        case 'osc-skip-esc':
          this.state = ch === '\\' ? 'text' : ch === '\x1b' ? 'osc-skip-esc' : 'osc-skip'
          break
      }
    }
    return out
  }

  /** The working directory the program last reported, once: null when nothing new came. */
  takeCwd(): string | null {
    const c = this.cwd
    this.cwd = null
    return c
  }
}

/**
 * A directory out of OSC 7 ("file://host/Users/me/app", percent-encoded, a Windows path as
 * "file://host/C:/Users/me") or OSC 9;9 ("C:\Users\me", quoted or not). Null for anything that is
 * not an absolute path.
 */
export function cwdFromOsc(kind: 7 | 9, raw: string): string | null {
  let p = raw.trim()
  if (kind === 7) {
    const m = /^file:\/\/[^/]*(\/.*)$/i.exec(p)
    if (!m) return null
    p = m[1]
    try {
      p = decodeURIComponent(p)
    } catch {
      /* sent without encoding: taken as it is */
    }
    if (/^\/[A-Za-z]:[\\/]/.test(p)) p = p.slice(1).replace(/\//g, '\\')
  } else {
    if (p.length >= 2 && p.startsWith('"') && p.endsWith('"')) p = p.slice(1, -1)
  }
  if (!p || p.includes('\0')) return null
  return p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p) || p.startsWith('\\\\') ? p : null
}

const BORING = /^(windows powershell|powershell|pwsh|cmd|command prompt|bash|zsh|fish|sh|terminal|administrator: .*|.*: (bash|zsh|fish|sh))$/i

/**
 * Agents prefix their titles with a spinner glyph ("✳ Fix bug", "◑ Thinking") or their initials
 * ("OC | Fix bug"), and Codex turns a braille spinner inside its title ("Fix bug ⠸ | project"),
 * which would rename the session with every frame; the sidebar has its own status mark and shows
 * the agent's logo.
 */
export function stripTitleGlyph(t: string): string {
  return t
    .replace(/\s*[\u2800-\u28ff]+\s*/g, ' ')
    // Codex's blinking mark while it waits on you: "[ . ] Action Required", "[ ! ] Action Required".
    .replace(/^\s*\[\s*[^\]\p{L}\p{N}]{0,3}\s*\]\s*/u, '')
    .replace(/^[^\p{L}\p{N}\s]{1,2}\s+/u, '')
    .replace(/^OC \| /, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** A title without the folder an agent adds after it ("Fix bug | project"): the sidebar already groups sessions by folder. */
export function withoutFolder(title: string, folder: string): string {
  if (!folder) return title
  const tail = ` | ${folder}`
  return title.toLowerCase().endsWith(tail.toLowerCase()) ? title.slice(0, -tail.length).trim() : title
}

const plain = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')

/**
 * An agent's title that only says who it is, or where: OpenCode titles its window "OpenCode",
 * Codex names the folder. Neither tells two sessions apart, so the first prompt names the session instead.
 */
export function isOwnNameTitle(title: string, agent: string | string[], folder: string): boolean {
  const t = plain(title)
  if (!t) return true
  // Any name the agent goes by: its preset, and for a preset of your own, what it runs.
  for (const name of Array.isArray(agent) ? agent : [agent]) {
    const a = plain(name)
    if (a && [a, `${a}code`, `${a}cli`, `${a}agent`].some((n) => n === t || n === `${t}code` || n === `${t}cli` || n === `${t}agent`)) return true
  }
  // Codex's stand-in while it thinks of a name for the thread, and what it shows while it waits on
  // you: a state, which the sidebar shows by itself, not a name.
  if (t === 'renaming' || t === 'actionrequired') return true
  const f = plain(folder)
  return !!f && t === f
}

/** Titles that shells emit by default and that would make a poor session name. */
export function isBoringTitle(t: string): boolean {
  const s = t.trim()
  if (!s) return true
  if (BORING.test(s)) return true
  if (/^[A-Za-z]:\\/.test(s) || s.startsWith('/') || s.startsWith('~')) return true
  return false
}

/** What runs a package by name, which is then the program's name: npx, bunx, pnpm dlx, uvx. */
const RUNNERS = new Set(['npx', 'bunx', 'pnpx', 'uvx', 'pipx', 'pnpm', 'yarn', 'bun'])

/**
 * The names a session's program goes by, for telling its own name apart from a title: the agent,
 * the command it launches, and the package a runner starts ("npx -y clyra-cli@1.0" runs clyra-cli).
 * Other arguments stay out: one of them may be the prompt itself.
 */
export function namesOf(agent: string, command: string, args: readonly string[] = []): string[] {
  const base = (s: string): string => s.split(/[\\/]/).pop()!.replace(/\.(exe|cmd|bat|ps1)$/i, '')
  const names = [agent, base(command)]
  if (RUNNERS.has(base(command).toLowerCase())) {
    const pkg = args.find((a) => !a.startsWith('-') && !['dlx', 'x', 'exec', 'run'].includes(a))
    if (pkg && /^[\w@./-]+$/.test(pkg)) names.push(base(pkg.replace(/(.)@[^/]*$/, '$1')))
  }
  return names.filter(Boolean)
}
