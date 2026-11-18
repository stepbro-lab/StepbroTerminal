import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export interface CodexThread {
  id: string
  cwd: string
  startedAt: number
  writtenAt: number
}

export function codexHome(env: Record<string, string | undefined>): string {
  return env['CODEX_HOME'] || path.join(os.homedir(), '.codex')
}

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

export function codexThreadsSince(home: string, since: number, now = Date.now()): CodexThread[] {
  const out: CodexThread[] = []
  const seen = new Set<string>()
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

export function sameFolder(a: string, b: string, platform: NodeJS.Platform = process.platform): boolean {
  const norm = (p: string): string => {
    let r = path.resolve(p)
    try {
      r = fs.realpathSync.native(r)
    } catch {}
    r = r.replace(/[\\/]+$/, '')
    return platform === 'win32' ? r.toLowerCase() : r
  }
  return norm(a) === norm(b)
}

export function justWritten(threads: CodexThread[], cwd: string, taken: Set<string>, now = Date.now(), withinMs = 15_000): string | null {
  const fit = threads.filter((t) => now - t.writtenAt <= withinMs && !taken.has(t.id) && sameFolder(t.cwd, cwd))
  return fit.length === 1 ? fit[0].id : null
}

export function latestSince(threads: CodexThread[], cwd: string, since: number, taken: Set<string>): string | null {
  const fit = threads.filter((t) => t.writtenAt >= since && !taken.has(t.id) && sameFolder(t.cwd, cwd))
  fit.sort((a, b) => b.writtenAt - a.writtenAt)
  return fit[0]?.id ?? null
}
