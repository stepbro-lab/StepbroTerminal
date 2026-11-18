import type { Session } from '@shared/types'

export function agentOf(s: Session): string {
  return s.agent.detectedPreset ?? s.presetId
}

export function pickSession(sessions: Session[], query: string, selfId?: string): Session | null {
  const q = query.trim().toLowerCase()
  if (!q) return null
  const others = sessions.filter((s) => s.id !== selfId)
  const rank = (s: Session): number => (s.alive ? 1e15 : 0) + s.updatedAt
  const best = (list: Session[]): Session | null => (list.length ? list.slice().sort((a, b) => rank(b) - rank(a))[0] : null)
  const byId = others.filter((s) => s.id.toLowerCase().startsWith(q))
  if (byId.length) return best(byId)
  const byAgent = others.filter((s) => agentOf(s).toLowerCase() === q)
  if (byAgent.length) return best(byAgent)
  const byTitle = others.filter((s) => s.title.toLowerCase().includes(q))
  if (byTitle.length) return best(byTitle)
  const word = q.split(/\W+/).find((w) => others.some((s) => agentOf(s).toLowerCase() === w))
  return word ? best(others.filter((s) => agentOf(s).toLowerCase() === word)) : null
}
