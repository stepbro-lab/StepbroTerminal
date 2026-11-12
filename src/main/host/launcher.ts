import { spawn } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { hostInfoPath, stepDir } from '@shared/paths'
import { encodeFrame, FrameParser, type HostMsg } from '@shared/protocol'
import type { HostInfo } from '@shared/types'

export interface EnsureHostOpts {
  version: string
  entry: string
  env: NodeJS.ProcessEnv
  log: (...a: unknown[]) => void
  /**
   * A host from another version has agents at work, this many: whether to leave it running for now
   * rather than restart it, which would stop them mid-turn. Not asked when none is working.
   */
  keepBusyHost?: (working: number, version: string) => Promise<boolean>
}

/** How many of a host's sessions are in the middle of something: a turn, or a question to the person. 0 when it does not say. */
export function workingSessions(socketPath: string, timeoutMs = 1500): Promise<number> {
  return new Promise((resolve) => {
    let done = false
    const s = net.connect(socketPath)
    const finish = (n: number): void => {
      if (done) return
      done = true
      s.destroy()
      resolve(n)
    }
    const parser = new FrameParser()
    parser.onFrame = (msg: HostMsg) => {
      if (msg.t === 'sessions') finish(msg.sessions.filter((x) => x.alive && (x.status === 'working' || x.status === 'attention')).length)
    }
    s.once('connect', () => s.write(encodeFrame({ t: 'hello', version: 'probe' })))
    s.on('data', (d) => parser.push(d))
    s.once('error', () => finish(0))
    setTimeout(() => finish(0), timeoutMs)
  })
}

function readInfo(): HostInfo | null {
  try {
    const j = JSON.parse(fs.readFileSync(hostInfoPath(), 'utf8'))
    if (typeof j?.socketPath === 'string' && typeof j?.pid === 'number') return j as HostInfo
  } catch {
    /* missing or corrupt */
  }
  return null
}

export function probe(socketPath: string, timeoutMs = 800): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false
    const finish = (v: boolean): void => {
      if (done) return
      done = true
      s.destroy()
      resolve(v)
    }
    const s = net.connect(socketPath)
    s.once('connect', () => finish(true))
    s.once('error', () => finish(false))
    setTimeout(() => finish(false), timeoutMs)
  })
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** The first lines the host wrote to stderr before dying: the message sits at the top of a Node stack trace. */
function stderrTail(file: string): string {
  try {
    const lines = fs
      .readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.trim())
    return lines.length ? '\n' + lines.slice(0, 6).join('\n') : ''
  } catch {
    return ''
  }
}

/** Returns a reachable host, spawning a detached one when needed. */
export async function ensureHost(opts: EnsureHostOpts): Promise<HostInfo> {
  const existing = readInfo()
  if (existing && (await probe(existing.socketPath))) {
    if (existing.version === opts.version) return existing
    // A host from an older build is still running and would serve the new app its old code
    // (this is exactly how a fixed bug can seem unfixed after an update). Retire it and start fresh.
    const working = opts.keepBusyHost ? await workingSessions(existing.socketPath) : 0
    if (working && (await opts.keepBusyHost!(working, existing.version))) {
      opts.log(`host ${existing.version} is stale, app is ${opts.version}; kept, ${working} at work`)
      return existing
    }
    opts.log(`host ${existing.version} is stale, app is ${opts.version}; restarting the host`)
    await requestHostShutdown()
    const gone = Date.now()
    while (Date.now() - gone < 4000 && (await probe(existing.socketPath, 300))) await sleep(150)
  }
  fs.mkdirSync(stepDir(), { recursive: true })
  opts.log('spawning host', opts.entry)
  // Whatever the host prints before dying lands in host.err, so a failed start can say why.
  const errPath = path.join(stepDir(), 'host.err')
  let errFd: number | undefined
  try {
    errFd = fs.openSync(errPath, 'w')
  } catch {
    errFd = undefined
  }
  const child = spawn(process.execPath, [opts.entry], {
    detached: true,
    stdio: ['ignore', 'ignore', errFd ?? 'ignore'],
    windowsHide: true,
    cwd: stepDir(),
    env: {
      ...opts.env,
      ...(process.env['STEP_HOME'] ? { STEP_HOME: process.env['STEP_HOME'] } : {}),
      ELECTRON_RUN_AS_NODE: '1',
      STEP_VERSION: opts.version
    }
  })
  child.unref()
  if (errFd !== undefined) fs.closeSync(errFd)
  const startedAt = Date.now()
  let lastErr: unknown
  while (Date.now() - startedAt < 10_000) {
    await sleep(100)
    const info = readInfo()
    if (info && (info.pid === child.pid || info.version === opts.version) && (await probe(info.socketPath))) return info
    if (child.exitCode !== null && child.exitCode !== 0) {
      lastErr = new Error(`host exited with code ${child.exitCode}${stderrTail(errPath)}`)
      break
    }
  }
  // The child may have exited because another host won the race; try once more.
  const again = readInfo()
  if (again && (await probe(again.socketPath))) return again
  throw lastErr instanceof Error ? lastErr : new Error('host did not start in time')
}

export async function requestHostShutdown(): Promise<void> {
  const info = readInfo()
  if (!info) return
  await new Promise<void>((resolve) => {
    const s = net.connect(info.socketPath)
    const json = Buffer.from(JSON.stringify({ t: 'shutdown' }))
    const frame = Buffer.alloc(8 + json.length)
    frame.writeUInt32BE(json.length, 0)
    frame.writeUInt32BE(0, 4)
    json.copy(frame, 8)
    s.once('connect', () => s.end(frame))
    s.once('close', () => resolve())
    s.once('error', () => resolve())
    setTimeout(() => {
      s.destroy()
      resolve()
    }, 1500)
  })
}
