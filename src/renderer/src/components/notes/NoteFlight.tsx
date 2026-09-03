import { useRef } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { useNotes } from '@/stores/notes'

gsap.registerPlugin(useGSAP)

/**
 * When an agent saves a note, a chip with its first words lifts off from that session's pane,
 * arcs to the Notes button and lands there with a small pulse. Transforms and opacity only.
 */
export function NoteFlight() {
  const arrived = useNotes((s) => s.arrived)
  const landed = useNotes((s) => s.landed)
  const layer = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      if (!arrived || !layer.current) return
      const target = document.querySelector<HTMLElement>('[data-notes-target]')
      if (!target) {
        landed()
        return
      }
      const pane = arrived.source.kind === 'agent' ? document.querySelector<HTMLElement>(`[data-session-id="${arrived.source.sessionId}"]`) : null
      const from = pane?.getBoundingClientRect()
      const to = target.getBoundingClientRect()
      const start = from
        ? { x: from.left + Math.min(from.width * 0.4, 320), y: from.top + Math.min(from.height * 0.55, 240) }
        : { x: window.innerWidth / 2, y: window.innerHeight * 0.6 }
      const end = { x: to.left + to.width / 2, y: to.top + to.height / 2 }

      const chip = document.createElement('div')
      chip.className = 'note-chip'
      chip.textContent = arrived.text.length > 52 ? arrived.text.slice(0, 51).trimEnd() + '…' : arrived.text
      layer.current.appendChild(chip)
      const badge = target.querySelector<HTMLElement>('[data-notes-count]')

      gsap.set(chip, { x: start.x, y: start.y, xPercent: -50, yPercent: -50, scale: 0.92, opacity: 0 })
      const tl = gsap.timeline({
        onComplete: () => {
          chip.remove()
          landed()
        }
      })
      tl.to(chip, { opacity: 1, scale: 1, duration: 0.2, ease: 'power2.out' })
        .add('fly', '+=0.35')
        .to(chip, { x: end.x, duration: 0.62, ease: 'power2.inOut' }, 'fly')
        .to(chip, { y: Math.min(start.y, end.y) - 48, duration: 0.31, ease: 'power2.out' }, 'fly')
        .to(chip, { y: end.y, duration: 0.31, ease: 'power2.in' }, 'fly+=0.31')
        .to(chip, { scale: 0.35, opacity: 0, duration: 0.2, ease: 'power2.in' }, 'fly+=0.46')
        .fromTo(target, { scale: 1 }, { scale: 1.28, duration: 0.14, ease: 'power1.out', yoyo: true, repeat: 1 }, 'fly+=0.58')
      if (badge) tl.fromTo(badge, { y: 0 }, { y: -3, duration: 0.12, yoyo: true, repeat: 1, ease: 'power1.inOut' }, 'fly+=0.62')
    },
    { dependencies: [arrived], scope: layer }
  )

  return <div ref={layer} className="pointer-events-none fixed inset-0 z-50" />
}
