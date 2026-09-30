import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { LaunchSpec } from '@shared/types'

/**
 * Whether Claude Code has a conversation saved under this id, in any project: it only writes one
 * once it is sent a prompt, and it finds one wherever it is resumed from. `configDir` is the
 * session's CLAUDE_CONFIG_DIR when it sets one.
 */
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

/**
 * Whether a session starts by picking its conversation up or as a new one. Claude Code is told
 * which id to use either way, and each way fails on the wrong side of its first prompt: resuming
 * an id it never saved says "No conversation found with session ID", and starting over with an id
 * it has saved says "Session ID … is already in use". So for an agent launched with an id of our
 * choosing, what is on disk decides. The rest resume whenever they are asked to and can.
 */
export function startsResumed(launch: LaunchSpec, sessionId: string | undefined, wanted: boolean, exists: (id: string) => boolean): boolean {
  if (!launch.resumeArgs || !sessionId) return false
  if (launch.args.includes('--session-id')) return exists(sessionId)
  return wanted
}

/**
 * The conversation a Claude Code hook speaks for, out of the transcript it names. Every hook carries
 * `transcript_path`, the file Claude is writing; after a /resume inside Claude that is the resumed
 * conversation's file, whatever id the process was started with. Null when it names none.
 */
export function conversationFromTranscript(transcriptPath: unknown): string | null {
  if (typeof transcriptPath !== 'string') return null
  const m = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i.exec(transcriptPath)
  return m ? m[1] : null
}

/**
 * The Claude Code conversation last written in a folder since `since`, not one of `taken`: what a
 * session was in when the id it kept has no conversation behind it. Claude keeps a folder's
 * conversations under projects/<the folder, every other character a dash>. Null when there is none.
 */
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
