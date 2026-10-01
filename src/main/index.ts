import { app, BrowserWindow, nativeTheme, Notification } from 'electron'
import { join, resolve } from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { claudeDir, hostLogPath } from '@shared/paths'
import type { EventMap, EventName } from '@shared/ipc'
import type { BrowserOp, HostState, Prefs, Session, Note, Handoff, TopitoSay, WorkspaceOp, WorkspaceResult } from '@shared/types'
import { HostClient } from './host/HostClient'
import { ensureHost, requestHostShutdown } from './host/launcher'
import { loadPrefs, savePrefs } from './prefs'
import { shellEnv } from './shellEnv'
import { detectPresets } from './presets/detect'
import { HistoryIndex } from './claude/history'
import { LiveClaudeWatcher } from './claude/liveSessions'
import { computeProjects } from './projects'
import { applyAppIcon, applyWindowTheme, createWindow } from './window'
import { Notifier } from './notifications'
import { StepTray } from './tray'
import { PreviewBridge } from './preview'
import { PromptLog } from './prompts'
import { registerIpc } from './ipc'
import { buildAppMenu } from './menu'
import { setLanguage } from './i18n'
import { APP_ID, applyShortcutIcons, ensureWindowsShortcut, migrateUserData } from './branding'
import { Updates } from './updates'
import { closesToTray } from './closeToTray'
import { t } from './i18n'
import { folderArgs, onlyFolders } from './openFolders'
import { workspaceKeyFromUrl } from './stepUrl'
import { WorkspaceError, applyWorkspaceOp, describeWorkspace, workspaceToOpen, type WorkspaceEnv } from './workspaceTools'
import type { Ctx } from './context'

const VERSION = app.getVersion()
process.env['STEP_VERSION'] = VERSION

// Another data folder lets a second copy (a dev build, a test install) run next to the installed app.
// Otherwise the folder keeps the name the app had before it was called "stepbro terminal", so an
// update finds everyone's preferences where they were.
if (process.env['STEP_USER_DATA']) app.setPath('userData', resolve(process.env['STEP_USER_DATA']))
else app.setPath('userData', join(app.getPath('appData'), 'StepbroTerminal'))

// step:// links come back from notification buttons (Windows) and open-url (macOS). The
// registration is system-wide, so a development build must not take it from the installed app
// unless asked to: it used to, and the installed app's notifications then launched the dev
// Electron, or opened the dev project as a folder.
if (app.isPackaged) app.setAsDefaultProtocolClient('step')
else if (process.env['STEP_DEV_PROTOCOL'] && process.argv[1]) app.setAsDefaultProtocolClient('step', process.execPath, [resolve(process.argv[1])])

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  // Dev only: a random DevTools port, published in <userData>/DevToolsActivePort (see scripts/cdp.mjs).
  // Set after winning the lock so a second instance launched by a step:// link never overwrites it.
  if (!app.isPackaged) app.commandLine.appendSwitch('remote-debugging-port', '0')
  void boot()
}

function stepUrlIn(argv: string[]): string | undefined {
  return argv.find((a) => a.startsWith('step://'))
}

function hostEntry(): string {
  if (app.isPackaged) return join(process.resourcesPath, 'app.asar.unpacked', 'out', 'main', 'host.js')
  return join(__dirname, 'host.js')
}

// A folder dropped on the Dock icon arrives as open-file, sometimes before the app is ready.
let ctxRef: Ctx | null = null
const earlyFolders: string[] = []
app.on('open-file', (e, p) => {
  e.preventDefault()
  if (ctxRef) openFolders(ctxRef, onlyFolders([p], process.cwd()))
  else earlyFolders.push(p)
})

/** Hands folders to the renderer, or holds them until it says it is ready. */
function openFolders(ctx: Ctx, paths: string[]): void {
  if (paths.length === 0) return
  if (ctx.rendererReady && ctx.win && !ctx.win.isDestroyed()) {
    for (const p of paths) ctx.emit('ui:openFolder', p)
  } else {
    ctx.pendingFolders.push(...paths)
  }
}

