import type { HistorySession, LaunchConfig, MenuItemSpec, Session } from '@shared/types'
import { useData } from '@/stores/data'
import { paneIds, useUi, type SplitDir } from '@/stores/ui'
import { usePrefs } from '@/stores/prefs'
import { registry } from '@/terminal/TerminalRegistry'
import { popup, sep } from './menus'
import type { MenuPosition } from '@/components/ContextMenu'
import { canResume as sessionCanResume, type SidebarProject, type SidebarSession } from './sidebarModel'
import { findWorkspace, layoutFor, openablePanes, paneTitle } from './launchConfigs'
import { hasLeaf, leaves } from './layout'
import { t } from '@/lib/i18n'

function currentDims(): { cols: number; rows: number } {
  const active = useUi.getState().activeId
  const e = active ? registry.get(active) : undefined
  if (e?.mounted) return { cols: e.term.cols, rows: e.term.rows }
  const w = Math.max(400, window.innerWidth - (usePrefs.getState().prefs?.sidebarWidth ?? 240) - 40)
  const h = Math.max(200, window.innerHeight - 120)
  const size = usePrefs.getState().prefs?.fontSize ?? 13
  return { cols: Math.max(40, Math.floor(w / (size * 0.6))), rows: Math.max(10, Math.floor(h / (size * 1.2))) }
}

export async function createSession(
  projectPath: string,
  presetId: string,
  opts: { resumeId?: string; title?: string } = {}
): Promise<Session | null> {
  const ui = useUi.getState()
  try {
    const s = await window.step.invoke('host:create', { projectPath, presetId, ...currentDims(), ...opts })
    useData.getState().patchSession(s)
    ui.setActiveProject(projectPath)
    showNewSession(s.id)
    return s
  } catch (e: any) {
    ui.toast(e?.message ?? t('Could not start session'), 'error')
    return null
  }
}

/** A new session always opens on its own; whatever arrangement was on screen stays intact behind it. */
function showNewSession(id: string): void {
  useUi.getState().setActive(id)
}

export const newShell = (projectPath: string): Promise<Session | null> => createSession(projectPath, 'shell')

/** Opens a new shell beside (or under) a pane (the focused one by default), in the same folder. */
export async function splitWithNewShell(dir: SplitDir, besideId?: string): Promise<void> {
  const ui = useUi.getState()
  if (besideId && besideId !== ui.activeId) ui.setActive(besideId)
  const current = ui.activeId ? useData.getState().sessions[ui.activeId] : undefined
  const projectPath = current?.projectPath ?? ui.activeProject ?? useData.getState().projects[0]?.path
  if (!projectPath) {
    await addProject()
    return
  }
  try {
    const s = await window.step.invoke('host:create', { projectPath, presetId: 'shell', ...currentDims() })
    useData.getState().patchSession(s)
    useUi.getState().split(dir, s.id)
  } catch (e: any) {
    ui.toast(e?.message ?? t('Could not start session'), 'error')
  }
}

export async function closeSession(id: string): Promise<void> {
  const s = useData.getState().sessions[id]
  if (!s) return
  if (s.alive && (s.status === 'working' || s.status === 'attention')) {
    const pick = await popup([{ id: 'close', label: t('Close anyway (something is still running)') }, { id: 'cancel', label: t('Keep it running') }])
    if (pick !== 'close') return
  }
  const ui = useUi.getState()
  const wasFocused = ui.activeId === id
  const alone = paneIds().length <= 1
  ui.dropPane(id)
  if (wasFocused && alone) ui.setActive(nextSessionId(id))
  registry.dispose(id)
  window.step.send('host:close', id)
}

function nextSessionId(closing: string): string | null {
  const list = Object.values(useData.getState().sessions)
    .filter((s) => s.id !== closing)
    .sort((a, b) => b.updatedAt - a.updatedAt)
  return list[0]?.id ?? null
}

/** Nudges the program to repaint: a one-column resize and back makes TUI apps redraw everything. */
export function redrawSession(id: string): void {
  const e = registry.get(id)
  if (!e) return
  const { cols, rows } = e.term
  window.step.send('host:resize', id, Math.max(2, cols - 1), rows)
  window.setTimeout(() => window.step.send('host:resize', id, cols, rows), 120)
}

export function restartSession(id: string): void {
  const s = useData.getState().sessions[id]
  if (s && claudeInShell(s)) {
    void reviveAsClaude(s)
    return
  }
  registry.markDetached(id)
  window.step.send('host:restart', id)
}

export function killSession(id: string): void {
  window.step.send('host:kill', id)
}

/**
 * Puts a session away: its pane closes and its process ends, but the session, its screen and
 * its conversation stay, dimmed under the folder, to be restored later or deleted.
 */
