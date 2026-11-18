import { useId } from 'react'
import { SPINNER, useUi } from '@/stores/ui'

export function DotSpinner({ size = 14, color = 'currentColor', animate = true }: { size?: number; color?: string; animate?: boolean }) {
  const frame = useUi((s) => s.spinnerFrame)
  const bits = animate ? SPINNER[frame].codePointAt(0)! - 0x2800 : 0b111111
  const dots = [
    [1, 4.5, 3],
    [2, 4.5, 7],
    [4, 4.5, 11],
    [8, 9.5, 3],
    [16, 9.5, 7],
    [32, 9.5, 11]
  ] as const
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden="true">
      {dots.map(([bit, cx, cy]) => (
        <circle key={bit} cx={cx} cy={cy} r={1.55} fill={color} opacity={bits & bit ? 1 : 0.18} />
      ))}
    </svg>
  )
}

export function FolderIcon({ size = 14, open = false }: { size?: number; open?: boolean }) {
  const fade = `folder-${useId()}`
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <defs>
        <linearGradient id={fade} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="1" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.78" />
        </linearGradient>
      </defs>
      <path
        d="M1.5 4A1.5 1.5 0 0 1 3 2.5h2.9c.42 0 .82.18 1.1.48l.72.77H13A1.5 1.5 0 0 1 14.5 5.25V12A1.5 1.5 0 0 1 13 13.5H3A1.5 1.5 0 0 1 1.5 12V4z"
        fill="currentColor"
        opacity="0.38"
      />
      {open ? (
        <path d="M3.95 6.6H14.6a.9.9 0 0 1 .86 1.16l-1.42 4.72a1.45 1.45 0 0 1-1.39 1.02H2.6a1 1 0 0 1-.96-1.3l1.4-4.9a.95.95 0 0 1 .91-.7z" fill={`url(#${fade})`} />
      ) : (
        <rect x="1.5" y="5.4" width="13" height="8.1" rx="1.5" fill={`url(#${fade})`} />
      )}
    </svg>
  )
}
