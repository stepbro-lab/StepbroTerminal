/**
 * How much of the pane area a side panel (a preview, the changes) takes, as a share of its width.
 * It is dragged from the edge between the terminals and the panel, and kept.
 */

export const DEFAULT_SIDE_SHARE = 0.44
/** Narrower than this and a page no longer reads; the terminals likewise need room for a prompt. */
const MIN_PANEL_PX = 300
const MIN_TERMINALS_PX = 320

/** The share for a pointer at `x`, in an area from `left` to `left + width`, kept within reach of both sides. */
export function sideShareAt(x: number, left: number, width: number): number {
  if (width <= 0) return DEFAULT_SIDE_SHARE
  const share = (left + width - x) / width
  const min = Math.min(0.5, MIN_PANEL_PX / width)
  const max = Math.max(0.5, 1 - MIN_TERMINALS_PX / width)
  return Math.min(max, Math.max(min, share))
}
