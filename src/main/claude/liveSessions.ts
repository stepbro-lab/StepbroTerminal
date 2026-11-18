import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import { readRegistry } from '@shared/claudeRegistry'
import type { LiveClaude } from '@shared/types'

export class LiveClaudeWatcher extends EventEmitter {
  private entries: LiveClaude[] = []
  private watcher: fs.FSWatcher | null = null
  private timer: NodeJS.Timeout | null = null

  constructor(private readonly dir: string) {
    super()
  }

  start(): void {
    this.scan()
    try {
      fs.mkdirSync(this.dir, { recursive: true })
      this.watcher = fs.watch(this.dir, { persistent: false }, () => this.schedule())
    } catch {}
  }

  stop(): void {
    this.watcher?.close()
    this.watcher = null
    if (this.timer) clearTimeout(this.timer)
  }

  list(): LiveClaude[] {
    return this.entries
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      this.scan()
    }, 300)
  }

  private scan(): void {
    const next = readRegistry(this.dir)
    const changed = JSON.stringify(next) !== JSON.stringify(this.entries)
    this.entries = next
    if (changed) this.emit('update', next)
  }
}
