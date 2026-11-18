import { useEffect, useRef, useState } from 'react'
import { Terminal } from 'lucide-react'
import { useData } from '@/stores/data'
import { createSession, newShell } from '@/lib/actions'
import { Liquid, type LiquidBlob } from '../Liquid'
import { AgentLogo } from '../sidebar/AgentLogo'
import { t } from '@/lib/i18n'

const PILL = { width: 168, height: 40 }
const DROP = 44
const REACH = 118
const FAN = 116
const LINGER_MS = 320
const MOST = 5

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
