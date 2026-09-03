import { describe, expect, it } from 'vitest'
import { SizeOwners } from './sizeOwners'

describe('SizeOwners', () => {
  it('lets anyone resize a session nobody is looking at', () => {
    const o = new SizeOwners<string>()
    expect(o.owns('s', 'a')).toBe(true)
    expect(o.owns('s', 'b')).toBe(true)
  })

  it('keeps the size with the first client to attach', () => {
    const o = new SizeOwners<string>()
    o.claim('s', 'a')
    o.claim('s', 'b')
    expect(o.owns('s', 'a')).toBe(true)
    expect(o.owns('s', 'b')).toBe(false)
  })

  it('hands the session to the next attached client with the size it asked for', () => {
    const o = new SizeOwners<string>()
    o.claim('s', 'a')
    o.note('s', 'b', { cols: 80, rows: 24 })
    expect(o.release('s', 'a', ['a', 'b'])).toEqual({ cols: 80, rows: 24 })
    expect(o.owns('s', 'b')).toBe(true)
    expect(o.owns('s', 'a')).toBe(false)
  })

  it('does nothing when a bystander leaves', () => {
    const o = new SizeOwners<string>()
    o.claim('s', 'a')
    expect(o.release('s', 'b', ['a'])).toBeNull()
    expect(o.owns('s', 'a')).toBe(true)
  })

  it('frees the session when the last client leaves or the session goes away', () => {
    const o = new SizeOwners<string>()
    o.claim('s', 'a')
    expect(o.release('s', 'a', [])).toBeNull()
    expect(o.owns('s', 'b')).toBe(true)
    o.claim('t', 'a')
    o.forget('t')
    expect(o.owns('t', 'b')).toBe(true)
  })
})
