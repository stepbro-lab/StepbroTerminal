import { useId, type ReactNode } from 'react'

export interface LiquidBlob {
  key: string
  /** Offset from the centre of the cluster, in pixels. */
  x: number
  y: number
  width: number
  height: number
  /** Drawn smaller than its size; at rest the drops shrink into the shape they came from. */
  scale?: number
  /** The rounding of the shape: half its height makes a circle or a pill. */
  radius?: number
  background: string
  color?: string
  title?: string
  /** Tucked away: its face is invisible and takes no clicks, though its shape still travels. */
  folded?: boolean
  /** Milliseconds before this one follows the others, so the cluster opens as a wave. */
  delay?: number
  onClick?: () => void
  onEnter?: () => void
  onLeave?: () => void
  children?: ReactNode
}

interface Props {
  blobs: LiquidBlob[]
  /** How far the silhouettes bleed into one another before the contrast pass; more is gooier. */
  blur?: number
  /** How hard the blurred edges are cut back into a shape. */
  contrast?: number
  /** Off while the cluster rests as one shape: a filter that changes nothing is still work. */
  active?: boolean
  className?: string
}

/**
 * Shapes that melt into one another as they come together, and pull apart into drops as they
 * separate: the silhouettes are blurred and then cut back to a hard edge, which fuses whatever
 * overlaps. Drawn in two layers, so only the shapes go through the filter while their labels and
 * icons stay crisp on top of it. The clear layer holds the buttons; the blurred one takes no clicks.
 */
export function Liquid({ blobs, blur = 7, contrast = 20, active = true, className }: Props) {
  const id = `liquid-${useId().replace(/:/g, '')}`
  const box = (b: LiquidBlob): React.CSSProperties => ({
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: b.width,
    height: b.height,
    marginLeft: -b.width / 2,
    marginTop: -b.height / 2,
    borderRadius: b.radius ?? b.height / 2,
    transform: `translate(${b.x}px, ${b.y}px) scale(${b.scale ?? 1})`,
    transitionDelay: b.delay ? `${b.delay}ms` : undefined
  })
  return (
    <div className={`relative ${className ?? ''}`}>
      <svg width="0" height="0" aria-hidden="true" className="absolute">
        <defs>
          {/* Room well past the cluster's own box: its drops travel outside it and must not be clipped. */}
          <filter id={id} colorInterpolationFilters="sRGB" x="-150%" y="-150%" width="400%" height="400%">
            <feGaussianBlur in="SourceGraphic" stdDeviation={blur} result="soft" />
            <feColorMatrix in="soft" type="matrix" values={`1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${contrast} -${contrast / 2}`} />
          </filter>
        </defs>
      </svg>
      <div className="pointer-events-none absolute inset-0" style={{ filter: active ? `url(#${id})` : undefined }} aria-hidden="true">
        {blobs.map((b) => (
          <div key={b.key} className="liquid-blob" style={{ ...box(b), background: b.background }} />
        ))}
      </div>
      {blobs.map((b) => (
        <button
          key={b.key}
          className="liquid-face"
          style={{ ...box(b), color: b.color, opacity: b.folded ? 0 : 1 }}
          title={b.title}
          tabIndex={b.folded ? -1 : undefined}
          aria-hidden={b.folded}
          onClick={b.onClick}
          onMouseEnter={b.onEnter}
          onMouseLeave={b.onLeave}
          onFocus={b.onEnter}
          onBlur={b.onLeave}
        >
          {b.children}
        </button>
      ))}
    </div>
  )
}
