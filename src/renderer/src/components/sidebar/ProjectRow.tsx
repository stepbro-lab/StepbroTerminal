import { ChevronRight, Plus } from 'lucide-react'
import type { SidebarProject } from '@/lib/sidebarModel'
import { useUi } from '@/stores/ui'
import { newShell, projectMenu, toggleProjectCollapsed } from '@/lib/actions'
import { FolderIcon } from './DotSpinner'
import { BranchLabel } from '../BranchLabel'
import { t } from '@/lib/i18n'

/** The drag type of a folder row on its way to a new place in the sidebar. */
export const PROJECT_DRAG_TYPE = 'application/x-step-project'

interface Props {
  project: SidebarProject
  isActiveProject: boolean
  /** A dragged folder would land above or below this one. */
  insert?: 'before' | 'after'
  onDragStart?: (project: SidebarProject) => void
  onDragEnd?: () => void
  onDragOver?: (project: SidebarProject, e: React.DragEvent) => void
  onDrop?: (project: SidebarProject, e: React.DragEvent) => void
}

export function ProjectRow({ project, isActiveProject, insert, onDragStart, onDragEnd, onDragOver, onDrop }: Props) {
  const setActiveProject = useUi((s) => s.setActiveProject)
  const open = !project.collapsed

  return (
    <div className="group relative">
      <div
        className="row grid-cols-[16px_minmax(0,1fr)_auto] gap-2"
        data-tone="fg"
        data-insert={insert}
        draggable={!!onDragStart}
        onDragStart={(e) => {
          e.dataTransfer.setData(PROJECT_DRAG_TYPE, project.path)
          e.dataTransfer.effectAllowed = 'move'
          onDragStart?.(project)
        }}
        onDragEnd={onDragEnd}
        onDragOver={onDragOver && ((e) => onDragOver(project, e))}
        onDrop={onDrop && ((e) => onDrop(project, e))}
        onClick={() => {
          setActiveProject(project.path)
          toggleProjectCollapsed(project.path)
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          setActiveProject(project.path)
          void projectMenu(project, { x: e.clientX, y: e.clientY })
        }}
        title={project.path}
      >
        <span className="relative flex items-center justify-center" style={{ color: 'var(--text-muted)' }}>
          <span className="transition-opacity group-hover:opacity-0">
            <FolderIcon size={15} open={open} />
          </span>
          <ChevronRight
            size={13}
            className="absolute opacity-0 transition-all group-hover:opacity-100"
            style={{ transform: open ? 'rotate(90deg)' : undefined }}
          />
        </span>
        <span className="flex min-w-0 items-center gap-2">
          <span className="row-title font-semibold tracking-[-0.005em]" style={{ color: isActiveProject ? 'var(--text)' : 'var(--text-secondary)' }}>
            {project.name}
          </span>
          {/* Only the project you are in: a branch on every folder would be noise. */}
          {isActiveProject && <BranchLabel path={project.path} />}
        </span>
        <button
          className="icon-btn h-5 w-5 opacity-0 group-hover:opacity-100"
          title={t('New shell')}
          onClick={(e) => {
            e.stopPropagation()
            setActiveProject(project.path)
            void newShell(project.path)
          }}
        >
          <Plus size={13} />
        </button>
      </div>
    </div>
  )
}
