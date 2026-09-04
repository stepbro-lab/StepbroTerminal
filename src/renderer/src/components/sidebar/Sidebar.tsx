import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { FolderPlus, Plus, Settings } from 'lucide-react'
import gsap from 'gsap'
import { Flip } from 'gsap/Flip'
import { useData } from '@/stores/data'
import { usePrefs } from '@/stores/prefs'
import { useUi } from '@/stores/ui'
import { buildSidebar, type SidebarProject, type SidebarSession } from '@/lib/sidebarModel'
import { leaves } from '@/lib/layout'
import { addDroppedFolders, addProject, sidebarMenu } from '@/lib/actions'
import { useFolderDrop } from '@/lib/folderDrop'
import { ProjectRow } from './ProjectRow'
import { SessionRow } from './SessionRow'
import { useReorder } from './useReorder'

gsap.registerPlugin(Flip)

export function useSidebarModel() {
  const projects = useData((s) => s.projects)
  const sessions = useData((s) => s.sessions)
  const prefs = usePrefs((s) => s.prefs)
  const views = useUi((s) => s.views)
  const groups = useMemo(() => views.map((v, i) => ({ view: i, ids: leaves(v) })).filter((g) => g.ids.length > 1), [views])
  return useMemo(() => buildSidebar(projects, Object.values(sessions), prefs, groups), [projects, sessions, prefs, groups])
}

/** Consecutive rows that share a split view, so they can be drawn inside one box. */
function chunk(rows: SidebarSession[]): Array<{ view: number | null; rows: SidebarSession[] }> {
  const out: Array<{ view: number | null; rows: SidebarSession[] }> = []
  for (const r of rows) {
    const last = out[out.length - 1]
    if (last && last.view !== null && last.view === r.view) last.rows.push(r)
    else out.push({ view: r.view, rows: [r] })
  }
  return out
}

const MIN_W = 200
const MAX_W = 360

export function Sidebar() {
  const model = useSidebarModel()
  const prefs = usePrefs((s) => s.prefs)
  const setPrefs = usePrefs((s) => s.set)
  const activeProject = useUi((s) => s.activeProject)
  const activeView = useUi((s) => s.activeView)
  const draggingId = useUi((s) => s.dragging)
  const setSettingsOpen = useUi((s) => s.setSettingsOpen)
  const width = prefs?.sidebarWidth ?? 240
  const collapsed = prefs?.sidebarCollapsed ?? false
  const dragging = useRef(false)
  const list = useRef<HTMLDivElement>(null)
  // Folders dragged in from the desktop land in the sidebar the same way "Add folder" would.
  const drop = useFolderDrop(addDroppedFolders)

  // Rows slide to their new places after a drop: remember where they were just before.
  const before = useRef<ReturnType<typeof Flip.getState> | null>(null)
  const remember = useCallback(() => {
    if (!list.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    before.current = Flip.getState(list.current.querySelectorAll('[data-session-row]'))
  }, [])
  const reorder = useReorder(model, remember)
  useLayoutEffect(() => {
    if (!before.current) return
    const state = before.current
    before.current = null
    Flip.from(state, { duration: 0.32, ease: 'power3.out', simple: true })
  }, [model])

  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      dragging.current = true
      const startX = e.clientX
      const startW = width
      const onMove = (ev: MouseEvent): void => {
        const w = Math.min(MAX_W, Math.max(MIN_W, startW + ev.clientX - startX))
        document.documentElement.style.setProperty('--sidebar-w', `${w}px`)
      }
      const onUp = (ev: MouseEvent): void => {
        dragging.current = false
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
        const w = Math.min(MAX_W, Math.max(MIN_W, startW + ev.clientX - startX))
        void setPrefs({ sidebarWidth: w })
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    [width, setPrefs]
  )

  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-w', `${width}px`)
  }, [width])

  const ins = reorder.insert
  const mark = (row: SidebarSession): 'before' | 'after' | undefined => (ins?.id === row.id ? (ins.after ? 'after' : 'before') : undefined)
  const rowsOf = (p: SidebarProject): React.ReactNode => {
    const sourceView = p.sessions.find((s) => s.id === draggingId)?.view ?? null
    return chunk(p.sessions).map((c) => {
      const boxed = c.view !== null && c.rows.length > 1
      const rows = c.rows.map((row) => (
        <SessionRow key={row.key} row={row} insert={boxed && sourceView !== c.view ? undefined : mark(row)} onDragOver={reorder.onDragOver} onDrop={reorder.onDrop} />
      ))
      if (!boxed) return rows
      // A session from outside lands above or below the whole box, so the box carries the mark.
      const first = c.rows[0]
      const last = c.rows[c.rows.length - 1]
      const outside = ins && sourceView !== c.view && ((ins.id === first.id && !ins.after) || (ins.id === last.id && ins.after))
      return (
        <div key={`view-${c.view}`} className="view-box" data-on={c.view === activeView} data-insert={outside ? (ins.after ? 'after' : 'before') : undefined}>
          {rows}
        </div>
      )
    })
  }

  return (
    <aside
      {...drop.props}
      className="relative flex h-full shrink-0 flex-col overflow-hidden"
      style={{
        width: collapsed ? 0 : 'var(--sidebar-w)',
        transition: dragging.current ? undefined : 'width 200ms var(--ease)'
      }}
    >
      <div
        ref={list}
        className="scroll-thin flex-1 px-2 pt-1"
        style={{ width: 'var(--sidebar-w)' }}
        onDragLeave={reorder.onDragLeave}
        onContextMenu={(e) => {
          // Rows bring their own menus; this one is for the space below them.
          if ((e.target as HTMLElement).closest('.row')) return
          e.preventDefault()
          void sidebarMenu({ x: e.clientX, y: e.clientY })
        }}
      >
        {model.length === 0 && (
          <div className="flex flex-col items-center gap-3 px-2 pt-10 text-center text-muted">
            <p>No folders yet.</p>
            <button className="btn btn-secondary" onClick={() => void addProject()}>
              Choose folder
            </button>
          </div>
        )}
        {model.map((p) => (
          <div key={p.path} className="mb-1">
            <ProjectRow project={p} isActiveProject={activeProject?.toLowerCase() === p.path.toLowerCase()} />
            {!p.collapsed && rowsOf(p)}
          </div>
        ))}
      </div>
      {/* Two icon buttons of the same weight. The plus sits over the icon column of the rows above. */}
      <div className="flex h-11 shrink-0 items-center justify-between px-2" style={{ width: 'var(--sidebar-w)' }}>
        <button className="icon-btn" style={{ width: 32, height: 32 }} title="Add folder" onClick={() => void addProject()}>
          <Plus size={20} strokeWidth={2.2} />
        </button>
        <button className="icon-btn" style={{ width: 32, height: 32 }} title="Settings" onClick={() => setSettingsOpen(true)}>
          <Settings size={17} />
        </button>
      </div>
      {drop.over && (
        <div className="drop-hint">
          <FolderPlus size={16} />
          <span>Drop to add folder</span>
        </div>
      )}
      {!collapsed && (
        <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-[var(--border-strong)]" onMouseDown={onDragStart} />
      )}
    </aside>
  )
}
