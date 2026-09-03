import type { Session } from '@shared/types'

/** The agent in front of a session: what was launched, or what the user typed inside a shell. */
export function agentOf(s: Session): string {
  return s.agent.detectedPreset ?? s.presetId
}

/**
 * Finds the session an agent means by "codex", "the claude one", a title or an id.
 * Live sessions win over dead ones, and among those the most recently active.
 */
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
  // "the codex session", "codex one"…: any word that names an agent.
  const word = q.split(/\W+/).find((w) => others.some((s) => agentOf(s).toLowerCase() === w))
  return word ? best(others.filter((s) => agentOf(s).toLowerCase() === word)) : null
}
