import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { FolderPlus, Plus, Settings, Ungroup } from 'lucide-react'
import gsap from 'gsap'
import { Flip } from 'gsap/Flip'
import { useData } from '@/stores/data'
import { usePrefs } from '@/stores/prefs'
import { useUi } from '@/stores/ui'
import { buildSidebar, type SidebarProject, type SidebarSession } from '@/lib/sidebarModel'
import { leaves } from '@/lib/layout'
import { addDroppedFolders, addProject, sidebarMenu } from '@/lib/actions'
import { useFolderDrop } from '@/lib/folderDrop'
import { registry } from '@/terminal/TerminalRegistry'
import { SidebarHeader } from '../Chrome'
import { ProjectRow } from './ProjectRow'
import { SessionRow } from './SessionRow'
import { useReorder } from './useReorder'
import { t } from '@/lib/i18n'

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
/** The margin the cards keep on the left once the sidebar is gone; matches the other sides. */
const EDGE_PX = 6.5
/** While the sidebar is dragged, terminals refit this often rather than on every pixel. */
const DRAG_FIT_MS = 160

const reducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function Sidebar() {
  const model = useSidebarModel()
  const prefs = usePrefs((s) => s.prefs)
  const setPrefs = usePrefs((s) => s.set)
  const activeProject = useUi((s) => s.activeProject)
  const activeView = useUi((s) => s.activeView)
  const draggingId = useUi((s) => s.dragging)
  const setSettingsOpen = useUi((s) => s.setSettingsOpen)
  const closeView = useUi((s) => s.closeView)
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

  // Dragging the edge: the width follows the pointer once per frame, the terminals refit only a few
  // times a second while it moves and once more when it stops, so the text stops shivering.
  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      dragging.current = true
      const startX = e.clientX
      const startW = width
      const root = document.documentElement.style
      let frame = 0
      let latest = startW
      let fitTimer = window.setInterval(() => {
        registry.releaseFits()
        registry.holdFits()
      }, DRAG_FIT_MS)
      registry.holdFits()
      const onMove = (ev: MouseEvent): void => {
        latest = Math.min(MAX_W, Math.max(MIN_W, startW + ev.clientX - startX))
        if (!frame) {
          frame = requestAnimationFrame(() => {
            frame = 0
            root.setProperty('--sidebar-w', `${latest}px`)
          })
        }
      }
      const onUp = (): void => {
        dragging.current = false
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
        if (frame) cancelAnimationFrame(frame)
        window.clearInterval(fitTimer)
        fitTimer = 0
        root.setProperty('--sidebar-w', `${latest}px`)
        registry.releaseFits()
        void setPrefs({ sidebarWidth: latest })
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    [width, setPrefs]
  )

  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-w', `${width}px`)
  }, [width])

  // Folding and unfolding: the sidebar slides with a tween rather than a CSS transition, the cards'
  // left margin grows as it goes, and the terminals fit once at the end instead of on every frame.
  const aside = useRef<HTMLElement>(null)
  const firstLayout = useRef(true)
  useLayoutEffect(() => {
    const el = aside.current
    if (!el) return
    const root = document.documentElement.style
    const settle = (): void => {
      el.style.width = collapsed ? '0px' : 'var(--sidebar-w)'
      root.setProperty('--pane-edge', collapsed ? `${EDGE_PX}px` : '0px')
    }
    if (firstLayout.current || reducedMotion()) {
      firstLayout.current = false
      settle()
      return
    }
    gsap.killTweensOf(el)
    const from = el.getBoundingClientRect().width
    const to = collapsed ? 0 : width
    const state = { w: from }
    registry.holdFits()
    gsap.to(state, {
      w: to,
      duration: 0.28,
      ease: 'power3.out',
      onUpdate: () => {
        el.style.width = `${state.w}px`
        root.setProperty('--pane-edge', `${(1 - state.w / Math.max(1, width)) * EDGE_PX}px`)
      },
      onComplete: () => {
        settle()
        registry.releaseFits()
      }
    })
    return () => {
      gsap.killTweensOf(state)
      registry.releaseFits()
    }
  }, [collapsed])

  const ins = reorder.insert
  const mark = (row: SidebarSession): 'before' | 'after' | undefined => (ins?.id === row.id ? (ins.after ? 'after' : 'before') : undefined)
  // Archived sessions sit dimmed under the live ones, a few at a time; a folder can show them all.
  const [showAllArchived, setShowAllArchived] = useState<Set<string>>(() => new Set())
  const archivedLimit = prefs?.archivedShown ?? 5
  const archivedOf = (p: SidebarProject): React.ReactNode => {
    if (p.archived.length === 0) return null
    const all = showAllArchived.has(p.path)
    const shown = all ? p.archived : p.archived.slice(0, archivedLimit)
    const hidden = p.archived.length - shown.length
    const toggle = (): void =>
      setShowAllArchived((prev) => {
        const next = new Set(prev)
        if (next.has(p.path)) next.delete(p.path)
        else next.add(p.path)
        return next
      })
    return (
      <>
        {shown.map((row) => (
          <SessionRow key={row.key} row={row} />
        ))}
        {(hidden > 0 || (all && p.archived.length > archivedLimit)) && (
          <button className="row w-full pl-[22px] text-left text-[11.5px]" style={{ color: 'var(--text-faint)' }} onClick={toggle}>
            {hidden > 0 ? t('{n} more archived', { n: hidden }) : t('Show fewer')}
          </button>
        )}
      </>
    )
  }
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
          <button className="view-box-ungroup icon-btn" title={t('Ungroup: each session on its own')} onClick={() => c.view !== null && closeView(c.view)}>
            <Ungroup size={12} />
          </button>
        </div>
      )
    })
  }

  return (
    <aside {...drop.props} ref={aside} className="relative flex h-full shrink-0 flex-col overflow-hidden">
      <SidebarHeader />
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
            <p>{t('No folders yet.')}</p>
            <button className="btn btn-secondary" onClick={() => void addProject()}>{t('Choose folder')}</button>
          </div>
        )}
        {model.map((p) => (
          <div key={p.path} className="mb-1">
            <ProjectRow project={p} isActiveProject={activeProject?.toLowerCase() === p.path.toLowerCase()} />
            {!p.collapsed && rowsOf(p)}
            {!p.collapsed && archivedOf(p)}
          </div>
        ))}
      </div>
      {/* Two round raised buttons of the same size and weight, level with the bottom edge of the pane beside them. */}
      <div className="mb-2 flex h-10 shrink-0 items-center justify-between px-2" style={{ width: 'var(--sidebar-w)' }}>
        <button className="fab" title={t('Add folder')} onClick={() => void addProject()}>
          <Plus size={20} strokeWidth={2.2} />
        </button>
        <button className="fab" title={t('Settings')} onClick={() => setSettingsOpen(true)}>
          <Settings size={18} strokeWidth={2} />
        </button>
      </div>
      {drop.over && (
        <div className="drop-hint">
          <FolderPlus size={16} />
          <span>{t('Drop to add folder')}</span>
        </div>
      )}
      {!collapsed && (
        <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-[var(--border-strong)]" onMouseDown={onDragStart} />
      )}
    </aside>
  )
}
