import { describe, expect, it } from 'vitest'
import { approach, loudness, sweep } from './glow'

describe('approach', () => {
  it('rises fast and falls slowly, and never overshoots', () => {
    const up = approach(0, 1, 0.05, 0.06, 0.3)
    const down = approach(1, 0, 0.05, 0.06, 0.3)
    expect(up).toBeGreaterThan(1 - down)
    expect(approach(0, 1, 10, 0.06, 0.3)).toBeCloseTo(1, 5)
    expect(approach(0.4, 0.4, 0.05, 0.06, 0.3)).toBe(0.4)
  })

  it('stands still when no time has passed', () => {
    expect(approach(0.2, 1, 0, 0.06, 0.3)).toBe(0.2)
  })
})

describe('loudness', () => {
  it('ignores the hiss under a quiet room and fills the range with speech', () => {
    expect(loudness(0)).toBe(0)
    expect(loudness(0.02)).toBe(0)
    expect(loudness(0.3)).toBeGreaterThan(0.3)
    expect(loudness(1)).toBe(1)
    expect(loudness(5)).toBe(1)
  })
})

describe('sweep', () => {
  it('starts in the middle and travels side to side inside the edges', () => {
    expect(sweep(0)).toBeCloseTo(0.5, 5)
    const xs = Array.from({ length: 200 }, (_, i) => sweep(i / 20))
    expect(Math.min(...xs)).toBeGreaterThan(0.15)
    expect(Math.max(...xs)).toBeLessThan(0.85)
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.5)
  })
})
