import { describe, expect, it } from 'vitest'
import { TOPITO_CLIPS, TOPITO_COLS, TOPITO_FRAMES, TOPITO_ROWS } from './frames'
import { decodeFrame, frameCells } from './sprite'

describe('decodeFrame', () => {
  it('expands a count into that many cells and a bare letter into one', () => {
    expect(decodeFrame('3.W2S')).toBe('...WSS')
    expect(decodeFrame('12.A')).toBe('............A')
  })
})

describe("Topito's frames", () => {
  it('every frame fills the grid exactly', () => {
    for (let i = 0; i < TOPITO_FRAMES.length; i++) {
      expect(frameCells(i).length, `frame ${i}`).toBe(TOPITO_COLS * TOPITO_ROWS)
    }
  })

  it('every clip points at frames that exist, for a time that is sensible, with its way in inside it', () => {
    for (const [name, c] of Object.entries(TOPITO_CLIPS)) {
      expect(c.frames.length, name).toBeGreaterThan(0)
      expect(c.intro, name).toBeLessThan(c.frames.length)
      for (const [frame, ms] of c.frames) {
        expect(frame, name).toBeGreaterThanOrEqual(0)
        expect(frame, name).toBeLessThan(TOPITO_FRAMES.length)
        expect(ms, name).toBeGreaterThanOrEqual(60)
        expect(ms, name).toBeLessThanOrEqual(1000)
      }
    }
  })
})
