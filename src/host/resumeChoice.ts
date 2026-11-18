import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { LaunchSpec } from '@shared/types'

export function claudeConversationExists(id: string, configDir?: string): boolean {
  if (!/^[\w-]+$/.test(id)) return false
  const projects = path.join(configDir || path.join(os.homedir(), '.claude'), 'projects')
  let dirs: string[]
  try {
    dirs = fs.readdirSync(projects)
  } catch {
    return false
  }
  return dirs.some((d) => fs.existsSync(path.join(projects, d, `${id}.jsonl`)))
}

export function startsResumed(launch: LaunchSpec, sessionId: string | undefined, wanted: boolean, exists: (id: string) => boolean): boolean {
  if (!launch.resumeArgs || !sessionId) return false
  if (launch.args.includes('--session-id')) return exists(sessionId)
  return wanted
}

export function conversationFromTranscript(transcriptPath: unknown): string | null {
  if (typeof transcriptPath !== 'string') return null
  const m = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i.exec(transcriptPath)
  return m ? m[1] : null
}

export function latestClaudeConversation(cwd: string, since: number, taken: Set<string>, configDir?: string): string | null {
  const projects = path.join(configDir || path.join(os.homedir(), '.claude'), 'projects')
  const dirs = new Set([cwd.replace(/[^a-zA-Z0-9]/g, '-'), cwd.replace(/[:\\/]/g, '-')])
  let best: { id: string; at: number } | null = null
  for (const d of dirs) {
    let names: string[]
    try {
      names = fs.readdirSync(path.join(projects, d))
    } catch {
      continue
    }
    for (const name of names) {
      const id = conversationFromTranscript(name)
      if (!id || taken.has(id)) continue
      let at: number
      try {
        at = fs.statSync(path.join(projects, d, name)).mtimeMs
      } catch {
        continue
      }
      if (at >= since && (!best || at > best.at)) best = { id, at }
    }
  }
  return best?.id ?? null
}
