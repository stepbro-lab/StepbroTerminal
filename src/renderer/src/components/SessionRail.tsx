import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Folder, Plus } from 'lucide-react'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { newSessionMenu, projectMenu, sessionMenu, addProject } from '@/lib/actions'
import { popup, sep } from '@/lib/menus'
import { notePointerOnRail, railProject, railStatus } from '@/lib/rail'
import { useSidebarModel } from '@/lib/useSidebarModel'
import { Spring, type SpringConfig } from '@/lib/spring'
import { DRAG_TYPE } from './pane/TerminalPane'
import { AgentLogo } from './sidebar/AgentLogo'
import { t } from '@/lib/i18n'

const LINGER_MS = 220
const REST_PITCH = 10
const OPEN_PITCH = 38
const GAP = 4
const OPENING: SpringConfig = { stiffness: 380, damping: 22 }
const WELL_OPENING: SpringConfig = { stiffness: 300, damping: 21 }
const CLOSING: SpringConfig = { stiffness: 480, damping: 36 }
const STAGGER_OPEN_MS = 32
const STAGGER_CLOSE_MS = 12
const ADD_FOLDER = '\0add-folder'

class RailMotion {
  root: HTMLDivElement | null = null
  open = false
  private readonly rows = new Map<string, { spring: Spring; timer: number }>()
  private readonly well = new Spring(0, () => this.queue())
  private queued = false

  private row(id: string): { spring: Spring; timer: number } {
    let r = this.rows.get(id)
    if (!r) {
      r = { spring: new Spring(0, () => this.queue()), timer: 0 }
      this.rows.set(id, r)
      if (this.open) r.spring.to(1, OPENING)
    }
    return r
  }

  sync(ids: string[]): void {
    for (const [id, r] of this.rows) {
      if (ids.includes(id)) continue
      r.spring.stop()
      window.clearTimeout(r.timer)
      this.rows.delete(id)
    }
    ids.forEach((id) => this.row(id))
    this.layout()
  }

  setOpen(open: boolean): void {
    if (open === this.open) return
    this.open = open
    this.well.to(open ? 1 : 0, open ? WELL_OPENING : CLOSING)
    const ids = this.order()
    ids.forEach((id, i) => {
      const r = this.row(id)
      window.clearTimeout(r.timer)
      const delay = open ? i * STAGGER_OPEN_MS : (ids.length - 1 - i) * STAGGER_CLOSE_MS
      r.timer = window.setTimeout(() => r.spring.to(open ? 1 : 0, open ? OPENING : CLOSING), delay)
    })
  }

  dispose(): void {
    this.well.stop()
    for (const r of this.rows.values()) {
      r.spring.stop()
      window.clearTimeout(r.timer)
    }
  }

  private order(): string[] {
    return this.root ? [...this.root.querySelectorAll<HTMLElement>('[data-rail-row]')].map((el) => el.dataset.id!) : []
  }

  private queue(): void {
    if (this.queued) return
    this.queued = true
    queueMicrotask(() => {
      this.queued = false
      this.layout()
    })
  }

  private layout(): void {
    const root = this.root
    if (!root) return
    let y = 0
    let slowest = Infinity
    for (const el of root.querySelectorAll<HTMLElement>('[data-rail-row]')) {
      const q = Math.max(0, this.rows.get(el.dataset.id!)?.spring.value ?? 0)
      el.style.setProperty('--q', q.toFixed(4))
      el.style.setProperty('--y', `${y.toFixed(2)}px`)
      y += REST_PITCH + (OPEN_PITCH - REST_PITCH) * q
      slowest = Math.min(slowest, q)
    }
    const m = Math.max(0, this.well.value)
    const fq = Math.min(1, slowest === Infinity ? m : slowest)
    root.style.setProperty('--m', m.toFixed(4))
    root.style.setProperty('--fq', fq.toFixed(4))
    root.style.setProperty('--foot-y', `${y.toFixed(2)}px`)
    root.style.setProperty('--span', `${(y - GAP + OPEN_PITCH * fq).toFixed(2)}px`)
  }
}

