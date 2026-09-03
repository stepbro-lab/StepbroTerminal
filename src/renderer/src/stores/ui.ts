import { create } from 'zustand'
import { registry } from '@/terminal/TerminalRegistry'
import { dropOnto, hasLeaf, leaf, leaves, removeLeaf, replaceLeaf, setRatio, splitLeaf, type DropZone, type LayoutNode, type SplitDir } from '@/lib/layout'

export type { SplitDir, DropZone, LayoutNode }

export interface Toast {
  id: number
  text: string
  tone?: 'info' | 'error' | 'success'
}

export type PaletteMode = 'all' | 'resume' | 'prompts'
export type SettingsPage = 'appearance' | 'terminal' | 'agents' | 'notifications' | 'shortcuts' | 'advanced'

interface UiState {
  /** The focused session; always one of the layout's leaves. */
  activeId: string | null
  /** Terminal panes as a tree of splits. */
  layout: LayoutNode | null
  /** Session being dragged from the sidebar or a card header, for drop zones. */
  dragging: string | null
  /** Side panel next to the terminals: a dev-server preview or the changes of a session. */
  side: { kind: 'preview'; url: string; sessionId: string } | { kind: 'changes'; sessionId: string } | null
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
  split: (dir: SplitDir, id: string) => void
  unsplit: () => void
  dropPane: (id: string) => void
  dropSession: (id: string, target: string, zone: DropZone) => void
  setDragging: (id: string | null) => void
  setRatio: (path: Array<'a' | 'b'>, ratio: number) => void
  setSide: (side: UiState['side']) => void
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

function announce(id: string | null): void {
  window.step.send('win:setActiveSession', id)
  if (id) window.step.send('host:viewed', id)
}

export const useUi = create<UiState>((set, get) => ({
  activeId: null,
  layout: null,
  dragging: null,
  side: null,
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
    const { layout, activeId } = get()
    if (id === null) {
      if (activeId === null && !layout) return
      set({ activeId: null, layout: null, searchOpen: false })
      announce(null)
      return
    }
    if (hasLeaf(layout, id)) {
      if (activeId === id) return
      set({ activeId: id, searchOpen: false })
    } else {
      const next = layout && activeId ? replaceLeaf(layout, activeId, id) : leaf(id)
      set({ activeId: id, layout: next, searchOpen: false })
    }
    announce(id)
  },
  split: (dir, id) => {
    const { layout, activeId } = get()
    const base = layout && hasLeaf(layout, id) ? removeLeaf(layout, id) : layout
    const next = base && activeId && activeId !== id && hasLeaf(base, activeId) ? splitLeaf(base, activeId, dir, id) : leaf(id)
    set({ layout: next, activeId: id, searchOpen: false })
    announce(id)
  },
  unsplit: () => {
    const { activeId } = get()
    set({ layout: activeId ? leaf(activeId) : null })
  },
  dropPane: (id) => {
    const { layout, activeId } = get()
    if (!hasLeaf(layout, id)) return
    const next = removeLeaf(layout, id)
    const nextActive = activeId === id ? (leaves(next)[0] ?? null) : activeId
    set({ layout: next, activeId: nextActive })
    if (nextActive !== activeId) announce(nextActive)
  },
  dropSession: (id, target, zone) => {
    const { layout } = get()
    const next = dropOnto(layout, id, target, zone)
    set({ layout: next, activeId: id, dragging: null, searchOpen: false })
    announce(id)
  },
  setDragging: (dragging) => set({ dragging }),
  setRatio: (path, ratio) => {
    const { layout } = get()
    if (layout) set({ layout: setRatio(layout, path, ratio) })
  },
  setSide: (side) => set({ side }),
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

/** Ids of the sessions currently shown in panes. */
export function paneIds(): string[] {
  return leaves(useUi.getState().layout)
}

/** Give focus back to the active terminal after an overlay closes, once React has unmounted it. */
function refocusTerminal(id: string | null): void {
  if (!id) return
  window.setTimeout(() => registry.focus(id), 0)
}

export const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
