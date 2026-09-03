import { execFile } from 'node:child_process'
import fs from 'node:fs'

/** Returns a pid -> parent pid table for every process visible to this user. */
export function processTable(platform: NodeJS.Platform = process.platform): Promise<Map<number, number>> {
  if (platform === 'win32') return winTable()
  if (platform === 'linux') return Promise.resolve(procTable())
  return psTable()
}

function winTable(): Promise<Map<number, number>> {
  return new Promise((resolve) => {
    const cmd = 'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId) $($_.ParentProcessId)" }'
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', cmd],
      { windowsHide: true, timeout: 8000, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout) => resolve(err ? new Map() : parsePairs(stdout))
    )
  })
}

function psTable(): Promise<Map<number, number>> {
  return new Promise((resolve) => {
    execFile('ps', ['-axo', 'pid=,ppid='], { timeout: 8000, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) =>
      resolve(err ? new Map() : parsePairs(stdout))
    )
  })
}

function procTable(): Map<number, number> {
  const map = new Map<number, number>()
  let names: string[] = []
  try {
    names = fs.readdirSync('/proc')
  } catch {
    return map
  }
  for (const n of names) {
    if (!/^\d+$/.test(n)) continue
    try {
      const stat = fs.readFileSync(`/proc/${n}/stat`, 'utf8')
      const after = stat.slice(stat.lastIndexOf(')') + 2)
      const ppid = Number(after.split(' ')[1])
      if (Number.isFinite(ppid)) map.set(Number(n), ppid)
    } catch {
      /* process vanished */
    }
  }
  return map
}

export function parsePairs(text: string): Map<number, number> {
  const map = new Map<number, number>()
  for (const line of text.split(/\r?\n/)) {
    const m = line.trim().match(/^(\d+)\s+(\d+)$/)
    if (m) map.set(Number(m[1]), Number(m[2]))
  }
  return map
}

/** Walks up from `pid` and returns the first ancestor contained in `candidates`, or null. */
export function findAncestor(table: Map<number, number>, pid: number, candidates: Set<number>): number | null {
  let cur = pid
  for (let i = 0; i < 64; i++) {
    if (candidates.has(cur)) return cur
    const parent = table.get(cur)
    if (parent === undefined || parent === cur || parent <= 0) return null
    cur = parent
  }
  return null
}
