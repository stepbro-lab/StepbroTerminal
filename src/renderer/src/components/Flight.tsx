import { useRef, type ReactNode } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { MotionPathPlugin } from 'gsap/MotionPathPlugin'
import { flightPath, type Point } from '@/lib/flightPath'

gsap.registerPlugin(useGSAP, MotionPathPlugin)

export interface FlightSpec {
  /** Changes for every new flight, so the same text twice still flies twice. */
  key: string
  from: Point
  to: Point
  /** Small mark at the front of the chip: the notebook, an arrow, an agent logo. */
  icon?: ReactNode
  /** A short line above the text, such as the session it goes to. */
  label?: string
  text: string
  /** Fires the moment the chip reaches the target, for whatever should light up there. */
  onLand?: () => void
}

const GHOSTS = [
  { delay: 0.055, opacity: 0.3, scale: 0.97 },
  { delay: 0.11, opacity: 0.14, scale: 0.94 }
]

/**
 * Carries a chip from one point of the window to another: it lifts off, sails along a curve
 * with a faint trail behind it, and settles into the target with a ripple. Only transforms
 * and opacity move, so the terminals underneath never repaint. Honours reduced motion.
 */
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

      // The ripple waits at the destination.
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

      // Lift off the surface and go: the toss starts while the chip is still settling, so the
      // motion reads as one gesture instead of a pop, a pause and a launch.
      tl.to(chip.current, { y: spec.from.y, scale: 1, opacity: 1, rotation: 0, duration: 0.24, ease: 'power3.out' })
      if (text) tl.to(text, { opacity: 1, y: 0, duration: 0.18, ease: 'power2.out' }, 0.06)
      tl.add('fly', '-=0.06')

      // The toss: one curve, eased at both ends. It swells a touch mid-air, as if coming closer.
      const path = { path: points, type: 'cubic' as const }
      tl.to(chip.current, { motionPath: path, duration, ease: 'power2.inOut' }, 'fly')
        .to(chip.current, { scale: 1.05, rotation: 1.5, duration: duration * 0.5, ease: 'sine.out' }, 'fly')
        .to(chip.current, { scale: 0.92, rotation: 0, duration: duration * 0.5, ease: 'sine.in' }, `fly+=${duration * 0.5}`)

      // A faint trail follows the same curve a few frames behind and dies out before landing.
      ghosts.forEach((g, i) => {
        const { delay, opacity, scale } = GHOSTS[i] ?? GHOSTS[GHOSTS.length - 1]
        tl.set(g, { opacity, scale }, `fly+=${delay}`)
          .to(g, { motionPath: path, duration, ease: 'power2.inOut' }, `fly+=${delay}`)
          .to(g, { opacity: 0, duration: duration * 0.35, ease: 'power1.in' }, `fly+=${delay + duration * 0.55}`)
      })

      // Landing: fold into the target and ring it.
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

/** First words of a note or message, enough to recognise it on the wing. */
export function flightText(text: string, max = 46): string {
  const one = text.replace(/\s+/g, ' ').trim()
  return one.length > max ? one.slice(0, max - 1).trimEnd() + '…' : one
}