export async function archiveSession(id: string): Promise<void> {
  const s = useData.getState().sessions[id]
  if (!s) return
  if (s.alive && (s.status === 'working' || s.status === 'attention')) {
    const pick = await popup([{ id: 'archive', label: t('Archive anyway (something is still running)') }, { id: 'cancel', label: t('Keep it running') }])
    if (pick !== 'archive') return
  }
  const ui = useUi.getState()
  const wasFocused = ui.activeId === id
  const alone = paneIds().length <= 1
  ui.dropPane(id)
  if (wasFocused && alone) ui.setActive(nextSessionId(id))
  registry.dispose(id)
  window.step.send('host:archive', id, true)
}

/**
 * Claude Code typed into a shell, brought back: not the shell with the command typed into it
 * again, but a Claude Code session of its own that picks the conversation up straight away, the
 * way one started from the menu does. The shell it lived in goes.
 */
async function reviveAsClaude(s: Session): Promise<void> {
  const created = await createSession(s.projectPath, 'claude', { resumeId: s.agent.sessionId, title: s.title || undefined })
  if (created) await closeSession(s.id)
}

const claudeInShell = (s: Session): boolean => s.presetId === 'shell' && sessionCanResume(s)

/** Brings an archived session back and starts it again, resuming its conversation when it can. */
export function restoreSession(id: string): void {
  const s = useData.getState().sessions[id]
  if (!s) return
  if (claudeInShell(s)) {
    void reviveAsClaude(s)
    return
  }
  window.step.send('host:archive', id, false)
  restartSession(id)
  const ui = useUi.getState()
  ui.setActiveProject(s.projectPath)
  ui.setActive(id)
}

export function renameSession(id: string, title: string): void {
  window.step.send('host:rename', id, title)
}

export function pinSession(id: string, pinned: boolean): void {
  window.step.send('host:pin', id, pinned)
}

/** Puts a project's sessions in this order, on screen right away and in the host after. */
export function reorderSessions(ids: string[]): void {
  const { sessions, patchSession } = useData.getState()
  ids.forEach((id, order) => {
    const s = sessions[id]
    if (s && s.order !== order) patchSession({ ...s, order })
  })
  window.step.send('host:reorder', ids)
}

/** Folders in a new order: shown at once, then kept by the main process with the preferences. */
export async function reorderProjects(paths: string[]): Promise<void> {
  const { projects } = useData.getState()
  const rank = new Map(paths.map((p, i) => [p.toLowerCase(), i]))
  const sorted = projects.map((p, i) => ({ p, i })).sort((a, b) => (rank.get(a.p.path.toLowerCase()) ?? paths.length) - (rank.get(b.p.path.toLowerCase()) ?? paths.length) || a.i - b.i).map((x) => x.p)
  useData.setState({ projects: sorted })
  useData.setState({ projects: await window.step.invoke('projects:reorder', paths) })
}

export function openFolder(path: string): void {
  void window.step.invoke('projects:openFolder', path)
}

export function copyText(text: string, what = 'Copied'): void {
  window.step.send('clipboard:write', text)
  useUi.getState().toast(what, 'success')
}

/** Picks a folder, adds it and opens a shell inside it right away, like a terminal should. */
export async function addProject(): Promise<string | null> {
  const p = await window.step.invoke('projects:pickFolder')
  if (!p) return null
  await addProjectPath(p)
  return p
}

/** Puts a folder in the sidebar, makes it current and opens a shell in it. */
export async function addProjectPath(p: string): Promise<void> {
  const projects = await window.step.invoke('projects:add', p)
  useData.setState({ projects })
  // Main normalizes the path (case, trailing slash); use its spelling so the session lines up.
  const trim = (x: string): string => x.replace(/[\\/]+$/, '').toLowerCase()
  const path = projects.find((x) => trim(x.path) === trim(p))?.path ?? p
  useUi.getState().setActiveProject(path)
  await newShell(path)
}

/** Folders dragged in from the desktop: each one is added and gets a shell, like "Add folder". */
export async function addDroppedFolders(paths: string[]): Promise<void> {
  for (const p of paths) await addProjectPath(p)
}

/**
 * Opens a saved workspace: one session per pane, arranged as configured, each typing its start
 * text once its prompt is ready. Panes without a folder are skipped.
 */
