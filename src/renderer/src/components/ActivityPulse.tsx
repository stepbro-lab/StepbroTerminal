import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { attentionCounts, attentionQueue } from '@/lib/attention'
import { defaultTitle, rowPresetId } from '@/lib/sidebarModel'
import { useShortcutLabel } from '@/lib/shortcuts'
import { Keys } from './Keys'
import { DotSpinner } from './sidebar/DotSpinner'
import { AgentLogo } from './sidebar/AgentLogo'
import { StatusGlyph } from './sidebar/StatusGlyph'
import { t } from '@/lib/i18n'

/**
 * Title-bar pulse and inbox. Spins while agents work, shows an amber count when some need you.
 * Click opens the inbox: every waiting session, a click away.
 */
export function ActivityPulse() {
  const sessions = useData((s) => s.sessions)
  const presets = useData((s) => s.presets)
  const setActive = useUi((s) => s.setActive)
  const setActiveProject = useUi((s) => s.setActiveProject)
  const openPalette = useUi((s) => s.openPalette)
  // The inbox is drawn at the top of the page, not inside the sidebar: the sidebar clips whatever
  // spills past its edge, and the list is wider than the sidebar. `at` is where it goes.
  const [at, setAt] = useState<{ left: number; top: number } | null>(null)
  const open = at !== null
  const ref = useRef<HTMLDivElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const list = Object.values(sessions)
  const { needsYou, done, working } = attentionCounts(list)
  const queue = attentionQueue(list)
  const nextKey = useShortcutLabel('next-attention')
  const title = needsYou ? `${t(needsYou === 1 ? '{n} needs you' : '{n} need you', { n: needsYou })}${nextKey ? ` · ${nextKey}` : ''}` : working ? t('{n} working', { n: working }) : t('All quiet')

  const WIDTH = 320
  const close = (): void => setAt(null)
  const toggle = (): void => {
    if (open || !ref.current) return close()
    const r = ref.current.getBoundingClientRect()
    // Under the button, and pulled left when the window's edge is nearer than the list is wide.
    setAt({ left: Math.max(8, Math.min(r.left, window.innerWidth - WIDTH - 8)), top: r.bottom + 4 })
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      const n = e.target as Node
      if (!ref.current?.contains(n) && !pop.current?.contains(n)) close()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  const jump = (id: string, projectPath: string): void => {
    setActiveProject(projectPath)
    setActive(id)
    close()
  }

  return (
    <div ref={ref} className="no-drag relative">
      <button
        className="icon-btn relative"
        title={title}
        onClick={() => (queue.length ? toggle() : openPalette(''))}
        style={{ width: needsYou ? 'auto' : undefined, paddingRight: needsYou ? 6 : undefined, paddingLeft: needsYou ? 6 : undefined }}
      >
        {needsYou ? (
          <span className="flex items-center gap-1.5">
            <span className="pulse-once rounded-full" style={{ width: 8, height: 8, background: 'var(--attention)' }} />
            <span className="text-[12.5px] font-semibold tabular-nums" style={{ color: 'var(--attention)' }}>
              {needsYou}
            </span>
          </span>
        ) : working ? (
          <DotSpinner size={14} color="var(--accent)" />
        ) : done ? (
          <span className="rounded-full" style={{ width: 7, height: 7, background: 'var(--accent)' }} />
        ) : (
          <span className="rounded-full" style={{ width: 7, height: 7, background: 'var(--text-faint)' }} />
        )}
      </button>

      {at &&
        createPortal(
          <div
            ref={pop}
            className="fade-in fixed z-40 rounded-[var(--radius-pop)] p-1"
            style={{ left: at.left, top: at.top, width: WIDTH, background: 'var(--bg-elevated)', boxShadow: '0 0 0 1px var(--border-strong) inset, var(--shadow-pop)' }}
          >
            <div className="flex items-center px-2.5 pb-1 pt-1.5 text-[11.5px] font-medium text-muted">
              <span>{t('Needs you')}</span>
              {nextKey && (
                <span className="ml-auto">
                  <Keys id="next-attention" /> {t('next')}
                </span>
              )}
            </div>
            {queue.map((s) => {
              const presetId = rowPresetId(s)
              const color = presets.find((p) => p.id === presetId)?.color ?? '#8a8a90'
              const waiting = s.status === 'attention'
              return (
                <div key={s.id} className="flex h-8 items-center gap-2 rounded-[6px] px-2 hover:bg-hover" onClick={() => jump(s.id, s.projectPath)}>
                  <StatusGlyph status={s.status} color={color} size={14} />
                  <span className="min-w-0 flex-1 truncate text-[13px]">{s.title || defaultTitle(s)}</span>
                  <span className="text-[11.5px] text-muted">{t(waiting ? 'waiting' : s.status === 'error' ? 'error' : 'done')}</span>
                  <span style={{ color: 'var(--text-faint)' }}>
                    <AgentLogo presetId={presetId} size={12} />
                  </span>
                </div>
              )
            })}
          </div>,
          document.body
        )}
    </div>
  )
}
