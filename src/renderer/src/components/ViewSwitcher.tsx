import { X } from 'lucide-react'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { leaves } from '@/lib/layout'
import { defaultTitle } from '@/lib/sidebarModel'
import { modKey } from '@/lib/format'

/** Title-bar pills, one per pane arrangement. Shown once there are two or more. */
export function ViewSwitcher() {
  const views = useUi((s) => s.views)
  const activeView = useUi((s) => s.activeView)
  const cycleView = useUi((s) => s.cycleView)
  const closeView = useUi((s) => s.closeView)
  const sessions = useData((s) => s.sessions)
  if (views.length < 2) return null

  const label = (ids: string[]): string =>
    ids
      .map((id) => sessions[id])
      .filter(Boolean)
      .map((s) => s.title || defaultTitle(s))
      .join(' · ')

  return (
    <div className="no-drag flex items-center gap-1 rounded-[9px] p-[3px]" style={{ background: 'var(--bg-hover)' }}>
      {views.map((v, i) => {
        const ids = leaves(v)
        const on = i === activeView
        return (
          <div
            key={ids.join('|') || i}
            className="group flex h-[22px] max-w-[220px] items-center gap-1 rounded-[6px] pl-2.5 pr-1 text-[12px] transition-colors"
            style={{
              background: on ? 'var(--bg-elevated)' : 'transparent',
              color: on ? 'var(--text)' : 'var(--text-muted)',
              boxShadow: on ? '0 1px 2px rgba(0,0,0,0.12)' : undefined,
              fontWeight: on ? 550 : 450
            }}
            title={`${label(ids)}  ·  ${modKey} ⇧ ] / [ to cycle`}
            onClick={() => cycleView(i - activeView)}
            onAuxClick={(e) => e.button === 1 && closeView(i)}
          >
            {ids.length > 1 && (
              <span className="tabular-nums" style={{ color: on ? 'var(--accent)' : 'var(--text-faint)' }}>
                {ids.length}
              </span>
            )}
            <span className="truncate">{label(ids)}</span>
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
