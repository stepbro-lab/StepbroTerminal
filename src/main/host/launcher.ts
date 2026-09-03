import { spawn } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import { hostInfoPath, stepDir } from '@shared/paths'
import type { HostInfo } from '@shared/types'

export interface EnsureHostOpts {
  version: string
  entry: string
  env: NodeJS.ProcessEnv
  log: (...a: unknown[]) => void
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

/** Returns a reachable host, spawning a detached one when needed. */
export async function ensureHost(opts: EnsureHostOpts): Promise<HostInfo> {
  const existing = readInfo()
  if (existing && (await probe(existing.socketPath))) {
    if (existing.version !== opts.version) opts.log(`host version ${existing.version} differs from app ${opts.version}`)
    return existing
  }
  fs.mkdirSync(stepDir(), { recursive: true })
  opts.log('spawning host', opts.entry)
  const child = spawn(process.execPath, [opts.entry], {
    detached: true,
    stdio: 'ignore',
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
  const startedAt = Date.now()
  let lastErr: unknown
  while (Date.now() - startedAt < 10_000) {
    await sleep(100)
    const info = readInfo()
    if (info && (info.pid === child.pid || info.version === opts.version) && (await probe(info.socketPath))) return info
    if (child.exitCode !== null && child.exitCode !== 0) {
      lastErr = new Error(`host exited with code ${child.exitCode}`)
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
