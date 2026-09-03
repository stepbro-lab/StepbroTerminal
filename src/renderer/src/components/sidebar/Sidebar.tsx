import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Plus, Settings } from 'lucide-react'
import { useData } from '@/stores/data'
import { usePrefs } from '@/stores/prefs'
import { useUi } from '@/stores/ui'
import { buildSidebar } from '@/lib/sidebarModel'
import { addProject } from '@/lib/actions'
import { ProjectRow } from './ProjectRow'
import { SessionRow } from './SessionRow'

export function useSidebarModel() {
  const projects = useData((s) => s.projects)
  const sessions = useData((s) => s.sessions)
  const prefs = usePrefs((s) => s.prefs)
  return useMemo(() => buildSidebar(projects, Object.values(sessions), prefs), [projects, sessions, prefs])
}

const MIN_W = 200
const MAX_W = 360

export function Sidebar() {
  const model = useSidebarModel()
  const prefs = usePrefs((s) => s.prefs)
  const setPrefs = usePrefs((s) => s.set)
  const activeProject = useUi((s) => s.activeProject)
  const setSettingsOpen = useUi((s) => s.setSettingsOpen)
  const width = prefs?.sidebarWidth ?? 240
  const collapsed = prefs?.sidebarCollapsed ?? false
  const dragging = useRef(false)

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

  return (
    <aside
      className="relative flex h-full shrink-0 flex-col overflow-hidden"
      style={{
        width: collapsed ? 0 : 'var(--sidebar-w)',
        transition: dragging.current ? undefined : 'width 200ms var(--ease)'
      }}
    >
      <div className="scroll-thin flex-1 px-2 pt-1" style={{ width: 'var(--sidebar-w)' }}>
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
            {!p.collapsed && p.sessions.map((row) => <SessionRow key={row.key} row={row} />)}
          </div>
        ))}
      </div>
      <div className="flex h-10 shrink-0 items-center justify-between px-2" style={{ width: 'var(--sidebar-w)' }}>
        <button className="icon-btn" title="Add folder" onClick={() => void addProject()}>
          <Plus size={15} />
        </button>
        <button className="icon-btn" title="Settings" onClick={() => setSettingsOpen(true)}>
          <Settings size={15} />
        </button>
      </div>
      {!collapsed && (
        <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-[var(--border-strong)]" onMouseDown={onDragStart} />
      )}
    </aside>
  )
}
