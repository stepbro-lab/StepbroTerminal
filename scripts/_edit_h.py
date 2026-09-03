def edit(p, pairs):
    s = open(p, encoding='utf-8').read()
    for a, b in pairs:
        if a not in s:
            raise SystemExit('MISSING in ' + p + ': ' + a[:70])
        s = s.replace(a, b)
    open(p, 'w', encoding='utf-8').write(s)


# ---- shared: layout types travel to main for persistence ----
edit('src/shared/types.ts', [
    ("""export interface HostInfo {""", """export type SplitDir = 'row' | 'column'
export type LayoutNode = { kind: 'leaf'; id: string } | { kind: 'split'; dir: SplitDir; ratio: number; a: LayoutNode; b: LayoutNode }

/** Pane arrangements the user built, saved between launches. */
export interface WorkspaceState {
  views: LayoutNode[]
  activeView: number
  activeId: string | null
}

export interface HostInfo {"""),
])

edit('src/renderer/src/lib/layout.ts', [
    ("""export type SplitDir = 'row' | 'column'
export type DropZone = 'left' | 'right' | 'top' | 'bottom' | 'center'

export type LayoutNode = { kind: 'leaf'; id: string } | { kind: 'split'; dir: SplitDir; ratio: number; a: LayoutNode; b: LayoutNode }
""", """import type { LayoutNode, SplitDir } from '@shared/types'

export type { LayoutNode, SplitDir }
export type DropZone = 'left' | 'right' | 'top' | 'bottom' | 'center'
"""),
])

# ---- ipc: workspace file ----
edit('src/shared/ipc.ts', [
    ("""  TranscriptDetails
} from './types'""", """  TranscriptDetails,
  WorkspaceState
} from './types'"""),
    ("""  'git:revert': (root: string, rel: string, untracked: boolean) => void
}""", """  'git:revert': (root: string, rel: string, untracked: boolean) => void
  'workspace:get': () => WorkspaceState | null
}"""),
    ("""  'clipboard:write': (text: string) => void
}""", """  'clipboard:write': (text: string) => void
  'workspace:set': (state: WorkspaceState) => void
}"""),
])

edit('src/main/ipc.ts', [
    ("import { gitChanges, gitDiff, gitRevert } from './git'", "import { gitChanges, gitDiff, gitRevert } from './git'\nimport { loadWorkspace, saveWorkspace } from './prefs'"),
    ("""  handle('git:revert', (root, rel, untracked) => gitRevert(root, rel, untracked))""", """  handle('git:revert', (root, rel, untracked) => gitRevert(root, rel, untracked))
  handle('workspace:get', () => loadWorkspace())
  on('workspace:set', (state) => saveWorkspace(state))"""),
])

edit('src/main/prefs.ts', [
    ("import type { Prefs } from '@shared/types'", "import type { Prefs, WorkspaceState } from '@shared/types'"),
    ("""export function savePrefs(p: Prefs): void {""", """function workspaceFile(): string {
  return path.join(app.getPath('userData'), 'workspace.json')
}

export function loadWorkspace(): WorkspaceState | null {
  try {
    const w = JSON.parse(fs.readFileSync(workspaceFile(), 'utf8')) as WorkspaceState
    return Array.isArray(w?.views) ? w : null
  } catch {
    return null
  }
}

let workspaceTimer: NodeJS.Timeout | null = null
export function saveWorkspace(state: WorkspaceState): void {
  if (workspaceTimer) clearTimeout(workspaceTimer)
  workspaceTimer = setTimeout(() => {
    workspaceTimer = null
    try {
      fs.writeFileSync(workspaceFile(), JSON.stringify(state))
    } catch {
      /* non-fatal */
    }
  }, 300)
}

export function savePrefs(p: Prefs): void {"""),
])

# ---- ui store: boot gate, restore, close and cycle views ----
edit('src/renderer/src/stores/ui.ts', [
    ("""  /** Session being dragged from the sidebar or a card header, for drop zones. */
  dragging: string | null""", """  /** True once the saved workspace has been applied; auto-selection waits for it. */
  booted: boolean
  /** Session being dragged from the sidebar or a card header, for drop zones. */
  dragging: string | null"""),
    ("""  setActive: (id: string | null) => void
  split: (dir: SplitDir, id: string) => void""", """  setActive: (id: string | null) => void
  restore: (views: LayoutNode[], activeView: number, activeId: string | null) => void
  closeView: (index: number) => void
  cycleView: (delta: number) => void
  split: (dir: SplitDir, id: string) => void"""),
    ("""  views: [],
  activeView: 0,
  dragging: null,""", """  views: [],
  activeView: 0,
  booted: false,
  dragging: null,"""),
    ("""  // Puts `id` beside the focused pane of the current view.
  split: (dir, id) => {""", """  restore: (views, activeView, activeId) => {
    const view = Math.min(Math.max(0, activeView), Math.max(0, views.length - 1))
    const focus = activeId && hasLeaf(views[view] ?? null, activeId) ? activeId : (leaves(views[view] ?? null)[0] ?? null)
    set({ views, activeView: view, activeId: focus, booted: true })
    announce(focus)
  },
  // Drops a whole arrangement; its sessions stay in the sidebar.
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
  // Puts `id` beside the focused pane of the current view.
  split: (dir, id) => {"""),
])

