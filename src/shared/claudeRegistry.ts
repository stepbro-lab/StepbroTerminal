import fs from 'node:fs'
import path from 'node:path'
import type { LiveClaude } from './types'

/** Parses one `~/.claude/sessions/<pid>.json` file written by a running Claude Code process. */
export function parseRegistryEntry(text: string): LiveClaude | null {
  try {
    const j = JSON.parse(text)
    if (typeof j?.pid !== 'number' || typeof j?.sessionId !== 'string' || typeof j?.cwd !== 'string') return null
    return {
      pid: j.pid,
      sessionId: j.sessionId,
      cwd: j.cwd,
      name: typeof j.name === 'string' ? j.name : undefined,
      status: typeof j.status === 'string' ? j.status : undefined,
      updatedAt: typeof j.updatedAt === 'number' ? j.updatedAt : undefined
    }
  } catch {
    return null
  }
}

export function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (e: any) {
    return e?.code === 'EPERM'
  }
}

/** Reads every live entry in the registry directory, dropping stale files whose process is gone. */
export function readRegistry(dir: string): LiveClaude[] {
  let names: string[]
  try {
    names = fs.readdirSync(dir)
  } catch {
    return []
  }
  const out: LiveClaude[] = []
  for (const n of names) {
    if (!n.endsWith('.json')) continue
    let text: string
    try {
      text = fs.readFileSync(path.join(dir, n), 'utf8')
    } catch {
      continue
    }
    const e = parseRegistryEntry(text)
    if (e && pidAlive(e.pid)) out.push(e)
  }
  return out
}
