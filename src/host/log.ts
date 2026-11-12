import fs from 'node:fs'

const MAX_BYTES = 2 * 1024 * 1024

let stream: fs.WriteStream | null = null
let path = ''
let written = 0

export function initLog(file: string): void {
  path = file
  try {
    const st = fs.existsSync(file) ? fs.statSync(file) : null
    written = st?.size ?? 0
    if (written > MAX_BYTES) startOver()
    else stream = fs.createWriteStream(file, { flags: 'a' })
  } catch {
    stream = null
  }
}

/** The log begins again, empty: a host lives for weeks, and its log must not grow all that time. */
function startOver(): void {
  stream?.end()
  written = 0
  try {
    stream = fs.createWriteStream(path, { flags: 'w' })
  } catch {
    stream = null
  }
}

export function log(...parts: unknown[]): void {
  const line = `${new Date().toISOString()} ${parts.map((p) => (typeof p === 'string' ? p : safe(p))).join(' ')}\n`
  if (!stream) {
    process.stderr.write(line)
    return
  }
  written += line.length
  if (written > MAX_BYTES) startOver()
  stream?.write(line)
}

function safe(v: unknown): string {
  if (v instanceof Error) return v.stack || v.message
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}
