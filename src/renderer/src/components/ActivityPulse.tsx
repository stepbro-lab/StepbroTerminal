import { useData } from '@/stores/data'
import { SPINNER, useUi } from '@/stores/ui'

/** Title-bar pulse: spins while any session works, turns amber when one needs you. Click opens the palette. */
export function ActivityPulse() {
  const sessions = useData((s) => s.sessions)
  const frame = useUi((s) => s.spinnerFrame)
  const openPalette = useUi((s) => s.openPalette)
  const list = Object.values(sessions)
  const attention = list.some((s) => s.status === 'attention' || s.status === 'error')
  const working = list.filter((s) => s.status === 'working' || s.status === 'starting').length
  const title = attention ? 'A session needs you' : working ? `${working} working` : 'All quiet'
  return (
    <button className="icon-btn no-drag" title={title} onClick={() => openPalette('')}>
      {attention ? (
        <span className="pulse-once rounded-full" style={{ width: 8, height: 8, background: 'var(--attention)' }} />
      ) : working ? (
        <span className="font-mono text-[13px] leading-none text-accent">{SPINNER[frame]}</span>
      ) : (
        <span className="rounded-full" style={{ width: 7, height: 7, background: 'var(--text-faint)' }} />
      )}
    </button>
  )
}
