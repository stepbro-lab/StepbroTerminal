import { create } from 'zustand'
import { registry } from '@/terminal/TerminalRegistry'
import { dropOnto, hasLeaf, leaf, leaves, removeLeaf, setRatio, splitLeaf, type DropZone, type LayoutNode, type SplitDir } from '@/lib/layout'

export type { SplitDir, DropZone, LayoutNode }

export interface Toast {
  id: number
  text: string
  tone?: 'info' | 'error' | 'success'
}

export type SidePanel = { kind: 'preview'; url: string; sessionId: string } | { kind: 'changes'; sessionId: string }

export type PaletteMode = 'all' | 'resume' | 'prompts'
export type SettingsPage = 'appearance' | 'terminal' | 'agents' | 'workspaces' | 'notifications' | 'shortcuts' | 'archived' | 'advanced'

interface UiState {
  activeId: string | null
  views: LayoutNode[]
  activeView: number
  booted: boolean
  dragging: string | null
  sidebarPeek: boolean
  dismissedErrors: Record<string, string>
  sides: Record<string, SidePanel>
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
  fullscreen: boolean
  setActive: (id: string | null) => void
  restore: (views: LayoutNode[], activeView: number, activeId: string | null) => void
  closeView: (index: number) => void
  cycleView: (delta: number) => void
  split: (dir: SplitDir, id: string) => void
  openView: (layout: LayoutNode, focus: string) => void
  unsplit: () => void
  detach: (id: string) => void
  dropPane: (id: string) => void
  dropSession: (id: string, target: string, zone: DropZone) => void
  setDragging: (id: string | null) => void
  setSidebarPeek: (peek: boolean) => void
  dismissError: (id: string, error: string) => void
  setRatio: (path: Array<'a' | 'b'>, ratio: number) => void
  openSide: (side: SidePanel) => void
  closeSide: (sessionId: string) => void
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
  setFullscreen: (fullscreen: boolean) => void
}

let toastSeq = 1

function announce(id: string | null): void {
  window.step.send('win:setActiveSession', id)
  if (id) window.step.send('host:viewed', id)
}

function withoutSession(views: LayoutNode[], id: string): LayoutNode[] {
  return views.map((v) => (hasLeaf(v, id) ? removeLeaf(v, id) : v)).filter((v): v is LayoutNode => v !== null)
}

export const useUi = create<UiState>((set, get) => ({
  activeId: null,
  views: [],
  activeView: 0,
  booted: false,
  dragging: null,
  sidebarPeek: false,
  dismissedErrors: {},
  sides: {},
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
  fullscreen: false,

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
  restore: (views, activeView, activeId) => {
    const view = Math.min(Math.max(0, activeView), Math.max(0, views.length - 1))
    const focus = activeId && hasLeaf(views[view] ?? null, activeId) ? activeId : (leaves(views[view] ?? null)[0] ?? null)
    set({ views, activeView: view, activeId: focus, booted: true })
    announce(focus)
  },

  closeView: (index) => {
    const { views, activeView, activeId } = get()
    if (!views[index]) return
    const next = views.filter((_, i) => i !== index)
    const view = Math.min(activeView > index ? activeView - 1 : activeView, Math.max(0, next.length - 1))
    const focus = next[view] && activeId && hasLeaf(next[view], activeId) ? activeId : (leaves(next[view] ?? null)[0] ?? null)
    set({ views: next, activeView: view, activeId: focus })
    announce(focus)
  },
  cycleView: (delta) => {
    const { views, activeView, activeId } = get()
    if (views.length < 2) return
    const view = (activeView + delta + views.length) % views.length
    const focus = activeId && hasLeaf(views[view], activeId) ? activeId : (leaves(views[view])[0] ?? null)
    set({ activeView: view, activeId: focus, searchOpen: false })
    announce(focus)
  },
  openView: (layout, focus) => {
    let views = get().views
    for (const id of leaves(layout)) views = withoutSession(views, id)
    set({ activeId: focus, views: [...views, layout], activeView: views.length, searchOpen: false })
    announce(focus)
  },

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

  unsplit: () => {
    const { views, activeView, activeId } = get()
    if (!activeId || !views[activeView]) return
    const next = views.slice()
    next[activeView] = leaf(activeId)
    set({ views: next })
  },
  detach: (id) => {
    const views = withoutSession(get().views, id)
    set({ activeId: id, views: [...views, leaf(id)], activeView: views.length, searchOpen: false })
    announce(id)
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
  setSidebarPeek: (sidebarPeek) => set((s) => (s.sidebarPeek === sidebarPeek ? s : { sidebarPeek })),
  dismissError: (id, error) => set((s) => ({ dismissedErrors: { ...s.dismissedErrors, [id]: error } })),
  setRatio: (path, ratio) => {
    const { views, activeView } = get()
    if (!views[activeView]) return
    const next = views.slice()
    next[activeView] = setRatio(views[activeView], path, ratio)
    set({ views: next })
  },
  openSide: (side) => set({ sides: { ...get().sides, [side.sessionId]: side } }),
  closeSide: (sessionId) => {
    if (!get().sides[sessionId]) return
    const { [sessionId]: _closed, ...rest } = get().sides
    set({ sides: rest })
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
  setMaximized: (maximized) => set({ maximized }),
  setFullscreen: (fullscreen) => set({ fullscreen })
}))

export const activeLayout = (s: { views: LayoutNode[]; activeView: number }): LayoutNode | null => s.views[s.activeView] ?? null

export function paneIds(): string[] {
  return leaves(activeLayout(useUi.getState()))
}

export function allPaneIds(): string[] {
  return useUi.getState().views.flatMap((v) => leaves(v))
}

function refocusTerminal(id: string | null): void {
  if (!id) return
  window.setTimeout(() => registry.focus(id), 0)
}

export const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
