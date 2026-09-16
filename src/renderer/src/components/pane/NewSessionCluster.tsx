import { useEffect, useRef, useState } from 'react'
import { Terminal } from 'lucide-react'
import { useData } from '@/stores/data'
import { createSession, newShell } from '@/lib/actions'
import { Liquid, type LiquidBlob } from '../Liquid'
import { AgentLogo } from '../sidebar/AgentLogo'
import { t } from '@/lib/i18n'

const PILL = { width: 168, height: 40 }
const DROP = 44
/** How far the agents travel from the middle of the pill, and across how wide a fan. */
const REACH = 118
const FAN = 116
/** Long enough to cross the gap between the pill and a drop without the cluster closing behind you. */
const LINGER_MS = 320
const MOST = 5

/**
 * The empty pane's way in: a pill that starts a shell, and the agents this machine has waiting
 * inside it. Point at it and they flow out of it like drops of the same liquid, each keeping the
 * pill's colour so the cluster reads as one body; leave, and they melt back into it.
 */
export function NewSessionCluster({ projectPath, onOpen }: { projectPath: string; onOpen?: (open: boolean) => void }) {
  const agents = useData((s) => s.presets).filter((p) => p.installed && p.id !== 'shell').slice(0, MOST)
  const [open, setOpen] = useState(false)
  const timer = useRef(0)

  useEffect(() => () => window.clearTimeout(timer.current), [])
  const show = (): void => {
    window.clearTimeout(timer.current)
    setOpen(true)
    onOpen?.(true)
  }
  const hide = (): void => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      setOpen(false)
      onOpen?.(false)
    }, LINGER_MS)
  }

  /** Where a drop sits when the cluster is open: on a fan above the pill, widest in the middle. */
  const place = (i: number): { x: number; y: number } => {
    const step = agents.length > 1 ? FAN / (agents.length - 1) : 0
    const deg = -90 - (agents.length > 1 ? FAN / 2 : 0) + step * i
    const rad = (deg * Math.PI) / 180
    return { x: Math.round(Math.cos(rad) * REACH), y: Math.round(Math.sin(rad) * REACH) }
  }

  const blobs: LiquidBlob[] = [
    {
      key: 'shell',
      x: 0,
      y: 0,
      ...PILL,
      // The whole cluster is one surface rather than a slab of the accent colour: calmer on an
      // empty pane, and the same weight whichever colour the app is set to.
      background: 'var(--bg-elevated)',
      color: 'var(--text)',
      onClick: () => void newShell(projectPath),
      onEnter: show,
      onLeave: hide,
      children: (
        <>
          <Terminal size={14} />
          {t('New shell')}
        </>
      )
    },
    ...agents.map((p, i) => {
      const at = open ? place(i) : { x: 0, y: 0 }
      return {
        key: p.id,
        ...at,
        width: DROP,
        height: DROP,
        scale: open ? 1 : 0.3,
        background: 'var(--bg-elevated)',
        color: 'var(--text)',
        folded: !open,
        // Out from the middle of the fan, back in from its edges: the wave starts where the pill is.
        delay: Math.abs(i - (agents.length - 1) / 2) * (open ? 34 : 20),
        title: t('New {name} session', { name: p.name }),
        onClick: () => void createSession(projectPath, p.id),
        onEnter: show,
        onLeave: hide,
        children: <AgentLogo presetId={p.id} size={20} />
      }
    })
  ]

  return (
    <div className="relative" style={PILL}>
      <Liquid blobs={blobs} active={open || agents.length > 0} className="h-full w-full" />
    </div>
  )
}
