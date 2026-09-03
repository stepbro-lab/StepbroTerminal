import { Terminal } from 'lucide-react'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { addProject, createSession, newShell } from '@/lib/actions'
import { modKey } from '@/lib/format'
import { AgentLogo } from '../sidebar/AgentLogo'

export function EmptyState() {
  const presets = useData((s) => s.presets)
  const projects = useData((s) => s.projects)
  const activeProject = useUi((s) => s.activeProject)
  const project = projects.find((p) => p.path.toLowerCase() === activeProject?.toLowerCase()) ?? projects[0]
  const agents = presets.filter((p) => p.installed && p.id !== 'shell')

  if (!project) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="text-[14px] text-secondary">Pick a folder and Step opens a shell in it.</div>
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
      {agents.length > 0 && (
        <div className="flex items-center gap-1">
          {agents.map((p) => (
            <button
              key={p.id}
              className="flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] text-muted transition hover:bg-hover hover:text-fg"
              onClick={() => void createSession(project.path, p.id)}
              title={`Start ${p.name} here`}
            >
              <span style={{ color: p.color }}>
                <AgentLogo presetId={p.id} size={12} />
              </span>
              {p.name}
            </button>
          ))}
        </div>
      )}
      <div className="mt-2 flex items-center gap-4 text-[12px] text-muted">
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
