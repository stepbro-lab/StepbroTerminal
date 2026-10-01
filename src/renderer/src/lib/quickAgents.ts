import type { Preset } from '@shared/types'

/** A chip in a folder row's strip, with 1px between chips and 3px inside either end. */
export const CHIP_PX = 22
const GAP_PX = 1
const PAD_PX = 3
/** Everything in a folder row besides the strip: its inset and padding, the folder icon and the gaps around the name. */
const ROW_OTHER_PX = 58

/** How wide the strip is with this many chips, "+" and the shell among them. */
export const stripWidth = (chips: number): number => chips * CHIP_PX + Math.max(0, chips - 1) * GAP_PX + PAD_PX * 2

/** How many chips fit in a folder row of a sidebar this wide, so the open strip never runs past the row. */
export function chipsThatFit(sidebarWidth: number): number {
  return Math.max(2, Math.floor((sidebarWidth - ROW_OTHER_PX - PAD_PX * 2 + GAP_PX) / (CHIP_PX + GAP_PX)))
}

/**
 * The agents a folder row offers to start in one click, at most `room` of them: those installed,
 * and when they do not all fit, the ones used most. They keep the order the app lists them in, which
 * does not change with use, so each stays where the hand expects it.
 */
export function quickAgents(presets: Preset[], usage: Record<string, number>, room: number): Preset[] {
  const agents = presets.filter((p) => p.id !== 'shell' && p.installed)
  if (agents.length <= room) return agents
  const most = [...agents].sort((a, b) => (usage[b.id] ?? 0) - (usage[a.id] ?? 0)).slice(0, Math.max(0, room))
  const keep = new Set(most.map((p) => p.id))
  return agents.filter((p) => keep.has(p.id))
}
