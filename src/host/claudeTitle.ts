import fs from 'node:fs'

export interface ConversationTitle {
  custom?: string
  ai?: string
}

const MARKERS = ['"ai-title"', '"custom-title"']
const CHUNK = 1 << 20

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

export class TranscriptTitles {
  private files = new Map<string, { offset: number; rest: string; title: ConversationTitle }>()
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

  forget(file: string): void {
    this.files.delete(file)
    this.queue.delete(file)
  }
}
