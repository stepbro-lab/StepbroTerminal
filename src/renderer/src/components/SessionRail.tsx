import { useEffect, useRef, useState } from 'react'
import { Folder, Plus } from 'lucide-react'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { newSessionMenu, sessionMenu } from '@/lib/actions'
import { popup } from '@/lib/menus'
import { railProject, railStatus } from '@/lib/rail'
import { useSidebarModel } from '@/lib/useSidebarModel'
import { DRAG_TYPE } from './pane/TerminalPane'
import { AgentLogo } from './sidebar/AgentLogo'
import { t } from '@/lib/i18n'

/** Long enough to cross the gap between two rows without the rail folding shut behind you. */
const LINGER_MS = 260

/**
 * The sessions of the folder in front, folded into the top-right corner of the terminal: one
 * bar per session beside its agent's mark, as little as a set of tally marks. A bar sweeps with
 * light while its agent works and turns amber while it waits on you. Point at the rail and the
 * bars open into pills with their titles, and a click puts that session in front; leave, and it
 * folds back. Drag a pill onto the terminal and that session lands beside the pane there, on
 * whichever side it is dropped. What the sidebar does at length, this does in a corner.
 */
export function SessionRail() {
  const model = useSidebarModel()
  const presets = useData((s) => s.presets)
  const activeProject = useUi((s) => s.activeProject)
  const activeId = useUi((s) => s.activeId)
  const setActive = useUi((s) => s.setActive)
  const setActiveProject = useUi((s) => s.setActiveProject)
  const [open, setOpen] = useState(false)
  const timer = useRef(0)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const show = (): void => {
    window.clearTimeout(timer.current)
    setOpen(true)
  }
  const hide = (): void => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setOpen(false), LINGER_MS)
  }

  const project = railProject(model, activeProject, activeId)
  if (!project || project.sessions.length === 0) return null
  const others = model.filter((p) => p.path !== project.path)

  const switchFolder = async (): Promise<void> => {
    const pick = await popup(others.map((p) => ({ id: p.path, label: p.name })))
    if (!pick) return
    setActiveProject(pick)
    const first = model.find((p) => p.path === pick)?.sessions[0]
    if (first) setActive(first.id)
  }

  return (
    <div className="rail no-drag" data-open={open} onMouseEnter={show} onMouseLeave={hide} aria-label={t('Sessions')}>
      {project.sessions.map((row) => {
        const color = presets.find((p) => p.id === row.presetId)?.color
        return (
          <button
            key={row.id}
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
            <span className="rail-mark" style={open && color ? { color } : undefined}>
              <AgentLogo presetId={row.presetId} size={12} />
            </span>
            <span className="rail-bar">
              <span className="rail-title">{row.title}</span>
            </span>
          </button>
        )
      })}
      <div className="rail-foot">
        <button className="rail-row rail-more" onClick={() => void newSessionMenu(project.path)} title={t('New session')}>
          <span className="rail-mark">
            <Plus size={12} strokeWidth={2.4} />
          </span>
          <span className="rail-bar">
            <span className="rail-title">{t('New session')}</span>
          </span>
        </button>
        {others.length > 0 && (
          <button className="rail-row rail-more" onClick={() => void switchFolder()} title={t('Switch folder')}>
            <span className="rail-mark">
              <Folder size={12} />
            </span>
            <span className="rail-bar">
              <span className="rail-title">{project.name}</span>
            </span>
          </button>
        )}
      </div>
    </div>
  )
}
