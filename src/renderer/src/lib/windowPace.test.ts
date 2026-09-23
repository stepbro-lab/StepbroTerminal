import { describe, expect, it } from 'vitest'
import { paceFor } from './windowPace'

describe('paceFor', () => {
  it('moves at full speed only in front', () => {
    expect(paceFor(true, true)).toBe('live')
  })

  it('slows down behind another window', () => {
    expect(paceFor(true, false)).toBe('slow')
  })

  it('stands still out of sight, focused or not', () => {
    expect(paceFor(false, false)).toBe('off')
    expect(paceFor(false, true)).toBe('off')
  })
})
