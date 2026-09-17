import { describe, expect, it } from 'vitest'
import { TopitoGate } from './topitoGate'

describe('TopitoGate', () => {
  it('lets a session speak, then holds it back for the gap and says how long is left', () => {
    const gate = new TopitoGate(20_000)
    expect(gate.take('a', 1_000)).toBe(0)
    expect(gate.take('a', 6_000)).toBe(15_000)
    expect(gate.take('a', 21_000)).toBe(0)
  })

  it('does not hold one session up for another', () => {
    const gate = new TopitoGate(20_000)
    expect(gate.take('a', 1_000)).toBe(0)
    expect(gate.take('b', 1_500)).toBe(0)
  })

  it('does not count a refused attempt as speaking', () => {
    const gate = new TopitoGate(20_000)
    gate.take('a', 0)
    gate.take('a', 19_000)
    expect(gate.take('a', 20_000)).toBe(0)
  })
})
