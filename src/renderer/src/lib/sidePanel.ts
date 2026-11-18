export const DEFAULT_SIDE_SHARE = 0.44
const MIN_PANEL_PX = 300
const MIN_TERMINALS_PX = 320

export function sideShareAt(x: number, left: number, width: number): number {
  if (width <= 0) return DEFAULT_SIDE_SHARE
  const share = (left + width - x) / width
  const min = Math.min(0.5, MIN_PANEL_PX / width)
  const max = Math.max(0.5, 1 - MIN_TERMINALS_PX / width)
  return Math.min(max, Math.max(min, share))
}
