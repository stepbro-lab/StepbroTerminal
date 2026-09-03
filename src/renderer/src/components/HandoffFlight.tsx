import { useEffect, useMemo } from 'react'
import { ArrowRight } from 'lucide-react'
import { useHandoff } from '@/stores/handoff'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { defaultTitle, rowPresetId } from '@/lib/sidebarModel'
import { AgentLogo } from './sidebar/AgentLogo'
import { Flight, flightText, type FlightSpec } from './Flight'

/** Where a session is on screen: its pane if visible, else its row in the sidebar. */
function spot(id: string): { rect: DOMRect; pane: boolean; el: HTMLElement } | null {
  const pane = document.querySelector<HTMLElement>(`[data-session-id="${id}"]`)
  if (pane) return { rect: pane.getBoundingClientRect(), pane: true, el: pane }
  const row = document.querySelector<HTMLElement>(`[data-session-row="${id}"]`)
  if (row) return { rect: row.getBoundingClientRect(), pane: false, el: row }
  return null
}

/**
 * One agent handed text to another session: the message flies from the sender's pane to the
 * receiver, which lights up when it lands. If the receiver is not on screen, the flight ends
 * on its sidebar row and a toast says where it went.
 */
export function HandoffFlight() {
  const pending = useHandoff((s) => s.pending)
  const landed = useHandoff((s) => s.landed)
  const sessions = useData((s) => s.sessions)
  const presets = useData((s) => s.presets)

  const spec = useMemo<FlightSpec | null>(() => {
    if (!pending) return null
    const to = spot(pending.to)
    if (!to) return null
    const from = spot(pending.from)
    const target = sessions[pending.to]
    const name = target ? target.title || defaultTitle(target) : 'session'
    const preset = target ? presets.find((p) => p.id === rowPresetId(target)) : undefined
    const start = from
      ? from.pane
        ? { x: from.rect.left + Math.min(from.rect.width * 0.45, 360), y: from.rect.top + Math.min(from.rect.height * 0.7, 300) }
        : { x: from.rect.right - 20, y: from.rect.top + from.rect.height / 2 }
      : { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    const end = to.pane
      ? { x: to.rect.left + Math.min(to.rect.width * 0.5, 320), y: to.rect.bottom - 72 }
      : { x: to.rect.left + to.rect.width * 0.62, y: to.rect.top + to.rect.height / 2 }
    return {
      key: `${pending.from}:${pending.to}:${Date.now()}`,
      from: start,
      to: end,
      icon: preset && preset.id !== 'shell' ? <AgentLogo presetId={preset.id} size={11} /> : <ArrowRight size={11} />,
      label: `→ ${name}`,
      text: flightText(pending.text, 42),
      onLand: () => {
        to.el.classList.add('handoff-landed')
        window.setTimeout(() => to.el.classList.remove('handoff-landed'), 1300)
        if (!to.pane) useUi.getState().toast(`Sent to ${name}`, 'success')
      }
    }
    // The spec is built once per handoff; later store changes must not restart the flight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending])

  useEffect(() => {
    if (pending && !spec) landed()
  }, [pending, spec, landed])

  return spec ? <Flight spec={spec} onDone={landed} /> : null
}
