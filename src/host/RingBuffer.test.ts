import { describe, expect, it } from 'vitest'
import { RingBuffer } from './RingBuffer'

const text = (b: Uint8Array) => Buffer.from(b).toString()

describe('RingBuffer', () => {
  it('stores writes smaller than capacity in order', () => {
    const r = new RingBuffer(10)
    r.write(Buffer.from('abc'))
    r.write(Buffer.from('de'))
    expect(text(r.snapshot())).toBe('abcde')
    expect(r.size).toBe(5)
  })

  it('keeps only the most recent bytes when wrapping across several chunks', () => {
    const r = new RingBuffer(8)
    r.write(Buffer.from('12345'))
    r.write(Buffer.from('6789'))
    expect(text(r.snapshot())).toBe('23456789')
    r.write(Buffer.from('ab'))
    expect(text(r.snapshot())).toBe('456789ab')
  })

  it('handles a single write larger than capacity', () => {
    const r = new RingBuffer(4)
    r.write(Buffer.from('abcdefgh'))
    expect(text(r.snapshot())).toBe('efgh')
    r.write(Buffer.from('z'))
    expect(text(r.snapshot())).toBe('fghz')
  })

  it('clears', () => {
    const r = new RingBuffer(4)
    r.write(Buffer.from('ab'))
    r.clear()
    expect(r.size).toBe(0)
    r.write(Buffer.from('cd'))
    expect(text(r.snapshot())).toBe('cd')
  })
})
