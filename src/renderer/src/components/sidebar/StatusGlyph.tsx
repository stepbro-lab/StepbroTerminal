import { SPINNER, useUi } from '@/stores/ui'
import type { RowStatus } from '@/lib/sidebarModel'

interface Props {
  status: RowStatus
  color: string
  size?: number
}

/**
 * Left-hand status mark of a session row:
 * working → braille spinner in the agent color · attention → amber dot · done → colored dot
 * error → red dot · idle/exited → nothing.
 */
export function StatusGlyph({ status, color, size = 14 }: Props) {
  const frame = useUi((s) => s.spinnerFrame)
  const box: React.CSSProperties = { width: size, height: size }
  switch (status) {
    case 'working':
    case 'starting':
      return (
        <span className="inline-flex items-center justify-center font-mono leading-none" style={{ ...box, color, fontSize: size - 1 }}>
          {SPINNER[frame]}
        </span>
      )
    case 'attention':
      return (
        <span className="inline-flex items-center justify-center" style={box}>
          <span className="pulse-once rounded-full" style={{ width: 8, height: 8, background: 'var(--attention)' }} />
        </span>
      )
    case 'done':
      return (
        <span className="inline-flex items-center justify-center" style={box}>
          <span className="rounded-full" style={{ width: 7, height: 7, background: color }} />
        </span>
      )
    case 'error':
      return (
        <span className="inline-flex items-center justify-center" style={box}>
          <span className="rounded-full" style={{ width: 7, height: 7, background: 'var(--danger)' }} />
        </span>
      )
    default:
      return <span style={box} />
  }
}
