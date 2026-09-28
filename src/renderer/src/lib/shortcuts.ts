import { useData } from '@/stores/data'
import { usePrefs } from '@/stores/prefs'
import { useUi } from '@/stores/ui'
import { addProject, closeSession, newShell, redrawSession, restartSession, splitWithNewShell } from './actions'
import { flatSessions, type SidebarProject } from './sidebarModel'
import { registry } from '@/terminal/TerminalRegistry'
import { jumpToAttention } from './attention'
import { useNotes } from '@/stores/notes'
import { displayChord, matchShortcut, resolveBindings, type Bindings, type ShortcutId, type ShortcutMatch } from '@shared/keybindings'
import { t } from '@/lib/i18n'

const isMac = window.step.platform === 'darwin'

export type Command = ShortcutId

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
      if (!jumpToAttention()) ui.toast(t('Nothing needs you right now'))
      break
    case 'next-view':
      ui.cycleView(1)
      break
    case 'prev-view':
      ui.cycleView(-1)
      break
    case 'detach-pane':
      if (ui.activeId) ui.detach(ui.activeId)
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
    case 'notes':
      useNotes.getState().toggle()
      break
    case 'jump':
      break
  }
}

// ---- bindings ----

let cachedFor: unknown = undefined
let cached: Bindings | null = null

/** The shortcuts in force: defaults with the user's changes from prefs applied. */
export function currentBindings(): Bindings {
  const kb = usePrefs.getState().prefs?.keybindings
  if (!cached || cachedFor !== kb) {
    cached = resolveBindings(kb, isMac)
    cachedFor = kb
  }
  return cached
}

/** Maps a keydown to a shortcut, or null. Shared by the window listener and xterm's key handler. */
export function commandFor(ev: KeyboardEvent): ShortcutMatch | null {
  return matchShortcut(ev, currentBindings(), isMac)
}

/** The chord for a shortcut as people read it ("Ctrl ⇧ N"), or "" when it has no key. */
export function shortcutLabel(id: ShortcutId): string {
  const c = currentBindings()[id]
  return c ? displayChord(c, isMac) : ''
}

/** "Find (Ctrl F)", or just "Find" when the shortcut has no key. */
export function titled(text: string, id: ShortcutId): string {
  const l = shortcutLabel(id)
  return l ? `${text} (${l})` : text
}

/** Hooks that follow the user's changes. */
export function useBinding(id: ShortcutId): string | null {
  usePrefs((s) => s.prefs?.keybindings)
  return currentBindings()[id]
}
export function useShortcutLabel(id: ShortcutId): string {
  usePrefs((s) => s.prefs?.keybindings)
  return shortcutLabel(id)
}

/** While Settings records a new shortcut every key goes there, so the app does not act on it. */
let capture: ((ev: KeyboardEvent) => void) | null = null
export function setShortcutCapture(fn: ((ev: KeyboardEvent) => void) | null): void {
  capture = fn
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
  if (capture) {
    capture(ev)
    return true
  }
  const ui = useUi.getState()
  if (ev.key === 'Escape') {
    if (useNotes.getState().open) {
      useNotes.getState().setOpen(false)
      return true
    }
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
  const m = commandFor(ev)
  if (!m) return false
  // A key held down repeats, dozens of times a second; a shortcut acts once.
  if (ev.repeat) return false
  if (m.id === 'jump') {
    if (m.digit) jumpTo(m.digit)
    return true
  }
  runCommand(m.id)
  return true
}
