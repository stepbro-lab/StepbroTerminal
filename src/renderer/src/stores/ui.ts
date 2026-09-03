import { create } from 'zustand'
import { registry } from '@/terminal/TerminalRegistry'

export interface Toast {
  id: number
  text: string
  tone?: 'info' | 'error' | 'success'
}

export type PaletteMode = 'all' | 'resume'
export type SettingsPage = 'appearance' | 'terminal' | 'agents' | 'notifications' | 'shortcuts' | 'advanced'
export type SplitDir = 'row' | 'column'

interface UiState {
  /** The focused session; always equals panes[focus]. */
  activeId: string | null
  /** One or two sessions shown side by side. */
  panes: string[]
  focus: number
  splitDir: SplitDir
  activeProject: string | null
  paletteOpen: boolean
  paletteQuery: string
  paletteMode: PaletteMode
  paletteProject: string | null
  settingsOpen: boolean
  settingsPage: SettingsPage
  searchOpen: boolean
  renamingId: string | null
  toasts: Toast[]
  spinnerFrame: number
  maximized: boolean
  setActive: (id: string | null) => void
  focusPane: (index: number) => void
  split: (dir: SplitDir, id: string) => void
  unsplit: () => void
  dropPane: (id: string) => void
  setActiveProject: (path: string | null) => void
  openPalette: (query?: string, mode?: PaletteMode, project?: string | null) => void
  closePalette: () => void
  setPaletteQuery: (q: string) => void
  setSettingsOpen: (v: boolean) => void
  setSettingsPage: (p: SettingsPage) => void
  setSearchOpen: (v: boolean) => void
  setRenaming: (id: string | null) => void
  toast: (text: string, tone?: Toast['tone']) => void
  dismissToast: (id: number) => void
  tickSpinner: () => void
  setMaximized: (v: boolean) => void
}

let toastSeq = 1

export const useUi = create<UiState>((set, get) => ({
  activeId: null,
  panes: [],
  focus: 0,
  splitDir: 'row',
  activeProject: null,
  paletteOpen: false,
  paletteQuery: '',
  paletteMode: 'all',
  paletteProject: null,
  settingsOpen: false,
  settingsPage: 'appearance',
  searchOpen: false,
  renamingId: null,
  toasts: [],
  spinnerFrame: 0,
  maximized: false,
  // Selecting a session shows it in the focused pane; if it is already in a pane, that pane takes focus.
  setActive: (id) => {
    const { panes, focus, activeId } = get()
    if (id === null) {
      if (activeId === null && panes.length === 0) return
      set({ activeId: null, panes: [], focus: 0, searchOpen: false })
      window.step.send('win:setActiveSession', null)
      return
    }
    const idx = panes.indexOf(id)
    if (idx >= 0) {
      if (activeId === id) return
      set({ activeId: id, focus: idx, searchOpen: false })
    } else {
      const next = panes.length ? [...panes] : [id]
      if (panes.length) next[focus] = id
      set({ activeId: id, panes: next, searchOpen: false })
    }
    window.step.send('win:setActiveSession', id)
    window.step.send('host:viewed', id)
  },
  focusPane: (index) => {
    const id = get().panes[index]
    if (id) get().setActive(id)
  },
  split: (dir, id) => {
    const { activeId } = get()
    const panes = activeId && activeId !== id ? [activeId, id] : [id]
    set({ panes, focus: panes.length - 1, splitDir: dir, activeId: id, searchOpen: false })
    window.step.send('win:setActiveSession', id)
    window.step.send('host:viewed', id)
  },
  unsplit: () => {
    const { activeId } = get()
    set({ panes: activeId ? [activeId] : [], focus: 0 })
  },
  dropPane: (id) => {
    const { panes, focus } = get()
    if (!panes.includes(id)) return
    const next = panes.filter((p) => p !== id)
    const f = Math.min(focus, Math.max(0, next.length - 1))
    const activeId = next[f] ?? null
    set({ panes: next, focus: f, activeId })
    window.step.send('win:setActiveSession', activeId)
  },
  setActiveProject: (path) => set({ activeProject: path }),
  openPalette: (query = '', mode = 'all', project = null) =>
    set({ paletteOpen: true, paletteQuery: query, paletteMode: mode, paletteProject: project }),
  closePalette: () => {
    set({ paletteOpen: false, paletteMode: 'all', paletteProject: null })
    refocusTerminal(get().activeId)
  },
  setPaletteQuery: (paletteQuery) => set({ paletteQuery }),
  setSettingsOpen: (settingsOpen) => {
    set({ settingsOpen })
    if (!settingsOpen) refocusTerminal(get().activeId)
  },
  setSettingsPage: (settingsPage) => set({ settingsPage }),
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  setRenaming: (renamingId) => set({ renamingId }),
  toast: (text, tone = 'info') => {
    const id = toastSeq++
    set((s) => ({ toasts: [...s.toasts, { id, text, tone }] }))
    setTimeout(() => get().dismissToast(id), 4000)
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  tickSpinner: () => set((s) => ({ spinnerFrame: (s.spinnerFrame + 1) % 10 })),
  setMaximized: (maximized) => set({ maximized })
}))

/** Give focus back to the active terminal after an overlay closes, once React has unmounted it. */
function refocusTerminal(id: string | null): void {
  if (!id) return
  window.setTimeout(() => registry.focus(id), 0)
}

export const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
