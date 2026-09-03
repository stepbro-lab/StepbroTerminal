import { ChevronRight, Plus } from 'lucide-react'
import type { SidebarProject } from '@/lib/sidebarModel'
import { useUi } from '@/stores/ui'
import { newShell, projectMenu, toggleProjectCollapsed } from '@/lib/actions'
import { FolderIcon } from './DotSpinner'

interface Props {
  project: SidebarProject
  isActiveProject: boolean
}

export function ProjectRow({ project, isActiveProject }: Props) {
  const setActiveProject = useUi((s) => s.setActiveProject)
  const open = !project.collapsed

  return (
    <div className="group relative">
      <div
        className="row grid-cols-[16px_minmax(0,1fr)_auto] gap-2"
        data-tone="fg"
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
        <span className="row-title font-semibold tracking-[-0.005em]" style={{ color: isActiveProject ? 'var(--text)' : 'var(--text-secondary)' }}>
          {project.name}
        </span>
        <button
          className="icon-btn h-5 w-5 opacity-0 group-hover:opacity-100"
          title="New shell"
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
