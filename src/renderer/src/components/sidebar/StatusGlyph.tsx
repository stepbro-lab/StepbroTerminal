import type { RowStatus } from '@/lib/sidebarModel'
import { DotSpinner } from './DotSpinner'

interface Props {
  status: RowStatus
  color: string
  size?: number
}

/**
 * Left-hand status mark of a session row:
 * working → dot spinner in the agent color · attention → amber dot · done → agent-colored dot
 * error → red dot · idle/exited → nothing.
 */
export function StatusGlyph({ status, color, size = 14 }: Props) {
  const box: React.CSSProperties = { width: size, height: size }
  const dot = (bg: string, px = 7, pulse = false): React.ReactElement => (
    <span className="inline-flex items-center justify-center" style={box}>
      <span className={pulse ? 'pulse-once rounded-full' : 'rounded-full'} style={{ width: px, height: px, background: bg }} />
    </span>
  )
  switch (status) {
    case 'working':
    case 'starting':
      return (
        <span className="inline-flex items-center justify-center" style={box}>
          <DotSpinner size={size} color={color} />
        </span>
      )
    case 'attention':
      return dot('var(--attention)', 8, true)
    case 'done':
      return dot(color)
    case 'error':
      return dot('var(--danger)')
    default:
      return <span style={box} />
  }
}
