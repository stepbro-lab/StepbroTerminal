import { useData } from '@/stores/data'
import { usePrefs } from '@/stores/prefs'
import { useUi } from '@/stores/ui'
import { addProject, closeSession, newShell, redrawSession, restartSession, splitWithNewShell } from './actions'
import { flatSessions, type SidebarProject } from './sidebarModel'
import { registry } from '@/terminal/TerminalRegistry'
import { jumpToAttention } from './attention'

const isMac = window.step.platform === 'darwin'

export type Command =
  | 'palette'
  | 'new-session'
  | 'new-shell'
  | 'add-project'
  | 'close-session'
  | 'toggle-sidebar'
  | 'find'
  | 'settings'
  | 'restart-session'
  | 'rename-session'
  | 'split-right'
  | 'split-down'
  | 'next-attention'
  | 'prompt-history'
  | 'next-view'
  | 'prev-view'
  | 'redraw'

let modelRef: SidebarProject[] = []
export function setSidebarModelRef(m: SidebarProject[]): void {
  modelRef = m
}

export function runCommand(cmd: Command): void {
  const ui = useUi.getState()
  const prefs = usePrefs.getState()
  const target = ui.activeProject ?? useData.getState().projects[0]?.path
  switch (cmd) {
    case 'palette':
      ui.paletteOpen ? ui.closePalette() : ui.openPalette('')
      break
    case 'new-session':
      if (!target) void addProject()
      else void newShell(target)
      break
    case 'new-shell':
      if (!target) void addProject()
      else void newShell(target)
      break
    case 'add-project':
      void addProject()
      break
    case 'close-session':
      if (ui.activeId) void closeSession(ui.activeId)
      break
    case 'toggle-sidebar':
      void prefs.set({ sidebarCollapsed: !prefs.prefs?.sidebarCollapsed })
      break
    case 'find':
      if (ui.activeId) ui.setSearchOpen(true)
      break
    case 'settings':
      ui.setSettingsOpen(!ui.settingsOpen)
      break
    case 'restart-session':
      if (ui.activeId) restartSession(ui.activeId)
      break
    case 'rename-session':
      if (ui.activeId) ui.setRenaming(ui.activeId)
      break
    case 'next-attention':
      if (!jumpToAttention()) ui.toast('Nothing needs you right now')
      break
    case 'next-view':
      ui.cycleView(1)
      break
    case 'prev-view':
      ui.cycleView(-1)
      break
    case 'prompt-history':
      if (ui.paletteOpen && ui.paletteMode === 'prompts') ui.closePalette()
      else ui.openPalette('', 'prompts')
      break
    case 'split-right':
    case 'split-down':
      void splitWithNewShell(cmd === 'split-right' ? 'row' : 'column')
      break
    case 'redraw':
      if (ui.activeId) redrawSession(ui.activeId)
      break
  }
}

/** Maps a keydown to an app command, or null. Shared by the window listener and xterm's key handler. */
export function commandFor(ev: KeyboardEvent): Command | 'jump' | null {
  const mod = isMac ? ev.metaKey : ev.ctrlKey
  if (!mod) return null
  const k = ev.key.toLowerCase()
  if (ev.shiftKey) {
    if (k === 'r') return 'restart-session'
    if (k === 'o') return 'add-project'
    if (k === 'h') return 'prompt-history'
    if (k === 'l') return 'redraw'
    if (ev.key === ']' || ev.key === '}') return 'next-view'
    if (ev.key === '[' || ev.key === '{') return 'prev-view'
    if (ev.key === '\\' || ev.key === '|') return 'split-down'
    return null
  }
  if (ev.key === '\\') return 'split-right'
  if (ev.altKey) return null
  switch (k) {
    case 'k':
      return 'palette'
    case 'j':
      return 'next-attention'
    case 'n':
      return 'new-session'
    case 't':
      return 'new-shell'
    case 'w':
      return 'close-session'
    case 'b':
      return 'toggle-sidebar'
    case 'f':
      return 'find'
    case ',':
      return 'settings'
  }
  if (/^[1-9]$/.test(ev.key)) return 'jump'
  return null
}

export function jumpTo(n: number): void {
  const row = flatSessions(modelRef)[n - 1]
  if (!row) return
  const ui = useUi.getState()
  ui.setActiveProject(row.session.projectPath)
  ui.setActive(row.id)
}

/** Window-level handler. Returns true when the event was consumed. */
export function handleKeydown(ev: KeyboardEvent): boolean {
  const ui = useUi.getState()
  if (ev.key === 'Escape') {
    if (ui.paletteOpen) {
      ui.closePalette()
      return true
    }
    if (ui.settingsOpen) {
      ui.setSettingsOpen(false)
      return true
    }
    if (ui.searchOpen) {
      ui.setSearchOpen(false)
      if (ui.activeId) registry.focus(ui.activeId)
      return true
    }
    return false
  }
  if (ev.key === 'F2' && ui.activeId) {
    runCommand('rename-session')
    return true
  }
  const cmd = commandFor(ev)
  if (!cmd) return false
  if (cmd === 'jump') {
    jumpTo(Number(ev.key))
    return true
  }
  runCommand(cmd)
  return true
}
