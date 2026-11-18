import { useRef, type ReactNode } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { MotionPathPlugin } from 'gsap/MotionPathPlugin'
import { flightPath, type Point } from '@/lib/flightPath'

gsap.registerPlugin(useGSAP, MotionPathPlugin)

export interface FlightSpec {
  key: string
  from: Point
  to: Point
  icon?: ReactNode
  label?: string
  text: string
  onLand?: () => void
}

const GHOSTS = [
  { delay: 0.055, opacity: 0.3, scale: 0.97 },
  { delay: 0.11, opacity: 0.14, scale: 0.94 }
]

export function Flight({ spec, onDone }: { spec: FlightSpec | null; onDone: () => void }) {
  const layer = useRef<HTMLDivElement>(null)
  const chip = useRef<HTMLDivElement>(null)
  const ripple = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      if (!spec || !layer.current || !chip.current || !ripple.current) return
      const ghosts = Array.from(layer.current.querySelectorAll<HTMLElement>('[data-ghost]'))
      const { points, duration } = flightPath(spec.from, spec.to)
      const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const tl = gsap.timeline({ onComplete: onDone, defaults: { force3D: true } })

      gsap.set(ripple.current, { x: spec.to.x, y: spec.to.y, xPercent: -50, yPercent: -50, scale: 0.35, opacity: 0 })
      const land = (): void => {
        spec.onLand?.()
        tl.fromTo(ripple.current, { scale: 0.35, opacity: 0.9 }, { scale: 2.6, opacity: 0, duration: 0.6, ease: 'power2.out' }, '<')
      }

      if (still) {
        gsap.set([chip.current, ...ghosts], { opacity: 0 })
        tl.add(land, 0.05).to({}, { duration: 0.6 })
        return
      }

      const text = chip.current.querySelector<HTMLElement>('[data-text]')
      gsap.set(chip.current, { x: spec.from.x, y: spec.from.y + 10, xPercent: -50, yPercent: -50, scale: 0.86, opacity: 0, rotation: -2 })
      gsap.set(ghosts, { x: spec.from.x, y: spec.from.y, xPercent: -50, yPercent: -50, opacity: 0 })
      if (text) gsap.set(text, { opacity: 0, y: 3 })

      tl.to(chip.current, { y: spec.from.y, scale: 1, opacity: 1, rotation: 0, duration: 0.24, ease: 'power3.out' })
      if (text) tl.to(text, { opacity: 1, y: 0, duration: 0.18, ease: 'power2.out' }, 0.06)
      tl.add('fly', '-=0.06')

      const path = { path: points, type: 'cubic' as const }
      tl.to(chip.current, { motionPath: path, duration, ease: 'power2.inOut' }, 'fly')
        .to(chip.current, { scale: 1.05, rotation: 1.5, duration: duration * 0.5, ease: 'sine.out' }, 'fly')
        .to(chip.current, { scale: 0.92, rotation: 0, duration: duration * 0.5, ease: 'sine.in' }, `fly+=${duration * 0.5}`)

      ghosts.forEach((g, i) => {
        const { delay, opacity, scale } = GHOSTS[i] ?? GHOSTS[GHOSTS.length - 1]
        tl.set(g, { opacity, scale }, `fly+=${delay}`)
          .to(g, { motionPath: path, duration, ease: 'power2.inOut' }, `fly+=${delay}`)
          .to(g, { opacity: 0, duration: duration * 0.35, ease: 'power1.in' }, `fly+=${delay + duration * 0.55}`)
      })

      tl.to(chip.current, { scale: 0.4, opacity: 0, duration: 0.2, ease: 'power2.in' }, `fly+=${duration - 0.16}`)
      tl.add(land, `fly+=${duration - 0.06}`)
      tl.to({}, { duration: 0.5 })
    },
    { dependencies: [spec?.key], scope: layer }
  )

  if (!spec) return null
  return (
    <div ref={layer} className="pointer-events-none fixed inset-0 z-50">
      {GHOSTS.map((_, i) => (
        <div key={i} data-ghost className="flight-chip flight-ghost" aria-hidden>
          {spec.icon && <span className="flight-icon">{spec.icon}</span>}
          <span className="flight-body">
            {spec.label && <span className="flight-to">{spec.label}</span>}
            <span className="flight-text">{spec.text}</span>
          </span>
        </div>
      ))}
      <div ref={chip} className="flight-chip">
        {spec.icon && <span className="flight-icon">{spec.icon}</span>}
        <span className="flight-body">
          {spec.label && <span className="flight-to">{spec.label}</span>}
          <span className="flight-text" data-text>
            {spec.text}
          </span>
        </span>
      </div>
      <div ref={ripple} className="flight-ripple" />
    </div>
  )
}

export function flightText(text: string, max = 46): string {
  const one = text.replace(/\s+/g, ' ').trim()
  return one.length > max ? one.slice(0, max - 1).trimEnd() + '…' : one
}