export function SessionRail() {
  const model = useSidebarModel()
  const presets = useData((s) => s.presets)
  const activeProject = useUi((s) => s.activeProject)
  const activeId = useUi((s) => s.activeId)
  const setActive = useUi((s) => s.setActive)
  const setActiveProject = useUi((s) => s.setActiveProject)
  const [open, setOpen] = useState(false)
  const motion = useRef<RailMotion | null>(null)
  motion.current ??= new RailMotion()
  const linger = useRef(0)

  const project = railProject(model, activeProject, activeId)
  const rows = project?.sessions ?? []
  const ids = rows.map((r) => r.id).join('\n')

  useLayoutEffect(() => {
    motion.current!.sync(ids ? ids.split('\n') : [])
  }, [ids])
  useEffect(
    () => () => {
      window.clearTimeout(linger.current)
      motion.current!.dispose()
    },
    []
  )

  if (!project || rows.length === 0) return null
  const others = model.filter((p) => p.path !== project.path)

  const show = (): void => {
    notePointerOnRail()
    window.clearTimeout(linger.current)
    setOpen(true)
    motion.current!.setOpen(true)
  }
  const hide = (): void => {
    notePointerOnRail()
    window.clearTimeout(linger.current)
    linger.current = window.setTimeout(() => {
      setOpen(false)
      motion.current!.setOpen(false)
    }, LINGER_MS)
  }

  const switchFolder = async (e: React.MouseEvent): Promise<void> => {
    const pick = await popup([...others.map((p) => ({ id: p.path, label: p.name })), ...(others.length ? [sep] : []), { id: ADD_FOLDER, label: t('Add folder…') }], {
      anchor: e.currentTarget as HTMLElement
    })
    if (!pick) return
    if (pick === ADD_FOLDER) return void addProject()
    setActiveProject(pick)
    const first = model.find((p) => p.path === pick)?.sessions[0]
    if (first) setActive(first.id)
  }

  return (
    <div
      ref={(el) => {
        motion.current!.root = el
      }}
      className="rail no-drag"
      data-open={open}
      data-bar-keep={open || undefined}
      style={{ '--n': rows.length } as React.CSSProperties}
      onMouseEnter={show}
      onMouseMove={notePointerOnRail}
      onMouseLeave={hide}
      aria-label={t('Sessions')}
    >
      <div className="rail-well" />
      {rows.map((row) => {
        const color = presets.find((p) => p.id === row.presetId)?.color
        return (
          <button
            key={row.id}
            data-rail-row
            data-id={row.id}
            data-session-row={row.id}
            className="rail-row"
            data-active={row.id === activeId}
            data-status={railStatus(row)}
            title={row.title}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(DRAG_TYPE, row.id)
              e.dataTransfer.effectAllowed = 'move'
              useUi.getState().setDragging(row.id)
            }}
            onDragEnd={() => useUi.getState().setDragging(null)}
            onClick={() => setActive(row.id)}
            onContextMenu={(e) => {
              e.preventDefault()
              void sessionMenu(row, { x: e.clientX, y: e.clientY })
            }}
          >
            <span className="rail-mark" style={{ '--brand': color } as React.CSSProperties}>
              <AgentLogo presetId={row.presetId} size={14} />
            </span>
            <span className="rail-title">{row.title}</span>
          </button>
        )
      })}
      <div className="rail-foot">
        <button className="rail-foot-btn" onClick={() => void newSessionMenu(project.path)} title={t('New session')}>
          <Plus size={14} strokeWidth={2.2} />
          <span className="truncate">{t('New session')}</span>
        </button>
        <button
          className="rail-foot-btn rail-folder"
          onClick={(e) => void switchFolder(e)}
          onContextMenu={(e) => {
            e.preventDefault()
            void projectMenu(project, { x: e.clientX, y: e.clientY })
          }}
          title={t('Switch folder')}
        >
          <Folder size={13} />
          <span className="truncate">{project.name}</span>
        </button>
      </div>
    </div>
  )
}
