import { describe, expect, it } from 'vitest'
import { DEFAULT_SIDE_SHARE, sideShareAt } from './sidePanel'

describe('sideShareAt', () => {
  it('gives the panel what lies right of the pointer', () => {
    expect(sideShareAt(600, 0, 1000)).toBeCloseTo(0.4)
    expect(sideShareAt(700, 100, 1000)).toBeCloseTo(0.4)
  })

  it('never squeezes the page or the terminals out of use', () => {
    // Dragged to the far right: the page keeps 300px; to the far left: the terminals keep 320px.
    expect(sideShareAt(990, 0, 1000)).toBeCloseTo(0.3)
    expect(sideShareAt(10, 0, 1000)).toBeCloseTo(0.68)
  })

  it('falls back to the usual share when there is no width to measure', () => {
    expect(sideShareAt(10, 0, 0)).toBe(DEFAULT_SIDE_SHARE)
  })
})
