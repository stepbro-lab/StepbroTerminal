import { app, BrowserWindow, nativeTheme } from 'electron'
import { join } from 'node:path'
import fs from 'node:fs'
import { claudeDir, hostLogPath } from '@shared/paths'
import type { EventMap, EventName } from '@shared/ipc'
import type { HostState, Prefs, Session } from '@shared/types'
import { HostClient } from './host/HostClient'
import { ensureHost, requestHostShutdown } from './host/launcher'
import { loadPrefs, savePrefs } from './prefs'
import { shellEnv } from './shellEnv'
import { detectPresets } from './presets/detect'
import { HistoryIndex } from './claude/history'
import { LiveClaudeWatcher } from './claude/liveSessions'
import { computeProjects } from './projects'
import { applyWindowTheme, createWindow } from './window'
import { Notifier } from './notifications'
import { StepTray } from './tray'
import { registerIpc } from './ipc'
import { buildAppMenu } from './menu'
import type { Ctx } from './context'

const VERSION = app.getVersion()
process.env['STEP_VERSION'] = VERSION

// Dev only: a random DevTools port, published in <userData>/DevToolsActivePort (see scripts/cdp.mjs).
if (!app.isPackaged) app.commandLine.appendSwitch('remote-debugging-port', '0')

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  void boot()
}

function hostEntry(): string {
  if (app.isPackaged) return join(process.resourcesPath, 'app.asar.unpacked', 'out', 'main', 'host.js')
  return join(__dirname, 'host.js')
}

async function boot(): Promise<void> {
  const log = (...a: unknown[]): void => console.log('[step]', ...a)
  await app.whenReady()
  app.setAppUserModelId('com.step.terminal')

  const prefs = loadPrefs()
  const env = await shellEnv()
  const history = new HistoryIndex(join(claudeDir(), 'history.jsonl'))
  const live = new LiveClaudeWatcher(join(claudeDir(), 'sessions'))
  const client = new HostClient()

  const ctx: Ctx = {
    version: VERSION,
    prefs,
    env,
    presets: [],
    history,
    live,
    client,
    hostState: { kind: 'connecting' },
    sessions: new Map(),
    win: null,
    activeId: null,
    notifier: null as unknown as Notifier,
    tray: null as unknown as StepTray,
    log,
    emit: <K extends EventName>(channel: K, ...args: Parameters<EventMap[K]>): void => {
      if (ctx.win && !ctx.win.isDestroyed()) ctx.win.webContents.send(channel, ...args)
    },
    setPrefs: (partial: Partial<Prefs>): Prefs => {
      const themeChanged = partial.theme !== undefined && partial.theme !== ctx.prefs.theme
      const shellChanged = partial.shell !== undefined || partial.claudePath !== undefined || partial.customPresets !== undefined
      ctx.prefs = { ...ctx.prefs, ...partial }
      savePrefs(ctx.prefs)
      ctx.emit('prefs:update', ctx.prefs)
      if (themeChanged && ctx.win) applyWindowTheme(ctx.win, ctx.prefs)
      if (shellChanged) ctx.refreshPresets()
      if (partial.addedProjects || partial.hiddenProjects) ctx.emitProjects()
      return ctx.prefs
    },
    refreshPresets: () => {
      ctx.presets = detectPresets(ctx.env, ctx.prefs)
      ctx.emit('presets:update', ctx.presets)
      return ctx.presets
    },
    projects: () => computeProjects(ctx.prefs, [...ctx.sessions.values()]),
    emitProjects: () => ctx.emit('projects:update', ctx.projects()),
    connectHost: () => connectHost(ctx),
    restartHost: async () => {
      client.disconnect()
      await requestHostShutdown()
      await new Promise((r) => setTimeout(r, 400))
      await connectHost(ctx)
    }
  }

  ctx.notifier = new Notifier({
    getPrefs: () => ctx.prefs,
    getWindow: () => ctx.win,
    getActive: () => ctx.activeId
  })
  ctx.tray = new StepTray({
    getSessions: () => [...ctx.sessions.values()],
    getWindow: () => ctx.win,
    focusSession: (id) => ctx.emit('ui:focusSession', id)
  })

  ctx.refreshPresets()
  wireHostClient(ctx)
  history.on('update', (list) => ctx.emit('history:update', list))
  live.on('update', (list) => ctx.emit('live:update', list))
  history.start()
  live.start()

  nativeTheme.on('updated', () => {
    ctx.emit('theme:system', nativeTheme.shouldUseDarkColors)
    if (ctx.win && ctx.prefs.theme === 'system') applyWindowTheme(ctx.win, ctx.prefs)
  })

  registerIpc(ctx)
  buildAppMenu(ctx)
  ctx.win = createWindow(ctx.prefs)
  ctx.win.on('closed', () => {
    ctx.win = null
  })
  ctx.tray.create()

  void connectHost(ctx)

  app.on('second-instance', () => {
    if (!ctx.win) ctx.win = createWindow(ctx.prefs)
    if (ctx.win.isMinimized()) ctx.win.restore()
    ctx.win.show()
    ctx.win.focus()
  })
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      ctx.win = createWindow(ctx.prefs)
      ctx.win.on('closed', () => {
        ctx.win = null
      })
    }
  })
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
  app.on('before-quit', () => {
    // Never kill the host: sessions must survive the app.
    client.disconnect()
    history.stop()
    live.stop()
    ctx.tray.destroy()
  })
}

