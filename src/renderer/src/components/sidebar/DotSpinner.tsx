import { SPINNER, useUi } from '@/stores/ui'

/**
 * The 2×3 dot spinner agents print in a terminal, drawn as vector dots so it looks the same
 * on every platform. Frames come from the braille glyphs: each bit lights one dot.
 * dot bits: 1 top-left · 2 mid-left · 4 bottom-left · 8 top-right · 16 mid-right · 32 bottom-right
 */
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

/** Filled folder mark, the way a system icon set draws it. */
export function FolderIcon({ size = 14, open = false }: { size?: number; open?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      {open ? (
        <>
          <path d="M1.5 4.2A1.7 1.7 0 0 1 3.2 2.5h3.1c.5 0 .9.2 1.2.5l.9.9h4.4a1.7 1.7 0 0 1 1.7 1.7v.9H1.5V4.2z" fill="currentColor" opacity="0.55" />
          <path d="M1.2 7.4h13.6l-1.2 5.1a1.7 1.7 0 0 1-1.65 1.3H4.05a1.7 1.7 0 0 1-1.65-1.3L1.2 7.4z" fill="currentColor" />
        </>
      ) : (
        <>
          <path d="M1.5 4.2A1.7 1.7 0 0 1 3.2 2.5h3.1c.5 0 .9.2 1.2.5l.9.9h4.4a1.7 1.7 0 0 1 1.7 1.7v6.6a1.7 1.7 0 0 1-1.7 1.7H3.2a1.7 1.7 0 0 1-1.7-1.7V4.2z" fill="currentColor" />
          <path d="M1.5 6.2h13v1H1.5z" fill="#000" opacity="0.18" />
        </>
      )}
    </svg>
  )
}
