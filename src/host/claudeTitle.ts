import fs from 'node:fs'

/**
 * The name Claude Code gives a conversation, read from the transcript it writes. A few seconds
 * after the first prompt it adds an "ai-title" record, a summary of a few words ("Status line
 * mejora" for "necesito que mejores mi status line mas bonita…"), and a /rename adds a
 * "custom-title". Either names a session far better than the first prompt cut down to fit.
 */
export interface ConversationTitle {
  /** What the person called it inside Claude, with /rename. */
  custom?: string
  /** What Claude called it. */
  ai?: string
}

const MARKERS = ['"ai-title"', '"custom-title"']
/** Read this much at a time: a long conversation's transcript runs to tens of megabytes. */
const CHUNK = 1 << 20

/** The title a transcript line carries, if it is one of the two records that name the conversation. */
export function titleRecord(line: string): { kind: 'ai' | 'custom'; title: string } | null {
  if (!MARKERS.some((m) => line.includes(m))) return null
  let d: unknown
  try {
    d = JSON.parse(line)
  } catch {
    return null
  }
  const r = d as { type?: unknown; aiTitle?: unknown; customTitle?: unknown }
  const clean = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.replace(/\s+/g, ' ').trim().slice(0, 80) : null)
  if (r.type === 'ai-title') {
    const t = clean(r.aiTitle)
    return t ? { kind: 'ai', title: t } : null
  }
  if (r.type === 'custom-title') {
    const t = clean(r.customTitle)
    return t ? { kind: 'custom', title: t } : null
  }
  return null
}

/**
 * Follows transcripts as they grow, reading each byte once: what was read stays read, and every
 * call only looks at what was written since. A file that got shorter was rewritten, and is read
 * again from the start.
 */
export class TranscriptTitles {
  private files = new Map<string, { offset: number; rest: string; title: ConversationTitle }>()
  /** One read of a file at a time: two at once would each take the same bytes as theirs. */
  private queue = new Map<string, Promise<ConversationTitle>>()

  read(file: string): Promise<ConversationTitle> {
    const prev = this.queue.get(file) ?? Promise.resolve({})
    const next = prev.then(
      () => this.readNow(file),
      () => this.readNow(file)
    )
    this.queue.set(file, next)
    return next
  }

  private async readNow(file: string): Promise<ConversationTitle> {
    let f = this.files.get(file)
    if (!f) {
      f = { offset: 0, rest: '', title: {} }
      this.files.set(file, f)
    }
    let size: number
    try {
      size = (await fs.promises.stat(file)).size
    } catch {
      return f.title
    }
    if (size < f.offset) {
      f.offset = 0
      f.rest = ''
      f.title = {}
    }
    if (size === f.offset) return f.title
    const fh = await fs.promises.open(file, 'r')
    try {
      const buf = Buffer.allocUnsafe(CHUNK)
      while (f.offset < size) {
        const { bytesRead } = await fh.read(buf, 0, Math.min(CHUNK, size - f.offset), f.offset)
        if (bytesRead <= 0) break
        f.offset += bytesRead
        const lines = (f.rest + buf.toString('utf8', 0, bytesRead)).split('\n')
        f.rest = lines.pop() ?? ''
        // A partial line longer than any record that names the conversation is never one of them.
        if (f.rest.length > 4096 && !MARKERS.some((m) => f!.rest.includes(m))) f.rest = ''
        for (const line of lines) {
          const r = titleRecord(line)
          if (r) f.title = { ...f.title, [r.kind]: r.title }
        }
      }
    } finally {
      await fh.close()
    }
    return f.title
  }

  /** A conversation no session follows any more. */
  forget(file: string): void {
    this.files.delete(file)
    this.queue.delete(file)
  }
}
