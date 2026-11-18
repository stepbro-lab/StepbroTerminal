import { execFile } from 'node:child_process'

export interface ProcInfo {
  pid: number
  ppid: number
  rss: number
  cpu: number
}

const WIN_CMD =
  'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId) $($_.ParentProcessId) $($_.WorkingSetSize) $($_.KernelModeTime + $_.UserModeTime)" }'

export function readProcesses(platform: NodeJS.Platform = process.platform): Promise<Map<number, ProcInfo>> {
  if (platform === 'win32') return run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', WIN_CMD]).then(parseWindows)
  return run('ps', ['-axo', 'pid=,ppid=,rss=,time=']).then(parsePs)
}

function run(file: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile(file, args, { windowsHide: true, timeout: 10_000, maxBuffer: 16 * 1024 * 1024 }, (err, stdout) => resolve(err ? '' : stdout))
  })
}

export function parseWindows(text: string): Map<number, ProcInfo> {
  const map = new Map<number, ProcInfo>()
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$/.exec(line)
    if (m) map.set(Number(m[1]), { pid: Number(m[1]), ppid: Number(m[2]), rss: Number(m[3]), cpu: Number(m[4]) / 1e7 })
  }
  return map
}

export function parsePs(text: string): Map<number, ProcInfo> {
  const map = new Map<number, ProcInfo>()
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s*$/.exec(line)
    if (m) map.set(Number(m[1]), { pid: Number(m[1]), ppid: Number(m[2]), rss: Number(m[3]) * 1024, cpu: parseCpuTime(m[4]) })
  }
  return map
}

export function parseCpuTime(text: string): number {
  let rest = text.trim()
  let days = 0
  const dash = rest.indexOf('-')
  if (dash > 0) {
    days = Number(rest.slice(0, dash))
    rest = rest.slice(dash + 1)
  }
  const parts = rest.split(':').map(Number)
  if (!parts.length || parts.some((n) => !Number.isFinite(n)) || !Number.isFinite(days)) return 0
  let s = 0
  for (const n of parts) s = s * 60 + n
  return days * 86400 + s
}

export function processChildren(procs: Map<number, ProcInfo>): Map<number, ProcInfo[]> {
  const children = new Map<number, ProcInfo[]>()
  for (const p of procs.values()) {
    if (p.pid === p.ppid) continue
    const arr = children.get(p.ppid)
    if (arr) arr.push(p)
    else children.set(p.ppid, [p])
  }
  return children
}

export function subtree(procs: Map<number, ProcInfo>, root: number, children = processChildren(procs)): ProcInfo[] {
  const out: ProcInfo[] = []
  const seen = new Set<number>()
  const stack = [root]
  while (stack.length) {
    const pid = stack.pop()!
    if (seen.has(pid)) continue
    seen.add(pid)
    const p = procs.get(pid)
    if (p) out.push(p)
    for (const c of children.get(pid) ?? []) stack.push(c.pid)
  }
  return out
}

export class CpuMeter {
  private last = new Map<number, { cpu: number; at: number }>()

  rate(p: ProcInfo, now: number): number {
    const prev = this.last.get(p.pid)
    this.last.set(p.pid, { cpu: p.cpu, at: now })
    if (!prev || now <= prev.at || p.cpu < prev.cpu) return 0
    return ((p.cpu - prev.cpu) / ((now - prev.at) / 1000)) * 100
  }

  keepOnly(pids: Set<number>): void {
    for (const pid of this.last.keys()) if (!pids.has(pid)) this.last.delete(pid)
  }
}
