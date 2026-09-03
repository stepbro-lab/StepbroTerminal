import { useRef } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { useHandoff } from '@/stores/handoff'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { defaultTitle } from '@/lib/sidebarModel'

gsap.registerPlugin(useGSAP)

/** Where a session is on screen: its pane if visible, else its row in the sidebar. */
function spot(id: string): { rect: DOMRect; pane: boolean; el: HTMLElement } | null {
  const pane = document.querySelector<HTMLElement>(`[data-session-id="${id}"]`)
  if (pane) return { rect: pane.getBoundingClientRect(), pane: true, el: pane }
  const row = document.querySelector<HTMLElement>(`[data-session-row="${id}"]`)
  if (row) return { rect: row.getBoundingClientRect(), pane: false, el: row }
  return null
}

/**
 * One agent handed text to another session: a chip carries the first words from the sender's
 * pane to the receiver, which lights up when it lands. Transforms and opacity only.
 */
export function HandoffFlight() {
  const pending = useHandoff((s) => s.pending)
  const landed = useHandoff((s) => s.landed)
  const layer = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      if (!pending || !layer.current) return
      const from = spot(pending.from)
      const to = spot(pending.to)
      if (!to) {
        landed()
        return
      }
      const target = useData.getState().sessions[pending.to]
      const name = target ? target.title || defaultTitle(target) : 'session'
      const start = from
        ? from.pane
          ? { x: from.rect.left + Math.min(from.rect.width * 0.45, 360), y: from.rect.top + Math.min(from.rect.height * 0.7, 300) }
          : { x: from.rect.right - 20, y: from.rect.top + from.rect.height / 2 }
        : { x: window.innerWidth / 2, y: window.innerHeight / 2 }
      const end = to.pane
        ? { x: to.rect.left + Math.min(to.rect.width * 0.5, 320), y: to.rect.bottom - 70 }
        : { x: to.rect.left + to.rect.width * 0.6, y: to.rect.top + to.rect.height / 2 }

      const chip = document.createElement('div')
      chip.className = 'handoff-chip'
      const label = document.createElement('span')
      label.className = 'handoff-chip-to'
      label.textContent = `→ ${name}`
      const body = document.createElement('span')
      body.textContent = pending.text.length > 46 ? pending.text.slice(0, 45).trimEnd() + '…' : pending.text
      chip.append(label, body)
      layer.current.appendChild(chip)

      gsap.set(chip, { x: start.x, y: start.y, xPercent: -50, yPercent: -50, scale: 0.9, opacity: 0, rotation: -2 })
      const lift = Math.min(start.y, end.y) - 70
      const tl = gsap.timeline({
        onComplete: () => {
          chip.remove()
          landed()
        }
      })
      tl.to(chip, { opacity: 1, scale: 1, rotation: 0, duration: 0.22, ease: 'back.out(1.6)' })
        .add('fly', '+=0.4')
        .to(chip, { x: end.x, duration: 0.75, ease: 'power2.inOut' }, 'fly')
        .to(chip, { y: lift, duration: 0.38, ease: 'power2.out' }, 'fly')
        .to(chip, { y: end.y, duration: 0.37, ease: 'power2.in' }, 'fly+=0.38')
        .to(chip, { rotation: 3, duration: 0.75, ease: 'sine.inOut' }, 'fly')
        .to(chip, { scale: 0.6, opacity: 0, duration: 0.18, ease: 'power2.in' }, 'fly+=0.62')
        .add(() => {
          to.el.classList.add('handoff-landed')
          window.setTimeout(() => to.el.classList.remove('handoff-landed'), 1800)
          if (!to.pane) useUi.getState().toast(`Sent to ${name}`, 'success')
        }, 'fly+=0.7')
    },
    { dependencies: [pending], scope: layer }
  )

  return <div ref={layer} className="pointer-events-none fixed inset-0 z-50" />
}
