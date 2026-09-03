import { create } from 'zustand'
import { registry } from '@/terminal/TerminalRegistry'
import { dropOnto, hasLeaf, leaf, leaves, removeLeaf, setRatio, splitLeaf, type DropZone, type LayoutNode, type SplitDir } from '@/lib/layout'

export type { SplitDir, DropZone, LayoutNode }

export interface Toast {
  id: number
  text: string
  tone?: 'info' | 'error' | 'success'
}

export type PaletteMode = 'all' | 'resume' | 'prompts'
export type SettingsPage = 'appearance' | 'terminal' | 'agents' | 'notifications' | 'shortcuts' | 'advanced'

interface UiState {
  /** The focused session; always a leaf of the active view. */
  activeId: string | null
  /**
   * Every arrangement of panes the user has built is a view; one is shown at a time.
   * A session lives in at most one view. New sessions get a view of their own.
   */
  views: LayoutNode[]
  activeView: number
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

/** Takes `id` out of whichever view holds it; views left empty disappear. */
function withoutSession(views: LayoutNode[], id: string): LayoutNode[] {
  return views.map((v) => (hasLeaf(v, id) ? removeLeaf(v, id) : v)).filter((v): v is LayoutNode => v !== null)
}

export const useUi = create<UiState>((set, get) => ({
  activeId: null,
  views: [],
  activeView: 0,
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

  // Showing a session brings its view forward; a session with no view gets one of its own.
  setActive: (id) => {
    const { views, activeId } = get()
    if (id === null) {
      if (activeId === null && views.length === 0) return
      set({ activeId: null, views: [], activeView: 0, searchOpen: false })
      announce(null)
      return
    }
    const idx = views.findIndex((v) => hasLeaf(v, id))
    if (idx >= 0) {
      if (activeId === id && get().activeView === idx) return
      set({ activeId: id, activeView: idx, searchOpen: false })
    } else {
      set({ activeId: id, views: [...views, leaf(id)], activeView: views.length, searchOpen: false })
    }
    announce(id)
  },
  // Puts `id` beside the focused pane of the current view.
  split: (dir, id) => {
    const { activeId } = get()
    const views = withoutSession(get().views, id)
    const idx = activeId ? views.findIndex((v) => hasLeaf(v, activeId)) : -1
    if (idx < 0 || !activeId) {
      set({ activeId: id, views: [...views, leaf(id)], activeView: views.length, searchOpen: false })
    } else {
      const next = views.slice()
      next[idx] = splitLeaf(views[idx], activeId, dir, id)!
      set({ activeId: id, views: next, activeView: idx, searchOpen: false })
    }
    announce(id)
  },
  // Keeps only the focused pane in the current view; the others are left to the sidebar.
  unsplit: () => {
    const { views, activeView, activeId } = get()
    if (!activeId || !views[activeView]) return
    const next = views.slice()
    next[activeView] = leaf(activeId)
    set({ views: next })
  },
  dropPane: (id) => {
    const { views, activeView, activeId } = get()
    const holder = views.findIndex((v) => hasLeaf(v, id))
    if (holder < 0) return
    const next = withoutSession(views, id)
    let view = Math.min(activeView, Math.max(0, next.length - 1))
    if (holder < activeView || (holder === activeView && !next[holder])) view = Math.max(0, Math.min(view, next.length - 1))
    const nextActive = activeId === id ? (leaves(next[view] ?? null)[0] ?? null) : activeId
    set({ views: next, activeView: view, activeId: nextActive })
    if (nextActive !== activeId) announce(nextActive)
  },
  // Drops `id` onto `target`'s pane edge (or center) inside whatever view holds the target.
  dropSession: (id, target, zone) => {
    const { views } = get()
    const targetIdx = views.findIndex((v) => hasLeaf(v, target))
    if (targetIdx < 0 || id === target) {
      set({ dragging: null })
      return
    }
    const sameView = hasLeaf(views[targetIdx], id)
    const base = sameView ? views : withoutSession(views, id)
    const idx = base.findIndex((v) => hasLeaf(v, target))
    const next = base.slice()
    next[idx] = dropOnto(base[idx], id, target, zone)!
    set({ views: next, activeView: idx, activeId: id, dragging: null, searchOpen: false })
    announce(id)
  },
  setDragging: (dragging) => set({ dragging }),
  setRatio: (path, ratio) => {
    const { views, activeView } = get()
    if (!views[activeView]) return
    const next = views.slice()
    next[activeView] = setRatio(views[activeView], path, ratio)
    set({ views: next })
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

/** The view on screen. */
export const activeLayout = (s: { views: LayoutNode[]; activeView: number }): LayoutNode | null => s.views[s.activeView] ?? null

/** Sessions shown in the current view. */
export function paneIds(): string[] {
  return leaves(activeLayout(useUi.getState()))
}

/** Sessions placed in any view. */
export function allPaneIds(): string[] {
  return useUi.getState().views.flatMap((v) => leaves(v))
}

/** Give focus back to the active terminal after an overlay closes, once React has unmounted it. */
function refocusTerminal(id: string | null): void {
  if (!id) return
  window.setTimeout(() => registry.focus(id), 0)
}

export const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
