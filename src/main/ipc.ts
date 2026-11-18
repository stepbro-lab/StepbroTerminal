import { app, clipboard, dialog, ipcMain, Menu, shell } from 'electron'
import fs from 'node:fs'
import type { CreateRequest, InvokeMap, SendMap } from '@shared/ipc'
import type { MenuItemSpec, Session } from '@shared/types'
import { hostLogPath, normalizeProjectPath, stepDir } from '@shared/paths'
import { join } from 'node:path'
import { readTranscriptDetails, transcriptPath } from './claude/transcript'
import { buildLaunchSpec } from './presets/launchSpec'
import { gitChanges, gitDiff, gitRevert } from './git'
import { loadWorkspace, saveWorkspace } from './prefs'
import type { Ctx } from './context'
import { t } from './i18n'
import { barWatch, windowButtons } from './window'

type Handler<K extends keyof InvokeMap> = (...args: Parameters<InvokeMap[K]>) => ReturnType<InvokeMap[K]> | Promise<ReturnType<InvokeMap[K]>>
type Listener<K extends keyof SendMap> = (...args: Parameters<SendMap[K]>) => void

export function registerIpc(ctx: Ctx): void {
  const handle = <K extends keyof InvokeMap>(channel: K, fn: Handler<K>): void => {
    ipcMain.handle(channel, (_e, ...args) => (fn as any)(...args))
  }
  const on = <K extends keyof SendMap>(channel: K, fn: Listener<K>): void => {
    ipcMain.on(channel, (_e, ...args) => (fn as any)(...args))
  }

  handle('host:state', () => ctx.hostState)
  handle('host:list', () => [...ctx.sessions.values()])
  handle('host:create', (req: CreateRequest) => createSession(ctx, req))
  handle('host:restartHost', () => ctx.restartHost())
  on('host:attach', (id) => ctx.client.send({ t: 'attach', id }))
  on('host:detach', (id) => ctx.client.send({ t: 'detach', id }))
  on('host:input', (id, data) => ctx.client.send({ t: 'input', id }, data))
  on('host:resize', (id, cols, rows) => ctx.client.send({ t: 'resize', id, cols, rows }))
  on('host:kill', (id) => ctx.client.send({ t: 'kill', id }))
  on('host:close', (id) => ctx.client.send({ t: 'close', id }))
  on('host:restart', (id) => ctx.client.send({ t: 'restart', id }))
  on('host:rename', (id, title) => ctx.client.send({ t: 'rename', id, title }))
  on('host:pin', (id, pinned) => ctx.client.send({ t: 'pin', id, pinned }))
  on('host:archive', (id, archived) => ctx.client.send({ t: 'archive', id, archived }))
  on('host:reorder', (ids) => ctx.client.send({ t: 'reorder', ids }))
  on('host:viewed', (id) => ctx.client.send({ t: 'viewed', id }))
  on('host:ack', (id, bytes) => ctx.client.send({ t: 'ack', id, bytes }))

  handle('diag:dump', () => {
    const read = (label: string, file: string): string => {
      try {
        return `----- ${label} (${file}) -----\n${fs.readFileSync(file, 'utf8').trimEnd()}`
      } catch {
        return `----- ${label} (${file}) -----\n(none)`
      }
    }
    const header = `app ${ctx.version} · ${process.platform} ${process.arch} · host ${ctx.hostState.kind === 'connected' ? ctx.hostState.info.version : ctx.hostState.kind}`
    return [header, read('host.log', hostLogPath()), read('host.err', join(stepDir(), 'host.err'))].join('\n\n')
  })

  handle('notes:list', () => ctx.notes)
  on('notes:add', (text) => ctx.client.send({ t: 'notes:add', text }))
  on('notes:update', (id, patch) => ctx.client.send({ t: 'notes:update', id, ...patch }))
  on('notes:delete', (id) => ctx.client.send({ t: 'notes:delete', id }))

  handle('projects:list', () => ctx.projects())
  handle('projects:pickFolder', async () => {
    const res = await dialog.showOpenDialog(ctx.win ?? undefined!, {
      properties: ['openDirectory', 'createDirectory'],
      title: t('Add project folder')
    })
    if (res.canceled || !res.filePaths[0]) return null
    return normalizeProjectPath(res.filePaths[0])
  })
  handle('projects:add', (p) => {
    const norm = normalizeProjectPath(p)
    const added = ctx.prefs.addedProjects.filter((x) => x.toLowerCase() !== norm.toLowerCase())
    const hidden = ctx.prefs.hiddenProjects.filter((x) => x.toLowerCase() !== norm.toLowerCase())
    ctx.setPrefs({ addedProjects: [norm, ...added], hiddenProjects: hidden })
    return ctx.projects()
  })
  handle('projects:hide', (p) => {
    const norm = normalizeProjectPath(p)
    ctx.setPrefs({
      addedProjects: ctx.prefs.addedProjects.filter((x) => x.toLowerCase() !== norm.toLowerCase()),
      hiddenProjects: [norm, ...ctx.prefs.hiddenProjects.filter((x) => x.toLowerCase() !== norm.toLowerCase())]
    })
    return ctx.projects()
  })
  handle('projects:reorder', (paths) => {
    ctx.setPrefs({ projectOrder: paths.map((p) => normalizeProjectPath(p)) })
    const projects = ctx.projects()
    ctx.emitProjects()
    return projects
  })
  handle('projects:openFolder', (p) => {
    void shell.openPath(p)
  })

  handle('app:pendingFolders', () => {
    ctx.rendererReady = true
    const focus = ctx.pendingFocus
    ctx.pendingFocus = null
    if (focus) setTimeout(() => ctx.emit('ui:focusSession', focus), 400)
    return ctx.pendingFolders.splice(0)
  })
  handle('app:pendingWorkspaces', () => ctx.pendingWorkspaces.splice(0))

  handle('history:list', () => ctx.history.sessions())
  handle('history:details', (projectPath, sessionId) => readTranscriptDetails(transcriptPath(projectPath, sessionId)))
  handle('history:live', () => ctx.live.list())

  handle('presets:list', () => ctx.presets)
  handle('presets:refresh', () => ctx.refreshPresets())
  handle('prefs:get', () => ctx.prefs)
  handle('prefs:set', (partial) => ctx.setPrefs(partial))

  handle('win:isMaximized', () => !!ctx.win?.isMaximized())
  on('win:minimize', () => ctx.win?.minimize())
  on('win:maximize', () => {
    if (!ctx.win) return
    if (ctx.win.isMaximized()) ctx.win.unmaximize()
    else ctx.win.maximize()
  })
  on('win:close', () => ctx.win?.close())
  on('win:bar', (height) => barWatch(ctx.win, height))
  on('win:buttons', (visible) => windowButtons(ctx.win, visible))
  on('win:setActiveSession', (id) => {
    ctx.activeId = id
  })
  on('win:setTitle', (title) => ctx.win?.setTitle(title ? `${title} — stepbro terminal` : 'stepbro terminal'))
  on('clipboard:write', (text) => clipboard.writeText(text))
  handle('clipboard:kind', () => {
    const formats = clipboard.availableFormats()
    if (formats.some((f) => f.startsWith('image/')) || !clipboard.readImage().isEmpty()) return 'image'
    return clipboard.readText() ? 'text' : 'none'
  })
  handle('clipboard:readText', () => clipboard.readText())
  handle('clipboard:saveImage', () => savePastedImage())
  handle('prompts:list', () => ctx.prompts.list())
  handle('git:changes', (projectPath, since, touched) => gitChanges(projectPath, since, touched))
  handle('git:diff', (root, rel, untracked) => gitDiff(root, rel, untracked))
  handle('git:revert', (root, rel, untracked) => gitRevert(root, rel, untracked))
  handle('workspace:get', () => loadWorkspace())
  handle('updates:state', () => ctx.updates.state)
  handle('updates:check', () => ctx.updates.check())
  handle('updates:install', () => ctx.updates.install())
  on('workspace:set', (state) => saveWorkspace(state))
  on('preview:attached', (sessionId, wcId) => ctx.previews.attached(sessionId, wcId))
  on('preview:detached', (sessionId) => ctx.previews.detached(sessionId))

  handle('menu:popup', (items: MenuItemSpec[]) => popupMenu(ctx, items))
  handle('app:openExternal', (url) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
  })
  handle('app:openPath', (p) => {
    void shell.openPath(p)
  })
  handle('app:revealPath', (p) => shell.showItemInFolder(p))
  handle('app:paths', () => ({ data: stepDir(), hostLog: hostLogPath() }))

  handle('stats:get', async () => {
    let appBytes = 0
    for (const m of app.getAppMetrics()) appBytes += (m.memory?.workingSetSize ?? 0) * 1024
    let host = null
    if (ctx.client.connected) {
      try {
        host = await ctx.client.stats()
      } catch {
        host = null
      }
    }
    return { app: appBytes, host }
  })
}

