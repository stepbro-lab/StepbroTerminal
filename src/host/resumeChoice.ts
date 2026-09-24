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
