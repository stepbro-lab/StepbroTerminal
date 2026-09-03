export interface Point {
  x: number
  y: number
}

export interface FlightPath {
  /** Cubic bezier: start, two control points, end. */
  points: [Point, Point, Point, Point]
  /** Seconds the flight takes; longer trips fly a little longer, never much. */
  duration: number
  /** How far above the straight line the arc peaks, in px. */
  lift: number
}

/**
 * A gentle toss from `from` to `to`: it rises early, sails, and settles into the target.
 * The lift grows with the distance but stays within bounds so short hops do not loop and
 * long ones do not leave the window.
 */
export function flightPath(from: Point, to: Point): FlightPath {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const dist = Math.hypot(dx, dy)
  const lift = Math.min(200, Math.max(56, dist * 0.26))
  const top = Math.min(from.y, to.y)
  const c1: Point = { x: from.x + dx * 0.22, y: top - lift }
  const c2: Point = { x: to.x - dx * 0.16, y: top - lift * 0.55 }
  const duration = Math.min(0.9, Math.max(0.5, 0.42 + dist / 1900))
  return { points: [from, c1, c2, to], duration, lift }
}
