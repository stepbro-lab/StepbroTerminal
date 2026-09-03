import { describe, expect, it } from 'vitest'
import { flightPath } from './flightPath'

describe('flightPath', () => {
  it('starts and ends where asked and peaks above both', () => {
    const p = flightPath({ x: 400, y: 500 }, { x: 60, y: 20 })
    expect(p.points[0]).toEqual({ x: 400, y: 500 })
    expect(p.points[3]).toEqual({ x: 60, y: 20 })
    expect(p.points[1].y).toBeLessThan(20)
    expect(p.points[2].y).toBeLessThan(20)
  })

  it('keeps the lift and duration within bounds for short and long trips', () => {
    const short = flightPath({ x: 0, y: 0 }, { x: 40, y: 0 })
    const long = flightPath({ x: 0, y: 0 }, { x: 3000, y: 1200 })
    expect(short.lift).toBe(56)
    expect(long.lift).toBe(200)
    expect(short.duration).toBe(0.5)
    expect(long.duration).toBe(0.9)
    const mid = flightPath({ x: 0, y: 0 }, { x: 600, y: 300 })
    expect(mid.duration).toBeGreaterThan(0.5)
    expect(mid.duration).toBeLessThan(0.9)
  })

  it('bends the same way regardless of direction', () => {
    const right = flightPath({ x: 100, y: 300 }, { x: 900, y: 300 })
    const left = flightPath({ x: 900, y: 300 }, { x: 100, y: 300 })
    expect(right.lift).toBe(left.lift)
    expect(right.points[1].y).toBe(left.points[1].y)
    expect(right.points[1].x).toBeGreaterThan(100)
    expect(left.points[1].x).toBeLessThan(900)
  })
})
