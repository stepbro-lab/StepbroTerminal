import { useId, type ReactNode } from 'react'

export interface LiquidBlob {
  key: string
  x: number
  y: number
  width: number
  height: number
  scale?: number
  radius?: number
  background: string
  color?: string
  title?: string
  folded?: boolean
  delay?: number
  onClick?: () => void
  onEnter?: () => void
  onLeave?: () => void
  children?: ReactNode
}

interface Props {
  blobs: LiquidBlob[]
  blur?: number
  contrast?: number
  active?: boolean
  className?: string
}

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
