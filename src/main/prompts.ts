import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import type { PromptRecord } from '@shared/types'
import { writeFileAtomic } from '@shared/atomic'

const MAX = 2000

/** Append-only log of prompts sent to agents, newest last, capped and deduplicated for the palette. */
export class PromptLog {
  private items: PromptRecord[] = []
  private file = path.join(app.getPath('userData'), 'prompts.jsonl')

  load(): void {
    try {
      const lines = fs.readFileSync(this.file, 'utf8').split('\n')
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const r = JSON.parse(line) as PromptRecord
          if (typeof r?.text === 'string' && typeof r?.ts === 'number') this.items.push(r)
        } catch {
          /* skip bad line */
        }
      }
      const read = this.items.length
      if (this.items.length > MAX) this.items = this.items.slice(-MAX)
      // The file only ever grows; once it holds twice what is kept, it is cut back to that.
      if (read > MAX * 2) writeFileAtomic(this.file, this.items.map((r) => JSON.stringify(r)).join('\n') + '\n')
    } catch {
      /* first run */
    }
  }

  add(r: PromptRecord): void {
    this.items.push(r)
    if (this.items.length > MAX) this.items = this.items.slice(-MAX)
    try {
      fs.appendFileSync(this.file, JSON.stringify(r) + '\n')
    } catch {
      /* non-fatal */
    }
  }

  /** Newest first, one entry per distinct text. */
  list(): PromptRecord[] {
    const seen = new Set<string>()
    const out: PromptRecord[] = []
    for (let i = this.items.length - 1; i >= 0; i--) {
      const r = this.items[i]
      const key = r.text.trim()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(r)
    }
    return out
  }
}
