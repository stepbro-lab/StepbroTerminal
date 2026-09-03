import { useEffect, useMemo } from 'react'
import { NotebookPen } from 'lucide-react'
import gsap from 'gsap'
import { useNotes } from '@/stores/notes'
import { Flight, flightText, type FlightSpec } from '../Flight'

/** When an agent saves a note, its first words fly from that session's pane to the Notes button. */
export function NoteFlight() {
  const arrived = useNotes((s) => s.arrived)
  const landed = useNotes((s) => s.landed)

  const spec = useMemo<FlightSpec | null>(() => {
    if (!arrived) return null
    const target = document.querySelector<HTMLElement>('[data-notes-target]')
    if (!target) return null
    const pane = arrived.source.kind === 'agent' ? document.querySelector<HTMLElement>(`[data-session-id="${arrived.source.sessionId}"]`) : null
    const r = pane?.getBoundingClientRect()
    const t = target.getBoundingClientRect()
    return {
      key: `${arrived.id}:${arrived.createdAt}`,
      from: r ? { x: r.left + Math.min(r.width * 0.4, 320), y: r.top + Math.min(r.height * 0.55, 240) } : { x: window.innerWidth / 2, y: window.innerHeight * 0.6 },
      to: { x: t.left + t.width / 2, y: t.top + t.height / 2 },
      icon: <NotebookPen size={11} />,
      text: flightText(arrived.text),
      onLand: () => {
        const badge = target.querySelector<HTMLElement>('[data-notes-count]')
        gsap.fromTo(target, { scale: 1 }, { scale: 1.22, duration: 0.16, ease: 'power1.out', yoyo: true, repeat: 1, force3D: true })
        if (badge) gsap.fromTo(badge, { y: 0 }, { y: -3, duration: 0.14, yoyo: true, repeat: 1, ease: 'power1.inOut' })
      }
    }
  }, [arrived])

  // Nothing to fly to (the button is not on screen): let the note through without a flight.
  useEffect(() => {
    if (arrived && !spec) landed()
  }, [arrived, spec, landed])

  return spec ? <Flight spec={spec} onDone={landed} /> : null
}
