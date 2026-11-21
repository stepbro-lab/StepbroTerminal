import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { FolderPlus, Plus, Settings, Ungroup } from 'lucide-react'
import gsap from 'gsap'
import { Flip } from 'gsap/Flip'
import { useData } from '@/stores/data'
import { usePrefs } from '@/stores/prefs'
import { useUi } from '@/stores/ui'
import type { SidebarProject, SidebarSession } from '@/lib/sidebarModel'
import { useSidebarModel } from '@/lib/useSidebarModel'
import { addDroppedFolders, addProject, reorderProjects, sidebarMenu } from '@/lib/actions'
import { useFolderDrop } from '@/lib/folderDrop'
import { movedIds } from '@/lib/reorder'
import { registry } from '@/terminal/TerminalRegistry'
import { PROJECT_DRAG_TYPE, ProjectRow } from './ProjectRow'
import { SessionRow } from './SessionRow'
import { useReorder } from './useReorder'
import { TopitoDock } from '../topito/Topito'
import { t } from '@/lib/i18n'
import { titled } from '@/lib/shortcuts'

gsap.registerPlugin(Flip)

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
const DRAG_FIT_MS = 160

const reducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const PEEK_IN_S = 0.36
const PEEK_OUT_S = 0.18
// Docks it a little after the slide ends, so the last frames are never cut.
const PEEK_OUT_MS = 230

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
  const peek = useUi((s) => s.sidebarPeek)
  const shown = !collapsed
  const [peekOut, setPeekOut] = useState(false)
  const [lastPeek, setLastPeek] = useState(peek)
  if (lastPeek !== peek) {
    setLastPeek(peek)
    setPeekOut(!peek && collapsed && !reducedMotion())
  }
  useEffect(() => {
    if (!peekOut) return
    const t = window.setTimeout(() => setPeekOut(false), PEEK_OUT_MS)
    return () => window.clearTimeout(t)
  }, [peekOut])
  const floating = collapsed ? (peek ? 'in' : peekOut ? 'out' : undefined) : undefined
  const dragging = useRef(false)
  const list = useRef<HTMLDivElement>(null)
  const drop = useFolderDrop(addDroppedFolders)

  const before = useRef<ReturnType<typeof Flip.getState> | null>(null)
  const remember = useCallback((selector = '[data-session-row]') => {
    if (!list.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    before.current = Flip.getState(list.current.querySelectorAll(selector))
  }, [])
  const reorder = useReorder(model, remember)

  const [dragProject, setDragProject] = useState<string | null>(null)
  const [projectInsert, setProjectInsert] = useState<{ path: string; after: boolean } | null>(null)
  const projectPlan = (target: SidebarProject, e: React.DragEvent): { after: boolean; paths: string[] | null } | null => {
    const from = dragProject ?? e.dataTransfer.getData(PROJECT_DRAG_TYPE)
    if (!from || !model.some((p) => p.path === from)) return null
    const r = e.currentTarget.getBoundingClientRect()
    const after = e.clientY > r.top + r.height / 2
    const rows = model.map((p) => ({ id: p.path, pinned: false }))
    return { after, paths: movedIds(rows, from, target.path, after) }
  }
  const onProjectDragOver = (target: SidebarProject, e: React.DragEvent): void => {
    if (!e.dataTransfer.types.includes(PROJECT_DRAG_TYPE)) return
    const plan = projectPlan(target, e)
    if (!plan) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const next = plan.paths ? { path: target.path, after: plan.after } : null
    setProjectInsert((prev) => (prev?.path === next?.path && prev?.after === next?.after ? prev : next))
  }
  const onProjectDrop = (target: SidebarProject, e: React.DragEvent): void => {
    if (!e.dataTransfer.types.includes(PROJECT_DRAG_TYPE)) return
    const plan = projectPlan(target, e)
    if (!plan) return
    e.preventDefault()
    e.stopPropagation()
    setProjectInsert(null)
    setDragProject(null)
    if (!plan.paths) return
    remember('[data-project-block]')
    void reorderProjects(plan.paths)
  }
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
      const root = document.documentElement.style
      let frame = 0
      let latest = startW
      let fitTimer = window.setInterval(() => {
        registry.releaseFits()
        registry.holdFits()
      }, DRAG_FIT_MS)
      registry.holdFits()
      registry.beginResizeDrag(false)
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
        window.removeEventListener('blur', onUp)
        if (frame) cancelAnimationFrame(frame)
        window.clearInterval(fitTimer)
        fitTimer = 0
        root.setProperty('--sidebar-w', `${latest}px`)
        registry.releaseFits()
        registry.endResizeDrag(false)
        void setPrefs({ sidebarWidth: latest })
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
      window.addEventListener('blur', onUp)
    },
    [width, setPrefs]
  )

  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-w', `${width}px`)
  }, [width])

  const aside = useRef<HTMLElement>(null)
  const firstLayout = useRef(true)
  const shownAs = useRef<string | undefined>(undefined)
  useLayoutEffect(() => {
    const el = aside.current
    if (!el) return
    const settle = (): void => {
      el.style.width = shown ? 'var(--sidebar-w)' : '0px'
    }

    const fromPeek = shown && shownAs.current === 'in'
    if (firstLayout.current || reducedMotion() || fromPeek) {
      firstLayout.current = false
      settle()
      if (fromPeek) {
        registry.holdFits()
        registry.releaseFits()
      }
      return
    }
    gsap.killTweensOf(el)
    const from = el.getBoundingClientRect().width
    const to = shown ? width : 0
    const state = { w: from }
    registry.holdFits()
    gsap.to(state, {
      w: to,
      duration: 0.28,
      ease: 'power3.out',
      onUpdate: () => {
        el.style.width = `${state.w}px`
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
  }, [shown])
  // Picks up from wherever the panel is, so changing your mind mid-slide never jumps.
  useLayoutEffect(() => {
    const el = aside.current
    if (!el) return
    if (!floating || reducedMotion()) {
      gsap.killTweensOf(el)
      gsap.set(el, { clearProps: 'transform' })
      return
    }
    const away = -(el.offsetWidth + 24)
    if (floating === 'in') {
      if (!shownAs.current) gsap.set(el, { x: away })
      gsap.to(el, { x: 0, duration: PEEK_IN_S, ease: 'expo.out', overwrite: true })
    } else {
      gsap.to(el, { x: away, duration: PEEK_OUT_S, ease: 'power2.in', overwrite: true })
    }
  }, [floating])
  useLayoutEffect(() => {
    shownAs.current = floating
  })

  const ins = reorder.insert
  const mark = (row: SidebarSession): 'before' | 'after' | undefined => (ins?.id === row.id ? (ins.after ? 'after' : 'before') : undefined)
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
    <aside {...drop.props} ref={aside} className="sidebar relative flex h-full shrink-0 flex-col overflow-hidden" data-peek={floating}>
      <div
        ref={list}
        className="scroll-thin flex-1 pl-1 pr-2 pt-1"
        style={{ width: 'var(--sidebar-w)' }}
        onDragLeave={reorder.onDragLeave}
        onContextMenu={(e) => {
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
          <div key={p.path} data-project-block className="mb-1" style={{ opacity: dragProject === p.path ? 0.4 : undefined }}>
            <ProjectRow
              project={p}
              isActiveProject={activeProject?.toLowerCase() === p.path.toLowerCase()}
              insert={projectInsert?.path === p.path ? (projectInsert.after ? 'after' : 'before') : undefined}
              onDragStart={(project) => setDragProject(project.path)}
              onDragEnd={() => {
                setDragProject(null)
                setProjectInsert(null)
              }}
              onDragOver={onProjectDragOver}
              onDrop={onProjectDrop}
            />
            {!p.collapsed && rowsOf(p)}
            {!p.collapsed && archivedOf(p)}
          </div>
        ))}
      </div>
      <div className="relative mb-1 flex h-10 shrink-0 items-center justify-between pl-[4.25px] pr-2" style={{ width: 'var(--sidebar-w)' }}>
        <button className="fab" title={titled(t('Add folder'), 'add-project')} aria-label={t('Add folder')} onClick={() => void addProject()}>
          <Plus size={17} strokeWidth={2} />
        </button>
        <TopitoDock />
        <button className="fab fab-turn" title={titled(t('Settings'), 'settings')} aria-label={t('Settings')} onClick={() => setSettingsOpen(true)}>
          <Settings size={17} strokeWidth={1.8} />
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
