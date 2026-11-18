import { execFile } from 'node:child_process'
import fs from 'node:fs'
import { mapLimit } from '@shared/async'

export function processTable(platform: NodeJS.Platform = process.platform): Promise<Map<number, number>> {
  if (platform === 'win32') return winTable()
  if (platform === 'linux') return procTable()
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

async function procTable(): Promise<Map<number, number>> {
  const map = new Map<number, number>()
  let names: string[] = []
  try {
    names = await fs.promises.readdir('/proc')
  } catch {
    return map
  }
  await mapLimit(names.filter((n) => /^\d+$/.test(n)), 16, async (n) => {
    try {
      const stat = await fs.promises.readFile(`/proc/${n}/stat`, 'utf8')
      const after = stat.slice(stat.lastIndexOf(')') + 2)
      const ppid = Number(after.split(' ')[1])
      if (Number.isFinite(ppid)) map.set(Number(n), ppid)
    } catch {}
  })
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
