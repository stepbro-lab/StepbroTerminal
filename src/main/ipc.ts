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
import { captionPing } from './window'
import type { Ctx } from './context'

type Handler<K extends keyof InvokeMap> = (...args: Parameters<InvokeMap[K]>) => ReturnType<InvokeMap[K]> | Promise<ReturnType<InvokeMap[K]>>
type Listener<K extends keyof SendMap> = (...args: Parameters<SendMap[K]>) => void

export function registerIpc(ctx: Ctx): void {
  const handle = <K extends keyof InvokeMap>(channel: K, fn: Handler<K>): void => {
    ipcMain.handle(channel, (_e, ...args) => (fn as any)(...args))
  }
  const on = <K extends keyof SendMap>(channel: K, fn: Listener<K>): void => {
    ipcMain.on(channel, (_e, ...args) => (fn as any)(...args))
  }

  // ---- host ----
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
  on('host:reorder', (ids) => ctx.client.send({ t: 'reorder', ids }))
  on('host:viewed', (id) => ctx.client.send({ t: 'viewed', id }))
  on('host:ack', (id, bytes) => ctx.client.send({ t: 'ack', id, bytes }))

  // ---- diagnostics ----
  // Everything needed to see why a session would not start, readable from the DevTools console
  // with `await window.step.invoke('diag:dump')`.
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

  // ---- notes ----
  handle('notes:list', () => ctx.notes)
  on('notes:add', (text) => ctx.client.send({ t: 'notes:add', text }))
  on('notes:update', (id, patch) => ctx.client.send({ t: 'notes:update', id, ...patch }))
  on('notes:delete', (id) => ctx.client.send({ t: 'notes:delete', id }))

  // ---- projects ----
  handle('projects:list', () => ctx.projects())
  handle('projects:pickFolder', async () => {
    const res = await dialog.showOpenDialog(ctx.win ?? undefined!, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Add project folder'
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
  handle('projects:openFolder', (p) => {
    void shell.openPath(p)
  })
  // Folders dropped on the app icon or passed on the command line, waiting for the renderer.
  handle('app:pendingFolders', () => {
    ctx.rendererReady = true
    return ctx.pendingFolders.splice(0)
  })

  // ---- claude data ----
  handle('history:list', () => ctx.history.sessions())
  handle('history:details', (projectPath, sessionId) => readTranscriptDetails(transcriptPath(projectPath, sessionId)))
  handle('history:live', () => ctx.live.list())

  // ---- presets & prefs ----
  handle('presets:list', () => ctx.presets)
  handle('presets:refresh', () => ctx.refreshPresets())
  handle('prefs:get', () => ctx.prefs)
  handle('prefs:set', (partial) => ctx.setPrefs(partial))

  // ---- window ----
  handle('win:isMaximized', () => !!ctx.win?.isMaximized())
  on('win:minimize', () => ctx.win?.minimize())
  on('win:maximize', () => {
    if (!ctx.win) return
    if (ctx.win.isMaximized()) ctx.win.unmaximize()
    else ctx.win.maximize()
  })
  on('win:close', () => ctx.win?.close())
  on('win:setActiveSession', (id) => {
    ctx.activeId = id
  })
  on('win:setTitle', (title) => ctx.win?.setTitle(title ? `${title} — StepbroTerminal` : 'StepbroTerminal'))
  on('win:captionPing', () => captionPing(ctx.win))
  on('clipboard:write', (text) => clipboard.writeText(text))
  handle('clipboard:kind', () => {
    const formats = clipboard.availableFormats()
    if (formats.some((f) => f.startsWith('image/')) || !clipboard.readImage().isEmpty()) return 'image'
    return clipboard.readText() ? 'text' : 'none'
  })
  handle('clipboard:readText', () => clipboard.readText())
  handle('prompts:list', () => ctx.prompts.list())
  handle('git:changes', (projectPath, since, touched) => gitChanges(projectPath, since, touched))
  handle('git:diff', (root, rel, untracked) => gitDiff(root, rel, untracked))
  handle('git:revert', (root, rel, untracked) => gitRevert(root, rel, untracked))
  handle('workspace:get', () => loadWorkspace())
  handle('updates:state', () => ctx.updates.state)
  handle('updates:check', () => ctx.updates.check())
  handle('updates:install', () => ctx.updates.install())
  on('workspace:set', (state) => saveWorkspace(state))

  handle('menu:popup', (items: MenuItemSpec[]) => popupMenu(ctx, items))
  handle('app:openExternal', (url) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
  })
  handle('app:openPath', (p) => {
    void shell.openPath(p)
  })
  void app
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
