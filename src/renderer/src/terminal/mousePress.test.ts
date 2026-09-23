import { describe, expect, it } from 'vitest'
import { pressOutcome, selectionKey } from './mousePress'

const at = (clientX: number, clientY: number) => ({ clientX, clientY })

describe('pressOutcome', () => {
  it('calls a press that came up where it went down a click', () => {
    expect(pressOutcome(at(100, 50), at(100, 50))).toBe('click')
    // A hand shakes a little; that is still the same spot.
    expect(pressOutcome(at(100, 50), at(102, 48))).toBe('click')
  })

  it('calls a press that travelled a drag', () => {
    expect(pressOutcome(at(100, 50), at(140, 50))).toBe('drag')
    expect(pressOutcome(at(100, 50), at(100, 90))).toBe('drag')
    expect(pressOutcome(at(100, 50), at(60, 20))).toBe('drag')
  })

  it('takes the slop it is given', () => {
    expect(pressOutcome(at(0, 0), at(8, 0), 10)).toBe('click')
    expect(pressOutcome(at(0, 0), at(8, 0), 2)).toBe('drag')
  })
})

describe('selectionKey', () => {
  it('is Option on a Mac and Shift everywhere else', () => {
    expect(selectionKey('darwin')).toBe('altKey')
    expect(selectionKey('win32')).toBe('shiftKey')
    expect(selectionKey('linux')).toBe('shiftKey')
  })
})
