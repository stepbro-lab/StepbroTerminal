import { X } from 'lucide-react'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { leaves } from '@/lib/layout'
import { viewLabel } from '@/lib/viewLabel'
import { modKey } from '@/lib/format'
import { AgentLogo } from './sidebar/AgentLogo'

/** Title-bar tabs, one per pane arrangement. Shown once there are two or more. */
export function ViewSwitcher() {
  const views = useUi((s) => s.views)
  const activeView = useUi((s) => s.activeView)
  const cycleView = useUi((s) => s.cycleView)
  const closeView = useUi((s) => s.closeView)
  const sessions = useData((s) => s.sessions)
  const presets = useData((s) => s.presets)
  if (views.length < 2) return null

  const presetName = (id: string): string => presets.find((p) => p.id === id)?.name ?? id
  const colorOf = (id: string): string | undefined => presets.find((p) => p.id === id)?.color

  return (
    <div className="no-drag flex items-center gap-0.5 rounded-[9px] p-[3px]" style={{ background: 'var(--bg-hover)' }}>
      {views.map((v, i) => {
        const ids = leaves(v)
        const inView = ids.map((id) => sessions[id]).filter(Boolean)
        const { text, presetIds, count } = viewLabel(inView, presetName)
        const on = i === activeView
        const full = inView.map((s) => s.title || presetName(s.presetId)).join('  ·  ')
        return (
          <div
            key={ids.join('|') || i}
            className="group flex h-[22px] max-w-[230px] items-center gap-1.5 rounded-[6px] pl-1.5 pr-1 text-[12px] transition-colors"
            style={{
              background: on ? 'var(--bg-elevated)' : 'transparent',
              color: on ? 'var(--text)' : 'var(--text-muted)',
              boxShadow: on ? '0 1px 2px rgba(0,0,0,0.12)' : undefined,
              fontWeight: on ? 550 : 450
            }}
            title={`${full}  ·  ${modKey} ⇧ ] / [ to cycle`}
            onClick={() => cycleView(i - activeView)}
            onAuxClick={(e) => e.button === 1 && closeView(i)}
          >
            {presetIds.length > 0 && (
              <span className="logo-stack" style={{ opacity: on ? 1 : 0.75 }}>
                {presetIds.map((id) => (
                  <span key={id} className="logo-stack-item" style={{ color: colorOf(id) }}>
                    <AgentLogo presetId={id} size={10} />
                  </span>
                ))}
              </span>
            )}
            <span className="truncate">{text}</span>
            {count > 1 && (
              <span className="text-[10.5px] tabular-nums" style={{ color: on ? 'var(--text-muted)' : 'var(--text-faint)' }}>
                {count}
              </span>
            )}
            <button
              className="icon-btn h-4 w-4 opacity-0 group-hover:opacity-100"
              title="Close this view (sessions stay in the sidebar)"
              onClick={(e) => {
                e.stopPropagation()
                closeView(i)
              }}
            >
              <X size={11} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