# ---- App: restore on boot, persist on change ----
edit('src/renderer/src/App.tsx', [
    ("""  useEffect(() => {
    void usePrefs.getState().load()
    void useData.getState().load()
    const offData = subscribeData()""", """  useEffect(() => {
    void usePrefs.getState().load()
    void useData
      .getState()
      .load()
      .then(() => window.step.invoke('workspace:get'))
      .then((saved) => {
        // Bring back the pane arrangements, dropping sessions that no longer exist.
        const sessions = useData.getState().sessions
        const views = (saved?.views ?? []).map((v) => pruneLayout(v, (id) => !!sessions[id])).filter((v): v is LayoutNode => v !== null)
        useUi.getState().restore(views, saved?.activeView ?? 0, saved?.activeId ?? null)
      })
    const persist = (): void => {
      const { views, activeView, activeId, booted } = useUi.getState()
      if (booted) window.step.send('workspace:set', { views, activeView, activeId })
    }
    const offWorkspace = useUi.subscribe((s, prev) => {
      if (s.views !== prev.views || s.activeView !== prev.activeView || s.activeId !== prev.activeId) persist()
    })
    const offData = subscribeData()"""),
    ("""    return () => {
      offData()
      offs.forEach((off) => off())""", """    return () => {
      offData()
      offWorkspace()
      offs.forEach((off) => off())"""),
    ("""  useEffect(() => {
    const ui = useUi.getState()
    if (hostState.kind !== 'connected') return
    for (const id of allPaneIds()) if (!sessions[id]) ui.dropPane(id)""", """  useEffect(() => {
    const ui = useUi.getState()
    if (hostState.kind !== 'connected' || !ui.booted) return
    for (const id of allPaneIds()) if (!sessions[id]) ui.dropPane(id)"""),
    ("import { leaves, zoneFor } from '@/lib/layout'", "import { leaves, zoneFor } from '@/lib/layout'"),
])

# App needs pruneLayout + LayoutNode imports
edit('src/renderer/src/App.tsx', [
    ("import { defaultTitle } from '@/lib/sidebarModel'", "import { defaultTitle } from '@/lib/sidebarModel'\nimport { pruneLayout, type LayoutNode } from '@/lib/layout'"),
])

# layout: prune helper
edit('src/renderer/src/lib/layout.ts', [
    ("""/** Removes a session; a split with one child left collapses into that child. */""", """/** Drops every leaf that fails `keep`, collapsing splits on the way. */
export function pruneLayout(node: LayoutNode | null, keep: (id: string) => boolean): LayoutNode | null {
  if (!node) return null
  if (node.kind === 'leaf') return keep(node.id) ? node : null
  const a = pruneLayout(node.a, keep)
  const b = pruneLayout(node.b, keep)
  if (a && b) return { ...node, a, b }
  return a ?? b
}

/** Removes a session; a split with one child left collapses into that child. */"""),
])

# ---- shortcuts: cycle views ----
edit('src/renderer/src/lib/shortcuts.ts', [
    ("""  | 'next-attention'
  | 'prompt-history'
""", """  | 'next-attention'
  | 'prompt-history'
  | 'next-view'
  | 'prev-view'
"""),
    ("""    case 'prompt-history':""", """    case 'next-view':
      ui.cycleView(1)
      break
    case 'prev-view':
      ui.cycleView(-1)
      break
    case 'prompt-history':"""),
    ("""    if (k === 'h') return 'prompt-history'""", """    if (k === 'h') return 'prompt-history'
    if (ev.key === ']' || ev.key === '}') return 'next-view'
    if (ev.key === '[' || ev.key === '{') return 'prev-view'"""),
])

edit('src/renderer/src/components/settings/pages.tsx', [
    ("""  ['Arrange panes', 'drag a session from the sidebar or a card title onto an edge'],""", """  ['Arrange panes', 'drag a session from the sidebar or a card title onto an edge'],
  ['Next / previous view', `${modKey} ⇧ ] and ${modKey} ⇧ [`],"""),
])
print('edits ok')
