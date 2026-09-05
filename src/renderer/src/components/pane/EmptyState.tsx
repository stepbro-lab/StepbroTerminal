import { FolderPlus, Terminal } from 'lucide-react'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { addDroppedFolders, addProject, newShell } from '@/lib/actions'
import { useFolderDrop } from '@/lib/folderDrop'
import { useBinding } from '@/lib/shortcuts'
import { Keys } from '../Keys'

export function EmptyState() {
  const shellKey = useBinding('new-shell')
  const paletteKey = useBinding('palette')
  const projects = useData((s) => s.projects)
  const activeProject = useUi((s) => s.activeProject)
  const project = projects.find((p) => p.path.toLowerCase() === activeProject?.toLowerCase()) ?? projects[0]
  // A folder dragged in from the desktop lands here the same way "Add folder" would.
  const drop = useFolderDrop(addDroppedFolders)
  const hint = drop.over && (
    <div className="drop-hint">
      <FolderPlus size={16} />
      <span>Drop to add folder</span>
    </div>
  )

  if (!project) {
    return (
      <div {...drop.props} className="relative flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="text-[14px] text-secondary">Pick a folder, or drag one in, and StepbroTerminal opens a shell in it.</div>
        <button className="btn btn-primary" onClick={() => void addProject()}>
          Choose folder
        </button>
        {hint}
      </div>
    )
  }

  return (
    <div {...drop.props} className="relative flex h-full flex-col items-center justify-center gap-5 p-8 text-center">
      <div>
        <div className="text-[15px] font-semibold tracking-[-0.01em]">{project.name}</div>
        <div className="mt-1 max-w-[440px] truncate font-mono text-[11px] text-muted">{project.path}</div>
      </div>
      <button className="btn btn-primary" onClick={() => void newShell(project.path)}>
        <Terminal size={14} /> New shell
      </button>
      <div className="mt-1 flex items-center gap-4 text-[12px] text-muted">
        {shellKey && (
          <span>
            <Keys chord={shellKey} /> shell
          </span>
        )}
        {paletteKey && (
          <span>
            <Keys chord={paletteKey} /> palette
          </span>
        )}
      </div>
      {hint}
    </div>
  )
}
