import { describe, expect, it } from 'vitest'
import { isHoverReport } from './mouseReports'

describe('isHoverReport', () => {
  it('knows a move with no button held, in SGR and in urxvt encoding, with or without modifiers', () => {
    expect(isHoverReport('\x1b[<35;40;12M')).toBe(true)
    expect(isHoverReport('\x1b[<39;40;12M')).toBe(true) // with Shift
    expect(isHoverReport('\x1b[<51;1;1M')).toBe(true) // with Ctrl
    expect(isHoverReport('\x1b[67;40;12M')).toBe(true) // urxvt: 35 + 32
  })

  it('leaves presses, releases, drags and the wheel as the input they are', () => {
    expect(isHoverReport('\x1b[<0;40;12M')).toBe(false) // left press
    expect(isHoverReport('\x1b[<0;40;12m')).toBe(false) // left release
    expect(isHoverReport('\x1b[<32;40;12M')).toBe(false) // drag with the left button
    expect(isHoverReport('\x1b[<34;40;12M')).toBe(false) // drag with the right button
    expect(isHoverReport('\x1b[<64;40;12M')).toBe(false) // wheel up
    expect(isHoverReport('\x1b[<65;40;12M')).toBe(false) // wheel down
    expect(isHoverReport('\x1b[32;40;12M')).toBe(false) // urxvt left press
  })

  it('leaves everything else alone', () => {
    expect(isHoverReport('a')).toBe(false)
    expect(isHoverReport('\x03')).toBe(false)
    expect(isHoverReport('\x1b[A')).toBe(false)
    expect(isHoverReport('\x1b[1;5A')).toBe(false)
    expect(isHoverReport('\x1b[<35;40;12Mx')).toBe(false)
  })
})