export async function launchWorkspace(config: LaunchConfig): Promise<void> {
  const ui = useUi.getState()
  const name = config.name.trim() || 'Workspace'
  const panes = openablePanes(config)
  if (panes.length === 0) {
    ui.toast(t('{name}: no pane has a folder yet', { name }), 'error')
    return
  }
  const ids: string[] = []
  for (const pane of panes) {
    try {
      const s = await window.step.invoke('host:create', {
        projectPath: pane.cwd,
        presetId: pane.presetId || 'shell',
        title: paneTitle(config, pane),
        runOnStart: pane.runOnStart?.trim() || undefined,
        ...currentDims()
      })
      useData.getState().patchSession(s)
      ids.push(s.id)
    } catch (e: any) {
      ui.toast(`${name}: ${e?.message ?? t('a pane could not start')}`, 'error')
    }
  }
  if (ids.length === 0) return
  ui.setActiveProject(panes[0].cwd)
  ui.openView(layoutFor(ids, config.split), ids[0])
}

/** Opens the workspace a step://workspace/<name> link named, and says so when there is none. */
export async function openWorkspaceByKey(key: string): Promise<void> {
  const config = findWorkspace(usePrefs.getState().prefs?.launchConfigs ?? [], key)
  if (!config) {
    useUi.getState().toast(t('No workspace called "{name}"', { name: key }), 'error')
    return
  }
  await launchWorkspace(config)
}

export function hideProject(path: string): void {
  void window.step.invoke('projects:hide', path).then((projects) => useData.setState({ projects }))
}

export function historyFor(projectPath: string): HistorySession[] {
  const same = (a: string, b: string): boolean => {
    const na = a.replace(/[\\/]+$/, '')
    const nb = b.replace(/[\\/]+$/, '')
    return window.step.platform === 'win32' ? na.toLowerCase() === nb.toLowerCase() : na === nb
  }
  const open = new Set(Object.values(useData.getState().sessions).map((s) => s.agent.sessionId).filter(Boolean))
  return useData
    .getState()
    .history.filter((h) => same(h.projectPath, projectPath) && !open.has(h.sessionId) && !h.title.startsWith('/'))
    .sort((a, b) => b.lastAt - a.lastAt)
}

export async function resumeHistory(h: HistorySession): Promise<void> {
  await createSession(h.projectPath, 'claude', { resumeId: h.sessionId, title: h.title })
}

/** The "+" menu: shell first, then installed agents, then resuming a past Claude conversation. */
export async function newSessionMenu(projectPath: string): Promise<void> {
  const presets = useData.getState().presets.filter((p) => p.installed)
  const agents = presets.filter((p) => p.id !== 'shell')
  const hasHistory = historyFor(projectPath).length > 0
  const items: MenuItemSpec[] = [{ id: 'shell', label: t('New shell') }]
  if (agents.length) {
    items.push(sep, ...agents.map((p) => ({ id: `new:${p.id}`, label: p.name })))
  }
  if (hasHistory) items.push(sep, { id: 'resume', label: t('Resume a Claude Code conversation…') })
  // With a pane in front, a new shell can also go beside it rather than in a view of its own.
  const beside = useUi.getState().activeId
  if (beside) items.push(sep, { id: 'split-right', label: t('Split right with a new shell') }, { id: 'split-down', label: t('Split down with a new shell') })
  const pick = await popup(items)
  if (!pick) return
  if (pick === 'shell') await newShell(projectPath)
  else if (pick === 'resume') useUi.getState().openPalette('', 'resume', projectPath)
  else if (pick === 'split-right' || pick === 'split-down') await splitWithNewShell(pick === 'split-right' ? 'row' : 'column', beside ?? undefined)
  else if (pick.startsWith('new:')) await createSession(projectPath, pick.slice(4))
}

