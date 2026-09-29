import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Codex's conversations, as it saves them: one file per conversation under
 * <CODEX_HOME>/sessions/YYYY/MM/DD/rollout-<time>-<id>.jsonl, the first line of which says the
 * conversation's id, the folder it was started in and when. `codex resume <id>` picks one up.
 *
 * Nothing here is told which conversation a session is in; stepbro passes Codex no hooks and
 * leaves its configuration alone. So the conversation is recognised by where and when it was
 * written: the one in the session's folder that was written as the session finished a turn.
 */

export interface CodexThread {
  id: string
  cwd: string
  /** When the conversation began. */
  startedAt: number
  /** When its file was last written: the last turn. */
  writtenAt: number
}

export function codexHome(env: Record<string, string | undefined>): string {
  return env['CODEX_HOME'] || path.join(os.homedir(), '.codex')
}

/** How much of a file is read for its first line's id, folder and time; they come first in it. */
const HEAD_BYTES = 8192

function head(file: string): string {
  let fd: number | undefined
  try {
    fd = fs.openSync(file, 'r')
    const buf = Buffer.alloc(HEAD_BYTES)
    const n = fs.readSync(fd, buf, 0, HEAD_BYTES, 0)
    return buf.subarray(0, n).toString('utf8')
  } catch {
    return ''
  } finally {
    if (fd !== undefined) fs.closeSync(fd)
  }
}

/** The id, folder and start of a conversation, out of the first line of its file. */
export function readThreadHead(text: string): Omit<CodexThread, 'writtenAt'> | null {
  const line = text.split('\n')[0]
  if (!/"type"\s*:\s*"session_meta"/.test(line)) return null
  const str = (key: string): string | undefined => {
    const m = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(line)
    if (!m) return undefined
    try {
      return JSON.parse(`"${m[1]}"`) as string
    } catch {
      return undefined
    }
  }
  const id = str('id') ?? str('session_id')
  const cwd = str('cwd')
  const started = Date.parse(str('timestamp') ?? '')
  if (!id || !cwd) return null
  return { id, cwd, startedAt: Number.isFinite(started) ? started : 0 }
}

const pad = (n: number): string => String(n).padStart(2, '0')

/** Conversations written since `since`, looking only in the day folders that can hold them. */
export function codexThreadsSince(home: string, since: number, now = Date.now()): CodexThread[] {
  const out: CodexThread[] = []
  const seen = new Set<string>()
  // The folders are named by the local date the conversation began: a day either side covers the
  // time zones and a conversation that began before `since` and is still being written.
  for (let t = since - 86_400_000; t <= now + 86_400_000; t += 86_400_000) {
    const d = new Date(t)
    const dir = path.join(home, 'sessions', String(d.getFullYear()), pad(d.getMonth() + 1), pad(d.getDate()))
    if (seen.has(dir)) continue
    seen.add(dir)
    let names: string[]
    try {
      names = fs.readdirSync(dir)
    } catch {
      continue
    }
    for (const name of names) {
      if (!name.startsWith('rollout-') || !name.endsWith('.jsonl')) continue
      const file = path.join(dir, name)
      let writtenAt: number
      try {
        writtenAt = fs.statSync(file).mtimeMs
      } catch {
        continue
      }
      if (writtenAt < since) continue
      const meta = readThreadHead(head(file))
      if (meta) out.push({ ...meta, writtenAt })
    }
  }
  return out
}

/** One folder, however it was written: resolved, links followed, and without case on Windows. */
export function sameFolder(a: string, b: string, platform: NodeJS.Platform = process.platform): boolean {
  const norm = (p: string): string => {
    let r = path.resolve(p)
    try {
      r = fs.realpathSync.native(r)
    } catch {
      /* gone: as written */
    }
    r = r.replace(/[\\/]+$/, '')
    return platform === 'win32' ? r.toLowerCase() : r
  }
  return norm(a) === norm(b)
}

/**
 * The conversation a session just wrote, as it finished a turn: in its folder, written in the last
 * few seconds, and not one another session already has. Null when there is none, or when two
 * would fit and there is no telling which.
 */
export function justWritten(threads: CodexThread[], cwd: string, taken: Set<string>, now = Date.now(), withinMs = 15_000): string | null {
  const fit = threads.filter((t) => now - t.writtenAt <= withinMs && !taken.has(t.id) && sameFolder(t.cwd, cwd))
  return fit.length === 1 ? fit[0].id : null
}

/**
 * The conversation to pick back up when nothing was caught as it happened: the one most lately
 * written in the session's folder since the session was made, and not another session's. Null when
 * the session never wrote one: Codex saves nothing until it is sent a prompt, and there is then
 * nothing to resume.
 */
export function latestSince(threads: CodexThread[], cwd: string, since: number, taken: Set<string>): string | null {
  const fit = threads.filter((t) => t.writtenAt >= since && !taken.has(t.id) && sameFolder(t.cwd, cwd))
  fit.sort((a, b) => b.writtenAt - a.writtenAt)
  return fit[0]?.id ?? null
}
