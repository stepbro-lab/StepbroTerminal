import fs from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { claudeDir, hostInfoPath, hostLogPath, hostSocketPath, stepDir } from '@shared/paths'
import { readRegistry } from '@shared/claudeRegistry'
import type { HostInfo } from '@shared/types'
import { SessionManager } from './SessionManager'
import { HostServer } from './HostServer'
import { HookServer } from './HookServer'
import { writeShims } from './launch'
import { prepareSpawnHelper } from './ptyHelper'
import { NoteStore } from './NoteStore'
import { handleMcp } from './mcp'
import { initLog, log } from './log'

const IDLE_EXIT_MS = 60_000
const SCROLLBACK_LINES = 5000

async function main(): Promise<void> {
  const dir = stepDir()
  fs.mkdirSync(dir, { recursive: true })
  initLog(hostLogPath())
  const version = process.env['STEP_VERSION'] ?? '0.0.0'
  log(`step-host ${version} starting pid=${process.pid}`)

  const token = randomBytes(16).toString('hex')
  let hookUrlFor: (sessionId: string) => string = () => ''
  let mcpUrlFor: (sessionId: string) => string = () => ''
  const binDir = path.join(dir, 'bin')
  if (process.platform !== 'win32') {
    try {
      writeShims(binDir)
    } catch (e) {
      log('shims write failed', e)
    }
    prepareSpawnHelper()
  }
  const sm = new SessionManager({
    stateFile: path.join(dir, 'state.json'),
    logDir: path.join(dir, 'sessions'),
    hooksDir: path.join(dir, 'hooks'),
    hookUrl: (id) => hookUrlFor(id),
    binDir,
    mcpUrl: (id) => mcpUrlFor(id),
    scrollback: SCROLLBACK_LINES,
    baseEnv: process.env
  })
  sm.load()

  const notes = new NoteStore(path.join(dir, 'notes.json'))
  notes.load()

  const hooks = new HookServer(sm, token, (sessionId, req, res) =>
    handleMcp(
      {
        notes,
        session: (id) => sm.get(id),
        sessions: () => sm.list(),
        send: (from, to, text, submit) => sm.handoff(from, to, text, submit),
        version
      },
      sessionId,
      req,
      res
    )
  )
  const hookPort = await hooks.listen()
  const hookUrl = hooks.url()
  hookUrlFor = (id) => hooks.url(id)
  mcpUrlFor = (id) => hooks.mcpUrl(id)

  const socketPath = hostSocketPath()
  const server = new HostServer(sm, notes, socketPath, version)
  try {
    await server.listen()
  } catch (e: any) {
    if (e?.code === 'EADDRINUSE') {
      log('another host is already listening, exiting')
      process.exit(0)
    }
    throw e
  }

  const info: HostInfo = { pid: process.pid, socketPath, hookPort, hookToken: token, version }
  fs.writeFileSync(hostInfoPath(), JSON.stringify(info))
  log('listening', socketPath, 'hooks', hookUrl)

  // Idle exit: no clients and no live sessions for a while.
  let idleTimer: NodeJS.Timeout | undefined
  const recheckIdle = (): void => {
    const idle = server.clientCount === 0 && !sm.hasAlive()
    if (idle && !idleTimer) {
      idleTimer = setTimeout(() => {
        if (server.clientCount === 0 && !sm.hasAlive()) shutdown('idle')
        else idleTimer = undefined
      }, IDLE_EXIT_MS)
    } else if (!idle && idleTimer) {
      clearTimeout(idleTimer)
      idleTimer = undefined
    }
  }
  server.onClientsChange = recheckIdle
  sm.on('exit', recheckIdle)
  sm.on('session', recheckIdle)
  sm.on('removed', recheckIdle)
  recheckIdle()

  // Claude Code live registry -> map claude typed inside our shells.
  const registryDir = path.join(claudeDir(), 'sessions')
  let regTimer: NodeJS.Timeout | undefined
  const scanRegistry = (): void => {
    if (regTimer) clearTimeout(regTimer)
    regTimer = setTimeout(() => {
      regTimer = undefined
      void sm.applyRegistry(readRegistry(registryDir))
    }, 300)
  }
  try {
    fs.mkdirSync(registryDir, { recursive: true })
    fs.watch(registryDir, { persistent: false }, scanRegistry)
    scanRegistry()
  } catch (e) {
    log('registry watch unavailable', e)
  }

  const shutdown = (why: string): void => {
    log('shutting down:', why)
    sm.persistNow()
    try {
      const cur = JSON.parse(fs.readFileSync(hostInfoPath(), 'utf8')) as HostInfo
      if (cur.pid === process.pid) fs.rmSync(hostInfoPath(), { force: true })
    } catch {
      /* ignore */
    }
    hooks.close()
    server.close()
    setTimeout(() => process.exit(0), 100)
  }
  server.onShutdown = () => shutdown('client request')
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGHUP', () => {
    /* keep running when the launching terminal goes away */
  })
  process.on('uncaughtException', (e) => log('uncaught', e))
  process.on('unhandledRejection', (e) => log('unhandled', e))
}

main().catch((e) => {
  log('fatal', e)
  process.exit(1)
})
