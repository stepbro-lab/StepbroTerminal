import { useEffect, useRef } from 'react'
import { usePrefs } from '@/stores/prefs'
import { clip as clipOf, frameCells, TOPITO_COLS, TOPITO_ROWS, type TopitoClipName, type TopitoInk } from '@/lib/topito/sprite'

/** The theme colour each of the frames' roles is painted in. */
const ROLES: Record<TopitoInk, string> = {
  W: 'var(--text)',
  S: 'var(--text-muted)',
  D: 'var(--text-faint)',
  K: 'var(--bg-card)',
  A: 'var(--accent)'
}

/** The theme's colours as the canvas can take them: resolved through an element, since some are colour mixes. */
function palette(host: HTMLElement): Record<TopitoInk, string> {
  const probe = document.createElement('span')
  probe.style.cssText = 'position:absolute;width:0;height:0;visibility:hidden;pointer-events:none'
  host.appendChild(probe)
  const out = {} as Record<TopitoInk, string>
  for (const [ink, value] of Object.entries(ROLES) as Array<[TopitoInk, string]>) {
    probe.style.color = value
    out[ink] = getComputedStyle(probe).color
  }
  probe.remove()
  return out
}

/**
 * Plays one of Topito's clips on a canvas. The frames are drawn straight onto it on a timer, never
 * through React state, so an animation costs a few rectangles a few times a second and re-renders
 * nothing. Its way in plays once; the rest loops, or plays through once and says so when `once`.
 * It stops while the window is hidden.
 */
export function TopitoCanvas({
  clip,
  once = false,
  onDone,
  cell = 4,
  rows = TOPITO_ROWS,
  className = ''
}: {
  clip: TopitoClipName
  once?: boolean
  onDone?: () => void
  cell?: number
  /** How many rows from the top to show; the soil at the bottom can be left out. */
  rows?: number
  className?: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const done = useRef(onDone)
  done.current = onDone
  // A new theme or accent repaints with the new colours.
  const dark = usePrefs((s) => s.dark)
  const accent = usePrefs((s) => s.prefs?.accent)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const colors = palette(canvas.parentElement ?? document.body)
    const { intro, frames } = clipOf(clip)
    let i = 0
    let timer = 0
    let stopped = false

    const draw = (index: number): void => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const cells = frameCells(frames[index][0])
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < TOPITO_COLS; c++) {
          const ink = cells[r * TOPITO_COLS + c]
          if (ink === '.' || ink === undefined) continue
          ctx.fillStyle = colors[ink as TopitoInk]
          ctx.fillRect(c * cell, r * cell, cell, cell)
        }
      }
    }

    const step = (): void => {
      if (stopped) return
      draw(i)
      timer = window.setTimeout(() => {
        i++
        if (i >= frames.length) {
          if (once) {
            stopped = true
            done.current?.()
            return
          }
          i = intro
        }
        step()
      }, frames[i][1])
    }

    const onVisibility = (): void => {
      window.clearTimeout(timer)
      if (!document.hidden) step()
    }
    step()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stopped = true
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [clip, once, cell, rows, dark, accent])

  return <canvas ref={ref} width={TOPITO_COLS * cell} height={rows * cell} className={`topito-canvas ${className}`} />
}