/** Asks the renderer to open a workspace, or holds the request until it is ready. */
function openWorkspace(ctx: Ctx, key: string): void {
  if (ctx.rendererReady && ctx.win && !ctx.win.isDestroyed()) ctx.emit('ui:openWorkspace', key)
  else ctx.pendingWorkspaces.push(key)
}

/**
 * What an agent asked of the saved workspaces through the stepbro MCP server. Changes go into the
 * preferences like any made in Settings, which shows them at once; opening one is the Open button.
 */
function runWorkspaceOp(ctx: Ctx, op: WorkspaceOp): WorkspaceResult {
  const env: WorkspaceEnv = {
    presets: ctx.presets,
    home: os.homedir(),
    isDir: (p) => {
      try {
        return fs.statSync(p).isDirectory()
      } catch {
        return false
      }
    }
  }
  const configs = ctx.prefs.launchConfigs ?? []
  switch (op.kind) {
    case 'list':
      return { workspaces: configs.map((c) => describeWorkspace(c, env)) }
    case 'open': {
      const c = workspaceToOpen(configs, op.key, env)
      const queued = !(ctx.rendererReady && ctx.win && !ctx.win.isDestroyed())
      openWorkspace(ctx, c.id)
      return { workspace: describeWorkspace(c, env), queued }
    }
    default: {
      const done = applyWorkspaceOp(configs, op, env)
      ctx.setPrefs({ launchConfigs: done.configs })
      ctx.log(`workspace ${op.kind} by an agent:`, done.workspace.name)
      return { workspace: done.workspace }
    }
  }
}

/** A step:// link from a script, a shortcut or a notification button. Workspace links come first. */
function handleStepUrl(ctx: Ctx, url: string): boolean {
  const key = workspaceKeyFromUrl(url)
  if (key) {
    ctx.log('workspace link', key)
    openWorkspace(ctx, key)
    return true
  }
  return ctx.notifier.handleUrl(url)
}

// On macOS a link can arrive through open-url before the app is ready; keep it until then.
const earlyUrls: string[] = []
app.on('open-url', (e, url) => {
  e.preventDefault()
  if (ctxRef) handleStepUrl(ctxRef, url)
  else earlyUrls.push(url)
})

