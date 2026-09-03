import type { HistorySession, MenuItemSpec, Session } from '@shared/types'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { usePrefs } from '@/stores/prefs'
import { registry } from '@/terminal/TerminalRegistry'
import { popup, sep } from './menus'
import type { SidebarProject, SidebarSession } from './sidebarModel'

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
    ui.setActive(s.id)
    return s
  } catch (e: any) {
    ui.toast(e?.message ?? 'Could not start session', 'error')
    return null
  }
}

export const newShell = (projectPath: string): Promise<Session | null> => createSession(projectPath, 'shell')

export async function closeSession(id: string): Promise<void> {
  const s = useData.getState().sessions[id]
  if (!s) return
  if (s.alive && (s.status === 'working' || s.status === 'attention')) {
    const pick = await popup([{ id: 'close', label: 'Close anyway (something is still running)' }, { id: 'cancel', label: 'Keep it running' }])
    if (pick !== 'close') return
  }
  const ui = useUi.getState()
  if (ui.activeId === id) ui.setActive(nextSessionId(id))
  registry.dispose(id)
  window.step.send('host:close', id)
}

function nextSessionId(closing: string): string | null {
  const list = Object.values(useData.getState().sessions)
    .filter((s) => s.id !== closing)
    .sort((a, b) => b.updatedAt - a.updatedAt)
  return list[0]?.id ?? null
}

export function restartSession(id: string): void {
  registry.markDetached(id)
  window.step.send('host:restart', id)
}

export function killSession(id: string): void {
  window.step.send('host:kill', id)
}

export function renameSession(id: string, title: string): void {
  window.step.send('host:rename', id, title)
}

export function pinSession(id: string, pinned: boolean): void {
  window.step.send('host:pin', id, pinned)
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
  const projects = await window.step.invoke('projects:add', p)
  useData.setState({ projects })
  useUi.getState().setActiveProject(p)
  await newShell(p)
  return p
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
  const items: MenuItemSpec[] = [{ id: 'shell', label: 'New shell' }]
  if (agents.length) {
    items.push(sep, ...agents.map((p) => ({ id: `new:${p.id}`, label: p.name })))
  }
  if (hasHistory) items.push(sep, { id: 'resume', label: 'Resume a Claude Code conversation…' })
  const pick = await popup(items)
  if (!pick) return
  if (pick === 'shell') await newShell(projectPath)
  else if (pick === 'resume') useUi.getState().openPalette('', 'resume', projectPath)
  else if (pick.startsWith('new:')) await createSession(projectPath, pick.slice(4))
}

export async function sessionMenu(row: SidebarSession): Promise<void> {
  const ui = useUi.getState()
  const s = row.session
  const canResume = !!s.launch.resumeArgs && !!s.agent.sessionId
  const pick = await popup([
    { id: 'rename', label: 'Rename' },
    { id: 'pin', label: s.pinned ? 'Unpin' : 'Pin' },
    sep,
    { id: 'restart', label: canResume ? 'Restart and resume conversation' : 'Restart' },
    { id: 'kill', label: 'Kill process', enabled: s.alive },
    sep,
    { id: 'folder', label: 'Open folder' },
    { id: 'copyPath', label: 'Copy path' },
    { id: 'copyId', label: 'Copy Claude session id', enabled: !!s.agent.sessionId },
    sep,
    { id: 'close', label: 'Close' }
  ])
  switch (pick) {
    case 'rename':
      ui.setRenaming(s.id)
      break
    case 'pin':
      pinSession(s.id, !s.pinned)
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
      copyText(s.projectPath, 'Path copied')
      break
    case 'copyId':
      if (s.agent.sessionId) copyText(s.agent.sessionId, 'Session id copied')
      break
    case 'close':
      await closeSession(s.id)
      break
  }
}

export async function projectMenu(project: SidebarProject): Promise<void> {
  const presets = useData.getState().presets.filter((p) => p.installed && p.id !== 'shell')
  const prefs = usePrefs.getState()
  const pick = await popup([
    { id: 'shell', label: 'New shell' },
    { label: 'New agent session', submenu: presets.map((p) => ({ id: `new:${p.id}`, label: p.name })), enabled: presets.length > 0 },
    { id: 'resume', label: 'Resume a Claude Code conversation…', enabled: historyFor(project.path).length > 0 },
    sep,
    { id: 'folder', label: 'Open folder' },
    { id: 'copyPath', label: 'Copy path' },
    sep,
    { id: 'collapseAll', label: 'Collapse all projects' },
    { id: 'remove', label: 'Remove from sidebar' }
  ])
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
      copyText(project.path, 'Path copied')
      break
    case 'collapseAll':
      void prefs.set({ collapsedProjects: useData.getState().projects.map((p) => p.path) })
      break
    case 'remove':
      hideProject(project.path)
      break
  }
}

export function toggleProjectCollapsed(path: string): void {
  const prefs = usePrefs.getState()
  const cur = prefs.prefs?.collapsedProjects ?? []
  const has = cur.some((p) => p.toLowerCase() === path.toLowerCase())
  void prefs.set({ collapsedProjects: has ? cur.filter((p) => p.toLowerCase() !== path.toLowerCase()) : [...cur, path] })
}
