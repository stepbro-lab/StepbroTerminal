import { Plus } from 'lucide-react'
import type { Preset } from '@shared/types'
import { useData } from '@/stores/data'
import { usePrefs } from '@/stores/prefs'
import { useUi } from '@/stores/ui'
import { createSession, newSessionMenu } from '@/lib/actions'
import { chipsThatFit, quickAgents, stripWidth } from '@/lib/quickAgents'
import { AgentLogo, hasAgentMark } from './AgentLogo'
import { t } from '@/lib/i18n'

/**
 * The "+" at the end of a folder row, as unpeel has it. Resting, it is the "+" alone, which opens
 * the full new-session menu; with the pointer on it, it opens out to the left into a button for
 * each installed agent and one for a shell, each starting that in the folder in one click. As many
 * agents as the row has room for, the most used when they do not all fit, always in the same order.
 */
export function QuickStrip({ projectPath }: { projectPath: string }) {
  const presets = useData((s) => s.presets)
  const usage = usePrefs((s) => s.prefs?.presetUsage)
  const sidebarWidth = usePrefs((s) => s.prefs?.sidebarWidth ?? 240)
  const agents = quickAgents(presets, usage ?? {}, chipsThatFit(sidebarWidth) - 2)
  const width = stripWidth(agents.length + 2)

  const start = (presetId: string) => (e: React.MouseEvent) => {
    e.stopPropagation()
    useUi.getState().setActiveProject(projectPath)
    void createSession(projectPath, presetId)
  }

  // Laid out right to left: "+" at the end, the agents leading up to it, the shell furthest out.
  return (
    <div className="quick-strip" style={{ '--strip-w': `${width}px` } as React.CSSProperties} onClick={(e) => e.stopPropagation()}>
      <button
        className="quick-chip quick-plus"
        title={t('New session')}
        aria-label={t('New session')}
        onClick={(e) => {
          e.stopPropagation()
          useUi.getState().setActiveProject(projectPath)
          void newSessionMenu(projectPath)
        }}
      >
        <Plus size={14} strokeWidth={2} />
      </button>
      {[...agents].reverse().map((p) => (
        <button key={p.id} className="quick-chip" title={t('New {name} session', { name: p.name })} aria-label={t('New {name} session', { name: p.name })} onClick={start(p.id)}>
          <Mark preset={p} />
        </button>
      ))}
      <button className="quick-chip" title={t('New shell')} aria-label={t('New shell')} onClick={start('shell')}>
        <AgentLogo presetId="shell" size={13} />
      </button>
    </div>
  )
}

/** An agent's own mark, or for a launcher of the person's own, the first letter of its name. */
function Mark({ preset }: { preset: Preset }) {
  if (hasAgentMark(preset.id)) return <AgentLogo presetId={preset.id} size={13} />
  return <span className="quick-initial">{(preset.name.trim()[0] ?? '?').toUpperCase()}</span>
}
