import type { Session } from '@shared/types'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'

export function attentionQueue(sessions: Session[]): Session[] {
  const rank = (s: Session): number => (s.status === 'attention' ? 0 : s.status === 'error' ? 1 : s.status === 'done' ? 2 : 9)
  return sessions.filter((s) => rank(s) < 9).sort((a, b) => rank(a) - rank(b) || a.statusAt - b.statusAt)
}

export function attentionCounts(sessions: Session[]): { needsYou: number; done: number; working: number } {
  let needsYou = 0
  let done = 0
  let working = 0
  for (const s of sessions) {
    if (s.status === 'attention' || s.status === 'error') needsYou++
    else if (s.status === 'done') done++
    else if (s.status === 'working' || s.status === 'starting') working++
  }
  return { needsYou, done, working }
}

export function jumpToAttention(): boolean {
  const ui = useUi.getState()
  const queue = attentionQueue(Object.values(useData.getState().sessions))
  if (!queue.length) return false
  const idx = queue.findIndex((s) => s.id === ui.activeId)
  const next = queue[(idx + 1) % queue.length]
  if (!next || next.id === ui.activeId) return queue.length > 0
  ui.setActiveProject(next.projectPath)
  ui.setActive(next.id)
  return true
}
