import { create } from 'zustand'
import { registry } from '@/terminal/TerminalRegistry'

export interface Toast {
  id: number
  text: string
  tone?: 'info' | 'error' | 'success'
}

export type PaletteMode = 'all' | 'resume'
export type SettingsPage = 'appearance' | 'terminal' | 'agents' | 'notifications' | 'shortcuts' | 'advanced'

interface UiState {
  activeId: string | null
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
  setActive: (id) => {
    if (get().activeId === id) return
    set({ activeId: id, searchOpen: false })
    window.step.send('win:setActiveSession', id)
    if (id) window.step.send('host:viewed', id)
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
