import type { Session, TopitoSay } from '@shared/types'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { useHandoff } from '@/stores/handoff'
import { useNotes } from '@/stores/notes'
import { useTopito, type TopitoLine } from '@/stores/topito'
import { attentionCounts, attentionQueue } from '@/lib/attention'
import { defaultTitle } from '@/lib/sidebarModel'
import { t } from '@/lib/i18n'
import { ambientClip, clipForMood, moments, newlyWaiting } from './mood'

const SETTLE_MS = 2500

const title = (s: Session): string => s.title || defaultTitle(s)

export function startTopito(): () => void {
  const topito = useTopito.getState
  let target = topito().ambient
  let pending = 0

  const reconsider = (now: boolean): void => {
    const data = useData.getState()
    const next = ambientClip({ hostConnecting: data.hostState.kind === 'connecting', sessions: Object.values(data.sessions) })
    if (next === target) return
    target = next
    window.clearTimeout(pending)
    if (now) topito().setAmbient(next)
    else pending = window.setTimeout(() => topito().setAmbient(target), SETTLE_MS)
  }

  const offData = useData.subscribe((d, was) => {
    if (d.sessions !== was.sessions) {
      for (const clip of moments(was.sessions, d.sessions)) topito().play(clip)
      for (const s of newlyWaiting(was.sessions, d.sessions)) {
        topito().showCorner({ clip: 'peek', text: t('{title} needs you', { title: title(s) }), sessionId: s.id }, 7000)
      }
    }
    if (d.sessions !== was.sessions || d.hostState !== was.hostState) reconsider(false)
  })
  const offHandoff = useHandoff.subscribe((h, was) => {
    if (h.pending && h.pending !== was.pending) topito().play('letter')
  })
  const offNotes = useNotes.subscribe((n, was) => {
    if (n.arrived && n.arrived !== was.arrived) topito().play('note')
  })

  reconsider(true)
  topito().play('hello')
  return () => {
    window.clearTimeout(pending)
    offData()
    offHandoff()
    offNotes()
  }
}

export function openSession(id: string): void {
  const s = useData.getState().sessions[id]
  if (!s) return
  const ui = useUi.getState()
  ui.setActiveProject(s.projectPath)
  ui.setActive(id)
}

export function topitoSay(say: TopitoSay): void {
  const data = useData.getState()
  const s = data.sessions[say.sessionId]
  const agent = s ? (s.agent.detectedPreset ?? s.presetId) : undefined
  const name = agent ? (data.presets.find((p) => p.id === agent)?.name ?? agent) : undefined
  const from = s ? [name, title(s)].filter(Boolean).join(' · ') : undefined
  const clip = clipForMood(say.mood)
  const ms = Math.min(12000, Math.max(5000, 3500 + say.message.length * 55))
  useTopito.getState().showCorner({ clip, text: say.message, from, sessionId: s ? say.sessionId : undefined }, ms)
}

export function askTopito(): void {
  const sessions = Object.values(useData.getState().sessions).filter((s) => s.alive && !s.archived)
  const { needsYou, done, working } = attentionCounts(sessions)
  const lines: TopitoLine[] = []
  const waiting = attentionQueue(sessions).filter((s) => s.status === 'attention' || s.status === 'error')
  for (const s of waiting.slice(0, 3)) {
    lines.push({ text: t(s.status === 'error' ? '{title} ran into trouble' : '{title} needs you', { title: title(s) }), sessionId: s.id })
  }
  if (needsYou > 3) lines.push({ text: t('and {n} more', { n: needsYou - 3 }) })
  if (working) lines.push({ text: t(working === 1 ? '1 agent working' : '{n} agents working', { n: working }) })
  if (done) lines.push({ text: t(done === 1 ? '1 finished' : '{n} finished', { n: done }) })
  if (!lines.length) lines.push({ text: t('All quiet down here') })
  useTopito.getState().showBubble(lines, 6500)
  useTopito.getState().play(needsYou ? 'peek' : 'hello')
}
