import fs from 'node:fs'

let stream: fs.WriteStream | null = null

export function initLog(file: string): void {
  try {
    const st = fs.existsSync(file) ? fs.statSync(file) : null
    if (st && st.size > 2 * 1024 * 1024) fs.truncateSync(file, 0)
    stream = fs.createWriteStream(file, { flags: 'a' })
  } catch {
    stream = null
  }
}

export function log(...parts: unknown[]): void {
  const line = `${new Date().toISOString()} ${parts.map((p) => (typeof p === 'string' ? p : safe(p))).join(' ')}\n`
  if (stream) stream.write(line)
  else process.stderr.write(line)
}

function safe(v: unknown): string {
  if (v instanceof Error) return v.stack || v.message
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}
