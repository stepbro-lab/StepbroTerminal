import { Terminal } from 'lucide-react'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { addProject, newShell } from '@/lib/actions'
import { modKey } from '@/lib/format'

export function EmptyState() {
  const projects = useData((s) => s.projects)
  const activeProject = useUi((s) => s.activeProject)
  const project = projects.find((p) => p.path.toLowerCase() === activeProject?.toLowerCase()) ?? projects[0]

  if (!project) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="text-[14px] text-secondary">Pick a folder and StepbroTerminal opens a shell in it.</div>
        <button className="btn btn-primary" onClick={() => void addProject()}>
          Choose folder
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 p-8 text-center">
      <div>
        <div className="text-[15px] font-semibold tracking-[-0.01em]">{project.name}</div>
        <div className="mt-1 max-w-[440px] truncate font-mono text-[11px] text-muted">{project.path}</div>
      </div>
      <button className="btn btn-primary" onClick={() => void newShell(project.path)}>
        <Terminal size={14} /> New shell
      </button>
      <div className="mt-1 flex items-center gap-4 text-[12px] text-muted">
        <span>
          <kbd>{modKey}</kbd> <kbd>T</kbd> shell
        </span>
        <span>
          <kbd>{modKey}</kbd> <kbd>K</kbd> palette
        </span>
      </div>
    </div>
  )
}