async function boot(): Promise<void> {
  // Every host/app log line also goes to the renderer's DevTools console, so a real failure can be
  // read there instead of guessed at. `forward` is wired once the window exists.
  let forward: ((line: string) => void) | null = null
  const log = (...a: unknown[]): void => {
    const line = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')
    console.log('[step]', line)
    try {
      forward?.(line)
    } catch {
      /* window gone */
    }
  }
  await app.whenReady()
  app.setAppUserModelId(APP_ID)
  ensureWindowsShortcut()
  migrateUserData()

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
    previews: null as unknown as PreviewBridge,
    prompts: new PromptLog(),
    updates: null as unknown as Updates,
    notes: [],
    pendingFolders: [],
    pendingFocus: null,
    pendingWorkspaces: [],
    rendererReady: false,
    log,
    emit: <K extends EventName>(channel: K, ...args: Parameters<EventMap[K]>): void => {
      if (ctx.win && !ctx.win.isDestroyed()) ctx.win.webContents.send(channel, ...args)
    },
    setPrefs: (partial: Partial<Prefs>): Prefs => {
      const themeChanged = partial.theme !== undefined && partial.theme !== ctx.prefs.theme
      // Anything that decides which agents count as installed. DeepSeek is one as soon as it has a
      // key and stops being one when the key goes; the key's characters in between change nothing.
      const deepseekToggled = 'deepseekApiKey' in partial && !!partial.deepseekApiKey !== !!ctx.prefs.deepseekApiKey
      const shellChanged = partial.shell !== undefined || partial.claudePath !== undefined || partial.customPresets !== undefined || deepseekToggled
      ctx.prefs = { ...ctx.prefs, ...partial }
      savePrefs(ctx.prefs)
      ctx.emit('prefs:update', ctx.prefs)
      if ((themeChanged || partial.frameOpacity !== undefined || partial.contentOpacity !== undefined) && ctx.win) applyWindowTheme(ctx.win, ctx.prefs)
      if (shellChanged) ctx.refreshPresets()
      if (partial.addedProjects || partial.hiddenProjects) ctx.emitProjects()
      if (partial.keybindings) buildAppMenu(ctx)
      if (partial.topito !== undefined) sendTopito(ctx)
      if (partial.logo !== undefined) {
        // The other logo, everywhere the app can change it while it runs: window or Dock, the tray,
        // and on Windows the shortcuts, so it holds when the app is closed or pinned.
        if (ctx.win) applyAppIcon(ctx.win, ctx.prefs)
        ctx.tray.refresh()
        applyShortcutIcons(ctx.prefs.logo ?? 'light')
      }
      if (partial.language !== undefined) {
        setLanguage(ctx.prefs.language)
        buildAppMenu(ctx)
        ctx.tray.refresh()
      }
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
    getActive: () => ctx.activeId,
    log: (...parts) => ctx.log(...parts),
    agentName: (s) => {
      const id = s.agent.detectedPreset ?? s.presetId
      return id === 'shell' ? null : (ctx.presets.find((p) => p.id === id)?.name ?? null)
    },
    focusSession: (id) => {
      // A click on a notification while the app was closed: the window is still loading, so hold the request.
      if (ctx.rendererReady && ctx.win && !ctx.win.isDestroyed()) ctx.emit('ui:focusSession', id)
      else ctx.pendingFocus = id
    },
    playSound: () => ctx.emit('ui:sound')
  })
  ctx.tray = new StepTray({
    getSessions: () => [...ctx.sessions.values()],
    getWindow: () => ctx.win,
    focusSession: (id) => ctx.emit('ui:focusSession', id),
    getPrefs: () => ctx.prefs
  })

  ctx.prompts.load()
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

  ctx.updates = new Updates({ emit: (state) => ctx.emit('ui:update', state), log })
  registerIpc(ctx)
  setLanguage(ctx.prefs.language)
  buildAppMenu(ctx)
  // Set once the app is really going (from the tray, for an update, or with the system): the
  // window then closes for good instead of going to the tray.
  let quitting = false
  const openWindow = (): BrowserWindow => {
    const w = createWindow(ctx.prefs)
    w.on('close', (e) => {
      if (!closesToTray(process.platform, ctx.prefs, ctx.tray.isUp, quitting)) return
      e.preventDefault()
      w.hide()
      if (!ctx.prefs.trayHintShown) {
        ctx.setPrefs({ trayHintShown: true })
        if (Notification.isSupported()) {
          new Notification({
            title: t('stepbro terminal is still running'),
            body: t('Your sessions go on, and you will hear when one needs you. Open it from the tray icon; quit it from there too.')
          }).show()
        }
      }
    })
    // Windows ending the session closes every window; nothing should hold that up.
    w.on('session-end', () => {
      quitting = true
    })
    w.on('closed', () => {
      if (ctx.win === w) ctx.win = null
    })
    return w
  }
  ctx.win = openWindow()
  forward = (line: string): void => ctx.emit('diag', line)
  log(`app ${VERSION} on ${process.platform} ${process.arch}, host entry ${hostEntry()}`)
  ctx.updates.start()
  ctx.tray.create()
  // An update rewrites the Windows shortcuts with the default icon; a chosen color logo goes back on them.
  if (ctx.prefs.logo && ctx.prefs.logo !== 'light') applyShortcutIcons(ctx.prefs.logo)

  ctxRef = ctx
  // Folders given at launch: dropped on the app icon, or named on the command line.
  ctx.pendingFolders.push(...folderArgs(process.argv, process.cwd(), [app.getAppPath(), process.execPath]), ...onlyFolders(earlyFolders, process.cwd()))
  earlyFolders.length = 0
  for (const u of earlyUrls.splice(0)) handleStepUrl(ctx, u)
  void connectHost(ctx)

  app.on('second-instance', (_e, argv, cwd) => {
    const url = stepUrlIn(argv)
    if (url) log('protocol link', url)
    // Notification answers stay in the background; a workspace link opens and comes forward.
    if (url && handleStepUrl(ctx, url) && !url.startsWith('step://focus/') && !workspaceKeyFromUrl(url)) return
    // A folder dropped on the icon while the app is already open: hand it over and come forward.
    openFolders(ctx, folderArgs(argv, cwd, [app.getAppPath(), process.execPath]))
    if (!ctx.win) ctx.win = openWindow()
    if (ctx.win.isMinimized()) ctx.win.restore()
    ctx.win.show()
    ctx.win.focus()
  })
  const launchUrl = stepUrlIn(process.argv)
  if (launchUrl) handleStepUrl(ctx, launchUrl)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) ctx.win = openWindow()
  })
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
  app.on('before-quit', () => {
    quitting = true
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
    const wasError = ctx.sessions.get(s.id)?.error
    ctx.sessions.set(s.id, s)
    if (s.status === 'error' && s.errorDetail && s.error !== wasError) ctx.log(`session ${s.id} did not start:
${s.errorDetail}`)
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
  client.on('prompt', (p) => ctx.prompts.add(p))
  client.on('notes', (notes: Note[], added?: Note) => {
    ctx.notes = notes
    ctx.emit('notes:update', notes, added)
  })
  client.on('handoff', (h: Handoff) => ctx.emit('ui:handoff', h))
  client.on('topito', (say: TopitoSay) => ctx.emit('ui:topito', say))
  // An agent's request for the preview pane: done here, where the <webview>'s contents are reachable, and answered over the socket.
  ctx.previews = new PreviewBridge({
    show: (id, url) => ctx.emit('ui:openPreview', id, url),
    hide: (id) => ctx.emit('ui:closePreview', id),
    // The cursor on the page wears the agent's name and color, the same ones the sidebar uses.
    whoIs: (id) => {
      const s = ctx.sessions.get(id)
      const presetId = s?.agent.detectedPreset ?? s?.presetId ?? 'agent'
      const preset = ctx.presets.find((p) => p.id === presetId)
      return { name: preset?.name ?? presetId, color: preset?.color ?? '#8a8a90' }
    },
    activity: (id) => {
      const s = ctx.sessions.get(id)
      ctx.emit('ui:previewActivity', id, s?.agent.detectedPreset ?? s?.presetId ?? 'agent')
    }
  })
  client.on('browser', (reqId: string, sessionId: string, op: BrowserOp) => {
    ctx.previews.handle(sessionId, op).then(
      (result) => client.send({ t: 'browser:result', reqId, ok: true, result }),
      (e: unknown) => client.send({ t: 'browser:result', reqId, ok: false, error: String((e as Error)?.message ?? e) })
    )
  })
  client.on('workspaces', (reqId: string, op: WorkspaceOp) => {
    try {
      client.send({ t: 'workspaces:result', reqId, ok: true, result: runWorkspaceOp(ctx, op) })
    } catch (e: unknown) {
      if (!(e instanceof WorkspaceError)) ctx.log('workspace request failed:', String((e as Error)?.stack ?? e))
      client.send({ t: 'workspaces:result', reqId, ok: false, error: e instanceof WorkspaceError ? e.message : `stepbro terminal could not do that: ${String((e as Error)?.message ?? e)}` })
    }
  })
  client.on('error', (m: string) => ctx.log('host error:', m))
  client.on('disconnected', () => {
    ctx.log('host disconnected, reconnecting')
    setHostState(ctx, { kind: 'connecting' })
    setTimeout(() => void connectHost(ctx), 500)
  })
}

/** Tells the host whether Topito is on, so the agents' MCP server offers him only then. */
function sendTopito(ctx: Ctx): void {
  ctx.client.send({ t: 'topito', on: ctx.prefs.topito === true })
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
      sendTopito(ctx)
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
