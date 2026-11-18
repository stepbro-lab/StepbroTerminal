import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import type { HistorySession } from '@shared/types'

export function parseHistoryLines(text: string, into: Map<string, HistorySession>): void {
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    let j: any
    try {
      j = JSON.parse(line)
    } catch {
      continue
    }
    const sessionId = j?.sessionId
    const project = j?.project
    const display = typeof j?.display === 'string' ? j.display : ''
    const ts = typeof j?.timestamp === 'number' ? j.timestamp : 0
    if (typeof sessionId !== 'string' || typeof project !== 'string') continue
    const cur = into.get(sessionId)
    if (!cur) {
      into.set(sessionId, {
        sessionId,
        projectPath: project,
        title: cleanTitle(display),
        firstAt: ts,
        lastAt: ts,
        prompts: 1
      })
      continue
    }
    cur.prompts += 1
    if (ts > cur.lastAt) cur.lastAt = ts
    if (ts && (!cur.firstAt || ts < cur.firstAt)) cur.firstAt = ts
    if ((!cur.title || cur.title.startsWith('/')) && display && !display.startsWith('/')) cur.title = cleanTitle(display)
  }
}

function cleanTitle(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > 120 ? t.slice(0, 119) + '…' : t
}

export class HistoryIndex extends EventEmitter {
  private map = new Map<string, HistorySession>()
  private offset = 0
  private watcher: fs.FSWatcher | null = null
  private timer: NodeJS.Timeout | null = null
  private partial = ''

  constructor(private readonly file: string) {
    super()
  }

  start(): void {
    this.readNew()
    try {
      this.watcher = fs.watch(this.file, { persistent: false }, () => this.schedule())
    } catch {
      try {
        const dir = this.file.replace(/[\\/][^\\/]+$/, '')
        this.watcher = fs.watch(dir, { persistent: false }, (_e, name) => {
          if (name === 'history.jsonl') this.schedule()
        })
      } catch {}
    }
  }

  stop(): void {
    this.watcher?.close()
    this.watcher = null
    if (this.timer) clearTimeout(this.timer)
  }

  sessions(): HistorySession[] {
    return [...this.map.values()]
  }

  projects(): string[] {
    return [...new Set(this.sessions().map((s) => s.projectPath))]
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      this.readNew()
    }, 500)
  }

  private readNew(): void {
    let st: fs.Stats
    try {
      st = fs.statSync(this.file)
    } catch {
      return
    }
    if (st.size < this.offset) {
      this.map.clear()
      this.offset = 0
      this.partial = ''
    }
    if (st.size === this.offset) return
    const fd = fs.openSync(this.file, 'r')
    try {
      const len = st.size - this.offset
      const buf = Buffer.allocUnsafe(len)
      fs.readSync(fd, buf, 0, len, this.offset)
      this.offset = st.size
      const text = this.partial + buf.toString('utf8')
      const lastNl = text.lastIndexOf('\n')
      const complete = lastNl >= 0 ? text.slice(0, lastNl + 1) : ''
      this.partial = lastNl >= 0 ? text.slice(lastNl + 1) : text
      if (complete) {
        parseHistoryLines(complete, this.map)
        this.emit('update', this.sessions())
      }
    } finally {
      fs.closeSync(fd)
    }
  }
}
