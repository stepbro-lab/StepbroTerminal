import type { Session, TopitoSay } from '@shared/types'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { useVoice } from '@/stores/voice'
import { useHandoff } from '@/stores/handoff'
import { useNotes } from '@/stores/notes'
import { useTopito, type TopitoLine } from '@/stores/topito'
import { attentionCounts, attentionQueue } from '@/lib/attention'
import { defaultTitle } from '@/lib/sidebarModel'
import { t } from '@/lib/i18n'
import { ambientClip, clipForMood, moments, newlyWaiting } from './mood'

/**
 * Keeps Topito in step with the app: works out the clip he should be playing from the stores
 * (mood.ts), throws in the one-off moments as they happen, and brings him out at the corner of the
 * terminal when someone is waiting on you.
 */

/**
 * An agent's tool changes every few seconds, and a mole that changed what he was doing that often
 * would only twitch. A new look has to hold this long before he takes it up; the voice agent is
 * the exception, since what you say and what it answers should show the moment it happens.
 */
const SETTLE_MS = 2500

const title = (s: Session): string => s.title || defaultTitle(s)

export function startTopito(): () => void {
  const topito = useTopito.getState
  let target = topito().ambient
  let pending = 0

  const reconsider = (now: boolean): void => {
    const data = useData.getState()
    const next = ambientClip({ voice: useVoice.getState().state, hostConnecting: data.hostState.kind === 'connecting', sessions: Object.values(data.sessions) })
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
  const offVoice = useVoice.subscribe((v, was) => {
    if (v.state !== was.state) reconsider(true)
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
    offVoice()
    offHandoff()
    offNotes()
  }
}

/** Jumps to a session, the way every other link to one does. */
export function openSession(id: string): void {
  const s = useData.getState().sessions[id]
  if (!s) return
  const ui = useUi.getState()
  ui.setActiveProject(s.projectPath)
  ui.setActive(id)
}

/** An agent asked Topito to say something: he comes out at the corner of the terminal with it. */
export function topitoSay(say: TopitoSay): void {
  const data = useData.getState()
  const s = data.sessions[say.sessionId]
  const agent = s ? (s.agent.detectedPreset ?? s.presetId) : undefined
  const name = agent ? (data.presets.find((p) => p.id === agent)?.name ?? agent) : undefined
  const from = s ? [name, title(s)].filter(Boolean).join(' · ') : undefined
  const clip = clipForMood(say.mood)
  // Long enough to read at a glance: a little more for every word, within reason.
  const ms = Math.min(12000, Math.max(5000, 3500 + say.message.length * 55))
  useTopito.getState().showCorner({ clip, text: say.message, from, sessionId: s ? say.sessionId : undefined }, ms)
  useTopito.getState().play(clip)
}

/** What Topito tells you when you click him: who is waiting, who is working, who is done. */
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