function wireHostClient(ctx: Ctx): void {
  const { client } = ctx
  client.on('sessions', (list: Session[]) => {
    ctx.sessions.clear()
    for (const s of list) ctx.sessions.set(s.id, s)
    ctx.emit('host:sessions', list)
    ctx.emitProjects()
    ctx.tray.update()
  })
  client.on('session', (s: Session) => {
    const isNew = !ctx.sessions.has(s.id)
    ctx.sessions.set(s.id, s)
    ctx.emit('host:session', s)
    ctx.notifier.onSession(s)
    ctx.tray.update()
    if (isNew) ctx.emitProjects()
  })
  client.on('removed', (id: string) => {
    ctx.sessions.delete(id)
    ctx.notifier.forget(id)
    ctx.emit('host:removed', id)
    ctx.emitProjects()
    ctx.tray.update()
  })
  client.on('output', (id: string, bytes: Uint8Array) => ctx.emit('host:output', id, bytes, false))
  client.on('replay', (id: string, bytes: Uint8Array) => ctx.emit('host:output', id, bytes, true))
  client.on('clear', (id: string) => ctx.emit('host:clear', id))
  client.on('exit', (id: string, code: number) => ctx.emit('host:exit', id, code))
  client.on('error', (m: string) => ctx.log('host error:', m))
  client.on('disconnected', () => {
    ctx.log('host disconnected, reconnecting')
    setHostState(ctx, { kind: 'connecting' })
    setTimeout(() => void connectHost(ctx), 500)
  })
}

function setHostState(ctx: Ctx, state: HostState): void {
  ctx.hostState = state
  ctx.emit('host:state', state)
}

let connecting: Promise<void> | null = null
function connectHost(ctx: Ctx): Promise<void> {
  if (connecting) return connecting
  connecting = (async () => {
    setHostState(ctx, { kind: 'connecting' })
    try {
      const info = await ensureHost({ version: ctx.version, entry: hostEntry(), env: ctx.env, log: ctx.log })
      await ctx.client.connect(info, ctx.version)
      setHostState(ctx, { kind: 'connected', info })
    } catch (e: any) {
      const message = e?.message ?? String(e)
      ctx.log('host unavailable:', message)
      let tail = ''
      try {
        tail = fs.readFileSync(hostLogPath(), 'utf8').split('\n').slice(-5).join('\n')
      } catch {
        /* no log */
      }
      setHostState(ctx, { kind: 'error', message: tail ? `${message}\n${tail}` : message, logPath: hostLogPath() })
    } finally {
      connecting = null
    }
  })()
  return connecting
}