const PASTE_KEEP_MS = 24 * 60 * 60 * 1000

function savePastedImage(): string | null {
  const image = clipboard.readImage()
  if (image.isEmpty()) return null
  const dir = join(app.getPath('temp'), 'StepbroTerminal', 'pasted')
  fs.mkdirSync(dir, { recursive: true })
  const now = Date.now()
  for (const name of fs.readdirSync(dir)) {
    try {
      const p = join(dir, name)
      if (now - fs.statSync(p).mtimeMs > PASTE_KEEP_MS) fs.rmSync(p)
    } catch {}
  }
  const stamp = new Date(now).toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-')
  const file = join(dir, `image-${stamp}-${(now % 1000).toString().padStart(3, '0')}.png`)
  fs.writeFileSync(file, image.toPNG())
  return file
}

async function createSession(ctx: Ctx, req: CreateRequest): Promise<Session> {
  const preset = ctx.presets.find((p) => p.id === req.presetId) ?? ctx.presets.find((p) => p.id === 'shell')!
  const launch = buildLaunchSpec(preset, ctx.prefs, ctx.env)
  const usage = { ...ctx.prefs.presetUsage, [preset.id]: (ctx.prefs.presetUsage[preset.id] ?? 0) + 1 }
  ctx.setPrefs({ presetUsage: usage })
  const s = await ctx.client.create({
    projectPath: normalizeProjectPath(req.projectPath),
    presetId: preset.id,
    launch,
    cols: req.cols,
    rows: req.rows,
    title: req.title,
    runOnStart: req.runOnStart,
    startDir: req.startDir,
    agentSessionId: req.resumeId,
    resume: !!req.resumeId
  })
  ctx.sessions.set(s.id, s)
  ctx.emitProjects()
  return s
}

function popupMenu(ctx: Ctx, items: MenuItemSpec[]): Promise<string | null> {
  return new Promise((resolve) => {
    let picked: string | null = null
    const build = (list: MenuItemSpec[]): Electron.MenuItemConstructorOptions[] =>
      list.map((it) => {
        if (it.separator) return { type: 'separator' }
        return {
          label: it.label ?? '',
          enabled: it.enabled !== false,
          type: it.checked !== undefined ? 'checkbox' : 'normal',
          checked: it.checked,
          submenu: it.submenu ? build(it.submenu) : undefined,
          click: it.submenu
            ? undefined
            : () => {
                picked = it.id ?? null
              }
        }
      })
    const menu = Menu.buildFromTemplate(build(items))
    menu.popup({ window: ctx.win ?? undefined, callback: () => resolve(picked) })
  })
}
