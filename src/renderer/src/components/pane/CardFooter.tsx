import { useEffect, useState } from 'react'
import type { Session, TranscriptDetails } from '@shared/types'
import { useData } from '@/stores/data'
import { formatCost, formatTokens, shortModel, shortPath } from '@/lib/format'
import { rowPresetId } from '@/lib/sidebarModel'

const detailsCache = new Map<string, { at: number; d: TranscriptDetails }>()

export function CardFooter({ session }: { session: Session }) {
  const presets = useData((s) => s.presets)
  const preset = presets.find((p) => p.id === rowPresetId(session))
  const color = preset?.color ?? '#8a8a90'
  const isAgent = preset && preset.id !== 'shell'
  const [details, setDetails] = useState<TranscriptDetails>({})

  const agentId = session.agent.sessionId
  const status = session.status
  useEffect(() => {
    if (!agentId || rowPresetId(session) !== 'claude') {
      setDetails({})
      return
    }
    const key = `${session.projectPath}|${agentId}`
    const cached = detailsCache.get(key)
    if (cached && Date.now() - cached.at < 5000) {
      setDetails(cached.d)
      return
    }
    let alive = true
    void window.step.invoke('history:details', session.projectPath, agentId).then((d) => {
      detailsCache.set(key, { at: Date.now(), d })
      if (alive) setDetails(d)
    })
    return () => {
      alive = false
    }
    // Re-read when the agent finishes a turn (status flips), not on every render.
  }, [agentId, status, session.projectPath])

  const model = session.agent.model ?? details.model
  const tokens = (details.inputTokens ?? 0) + (details.outputTokens ?? 0)
  const left: string[] = []
  if (isAgent) left.push(preset!.name)
  if (model) left.push(shortModel(model))
  left.push(shortPath(session.projectPath))
  const right: string[] = []
  if (session.status === 'working' && session.agent.tool) right.push(session.agent.tool)
  if (session.agent.permissionMode && session.agent.permissionMode !== 'default') right.push(session.agent.permissionMode.replace(/([A-Z])/g, ' $1').toLowerCase())
  if (tokens) right.push(formatTokens(tokens))
  if (details.costUsd !== undefined) right.push(formatCost(details.costUsd))
  if (!session.alive && session.status === 'exited') right.push(`exited${session.exitCode !== undefined ? ` (${session.exitCode})` : ''}`)

  return (
    <div
      className="flex h-7 shrink-0 items-center gap-3 border-t border-line px-3 font-mono text-[11px]"
      style={{ color: isAgent ? color : 'var(--text-muted)' }}
    >
      <span className="min-w-0 truncate">{left.join(' · ')}</span>
      <span className="ml-auto shrink-0 text-muted">{right.join(' · ')}</span>
    </div>
  )
}