export async function sessionMenu(row: SidebarSession, pos: MenuPosition = {}): Promise<void> {
  const ui = useUi.getState()
  const s = row.session
  const canResume = sessionCanResume(s)
  const grouped = ui.views.some((v) => hasLeaf(v, s.id) && leaves(v).length > 1)
  // Another session can be put beside the pane in front, unless it is that pane or already shares its view.
  const front = ui.activeId
  const beside = !!front && front !== s.id && !s.archived && !ui.views.some((v) => hasLeaf(v, front) && hasLeaf(v, s.id))
  const pick = await popup([
    { id: 'rename', label: t('Rename') },
    { id: 'pin', label: t(s.pinned ? 'Unpin' : 'Pin') },
    sep,
    { id: 'beside-right', label: t('Open to the right of the current pane'), enabled: beside },
    { id: 'beside-down', label: t('Open below the current pane'), enabled: beside },
    { id: 'detach', label: t('Move to its own view'), enabled: grouped },
    s.archived ? { id: 'restore', label: t(canResume ? 'Restore and resume conversation' : 'Restore') } : { id: 'restart', label: t(canResume ? 'Restart and resume conversation' : 'Restart') },
    { id: 'kill', label: t('Kill process'), enabled: s.alive },
    s.archived ? { id: 'unarchive', label: t('Unarchive') } : { id: 'archive', label: t('Archive') },
    sep,
    { id: 'folder', label: t('Open folder') },
    { id: 'copyPath', label: t('Copy path') },
    { id: 'copyId', label: t('Copy Claude session id'), enabled: !!s.agent.sessionId },
    sep,
    { id: 'close', label: t(s.archived ? 'Delete' : 'Close') }
  ], pos)
  switch (pick) {
    case 'rename':
      ui.setRenaming(s.id)
      break
    case 'pin':
      pinSession(s.id, !s.pinned)
      break
    case 'detach':
      ui.detach(s.id)
      break
    case 'beside-right':
    case 'beside-down': {
      const target = useUi.getState().activeId
      if (target && target !== s.id) useUi.getState().dropSession(s.id, target, pick === 'beside-right' ? 'right' : 'bottom')
      break
    }
    case 'archive':
      await archiveSession(s.id)
      break
    case 'unarchive':
      window.step.send('host:archive', s.id, false)
      break
    case 'restore':
      restoreSession(s.id)
      break
    case 'restart':
      restartSession(s.id)
      break
    case 'kill':
      killSession(s.id)
      break
    case 'folder':
      openFolder(s.projectPath)
      break
    case 'copyPath':
      copyText(s.projectPath, t('Path copied'))
      break
    case 'copyId':
      if (s.agent.sessionId) copyText(s.agent.sessionId, t('Session id copied'))
      break
    case 'close':
      await closeSession(s.id)
      break
  }
}

export async function projectMenu(project: SidebarProject, pos: MenuPosition = {}): Promise<void> {
  const presets = useData.getState().presets.filter((p) => p.installed && p.id !== 'shell')
  const prefs = usePrefs.getState()
  const pick = await popup([
    { id: 'shell', label: t('New shell') },
    { label: t('New agent session'), submenu: presets.map((p) => ({ id: `new:${p.id}`, label: p.name })), enabled: presets.length > 0 },
    { id: 'resume', label: t('Resume a Claude Code conversation…'), enabled: historyFor(project.path).length > 0 },
    sep,
    { id: 'folder', label: t('Open folder') },
    { id: 'copyPath', label: t('Copy path') },
    sep,
    { id: 'collapseAll', label: t('Collapse all projects') },
    { id: 'remove', label: t('Remove from sidebar') }
  ], pos)
  if (!pick) return
  if (pick.startsWith('new:')) {
    await createSession(project.path, pick.slice(4))
    return
  }
  switch (pick) {
    case 'shell':
      await newShell(project.path)
      break
    case 'resume':
      useUi.getState().openPalette('', 'resume', project.path)
      break
    case 'folder':
      openFolder(project.path)
      break
    case 'copyPath':
      copyText(project.path, t('Path copied'))
      break
    case 'collapseAll':
      void prefs.set({ collapsedProjects: useData.getState().projects.map((p) => p.path) })
      break
    case 'remove':
      hideProject(project.path)
      break
  }
}

/**
 * Right-click on empty sidebar space. Starts something in the folder in use (the one last
 * clicked, else the active session's, else the first), or offers to add a folder.
 */
export async function sidebarMenu(pos: MenuPosition = {}): Promise<void> {
  const data = useData.getState()
  const ui = useUi.getState()
  const active = ui.activeId ? data.sessions[ui.activeId] : undefined
  const wanted = (ui.activeProject ?? active?.projectPath)?.toLowerCase()
  const folder = data.projects.find((p) => p.path.toLowerCase() === wanted) ?? data.projects[0]
  const presets = data.presets.filter((p) => p.installed && p.id !== 'shell')
  const where = folder && data.projects.length > 1 ? ` ${t('in {folder}', { folder: folder.name })}` : ''
  const items: MenuItemSpec[] = folder
    ? [
        { id: 'shell', label: `${t('New shell')}${where}` },
        { label: `${t('New agent session')}${where}`, submenu: presets.map((p) => ({ id: `new:${p.id}`, label: p.name })), enabled: presets.length > 0 },
        sep,
        { id: 'add', label: t('Add folder…') }
      ]
    : [{ id: 'add', label: t('Add folder…') }]
  const pick = await popup(items, pos)
  if (!pick) return
  if (pick === 'add') await addProject()
  else if (folder && pick === 'shell') await newShell(folder.path)
  else if (folder && pick.startsWith('new:')) await createSession(folder.path, pick.slice(4))
}

export function toggleProjectCollapsed(path: string): void {
  const prefs = usePrefs.getState()
  const cur = prefs.prefs?.collapsedProjects ?? []
  const has = cur.some((p) => p.toLowerCase() === path.toLowerCase())
  void prefs.set({ collapsedProjects: has ? cur.filter((p) => p.toLowerCase() !== path.toLowerCase()) : [...cur, path] })
}
