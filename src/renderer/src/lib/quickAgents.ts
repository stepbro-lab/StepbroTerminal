import type { Preset } from '@shared/types'

export const CHIP_PX = 22
const GAP_PX = 1
const PAD_PX = 3
const ROW_OTHER_PX = 58

export const stripWidth = (chips: number): number => chips * CHIP_PX + Math.max(0, chips - 1) * GAP_PX + PAD_PX * 2

export function chipsThatFit(sidebarWidth: number): number {
  return Math.max(2, Math.floor((sidebarWidth - ROW_OTHER_PX - PAD_PX * 2 + GAP_PX) / (CHIP_PX + GAP_PX)))
}

export function quickAgents(presets: Preset[], usage: Record<string, number>, room: number): Preset[] {
  const agents = presets.filter((p) => p.id !== 'shell' && p.installed)
  if (agents.length <= room) return agents
  const most = [...agents].sort((a, b) => (usage[b.id] ?? 0) - (usage[a.id] ?? 0)).slice(0, Math.max(0, room))
  const keep = new Set(most.map((p) => p.id))
  return agents.filter((p) => keep.has(p.id))
}
