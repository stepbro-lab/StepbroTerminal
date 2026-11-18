import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Bell } from 'lucide-react'
import type { Session } from '@shared/types'
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

export function ActivityPulse() {
  const sessions = useData((s) => s.sessions)
  const presets = useData((s) => s.presets)
  const setActive = useUi((s) => s.setActive)
  const setActiveProject = useUi((s) => s.setActiveProject)
  const [at, setAt] = useState<{ left: number; top: number } | null>(null)
  const open = at !== null
  const ref = useRef<HTMLDivElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const list = Object.values(sessions)
  const { needsYou, done, working } = attentionCounts(list)
  const queue = attentionQueue(list)
  const waiting = queue.filter((x) => x.status !== 'done')
  const finished = queue.filter((x) => x.status === 'done')
  const busy = list.filter((x) => x.alive && (x.status === 'working' || x.status === 'starting')).sort((a, b) => b.statusAt - a.statusAt)
  const nextKey = useShortcutLabel('next-attention')
  const title = needsYou
    ? `${t(needsYou === 1 ? '{n} needs you' : '{n} need you', { n: needsYou })}${nextKey ? ` · ${nextKey}` : ''}`
    : working
      ? t('{n} working', { n: working })
      : done
        ? t('Finished, not seen yet: {n}', { n: done })
        : t('All quiet')

  const WIDTH = 320
  const close = (): void => setAt(null)
  const empty = !waiting.length && !busy.length && !finished.length
  const toggle = (): void => {
    if (open || !ref.current || empty) return close()
    const r = ref.current.getBoundingClientRect()
    setAt({ left: Math.max(8, Math.min(r.left, window.innerWidth - WIDTH - 8)), top: r.bottom + 4 })
  }

  useEffect(() => {
    if (empty) setAt(null)
  }, [empty])

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

  const row = (x: Session, word: string): React.ReactNode => {
    const presetId = rowPresetId(x)
    const color = presets.find((p) => p.id === presetId)?.color ?? '#8a8a90'
    return (
      <div key={x.id} className="flex h-8 items-center gap-2 rounded-[6px] px-2 hover:bg-hover" onClick={() => jump(x.id, x.projectPath)}>
        <StatusGlyph status={x.status} color={color} size={14} />
        <span className="min-w-0 flex-1 truncate text-[13px]">{x.title || defaultTitle(x)}</span>
        <span className="text-[11.5px] text-muted">{word}</span>
        <span style={{ color: 'var(--text-faint)' }}>
          <AgentLogo presetId={presetId} size={12} />
        </span>
      </div>
    )
  }

  return (
    <div ref={ref} className="no-drag relative">
      <button className="icon-btn relative" data-on={open} title={title} onClick={toggle}>
        {working ? (
          <DotSpinner size={14} color={needsYou ? 'var(--attention)' : 'var(--accent)'} />
        ) : (
          <Bell size={15} style={needsYou ? { color: 'var(--attention)' } : undefined} />
        )}
        {(needsYou > 0 || done > 0) && <span className={needsYou ? 'bell-dot pulse-once' : 'bell-dot'} style={{ background: needsYou ? 'var(--attention)' : 'var(--unread)' }} />}
      </button>

      {at &&
        !empty &&
        createPortal(
          <div
            ref={pop}
            data-bar-keep
            className="fade-in fixed z-40 rounded-[var(--radius-pop)] p-1"
            style={{ left: at.left, top: at.top, width: WIDTH, background: 'var(--bg-elevated)', boxShadow: '0 0 0 1px var(--border-strong) inset, var(--shadow-pop)' }}
          >
            {waiting.length > 0 && (
              <Group label={t('Needs you')} extra={nextKey ? <><Keys id="next-attention" /> {t('next')}</> : null}>
                {waiting.map((x) => row(x, t(x.status === 'error' ? 'error' : 'waiting')))}
              </Group>
            )}
            {busy.length > 0 && <Group label={t('Working')}>{busy.map((x) => row(x, t('working')))}</Group>}
            {finished.length > 0 && <Group label={t('Finished')}>{finished.map((x) => row(x, t('done')))}</Group>}
          </div>,
          document.body
        )}
    </div>
  )
}

function Group({ label, extra, children }: { label: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="pb-0.5">
      <div className="flex items-center px-2.5 pb-1 pt-1.5 text-[11.5px] font-medium text-muted">
        <span>{label}</span>
        {extra && <span className="ml-auto">{extra}</span>}
      </div>
      {children}
    </div>
  )
}
