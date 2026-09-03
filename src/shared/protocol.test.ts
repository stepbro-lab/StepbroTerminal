import { describe, expect, it } from 'vitest'
import { encodeFrame, FrameParser } from './protocol'

describe('frame codec', () => {
  it('round-trips a json-only frame', () => {
    const p = new FrameParser()
    const got: any[] = []
    p.onFrame = (m, b) => got.push([m, b.length])
    p.push(encodeFrame({ t: 'list' }))
    expect(got).toEqual([[{ t: 'list' }, 0]])
  })

  it('round-trips json with binary payload', () => {
    const p = new FrameParser()
    const got: any[] = []
    p.onFrame = (m, b) => got.push([m, Buffer.from(b).toString()])
    p.push(encodeFrame({ t: 'output', id: 'a' }, Buffer.from('hello')))
    expect(got).toEqual([[{ t: 'output', id: 'a' }, 'hello']])
  })

  it('handles frames split across arbitrary chunks', () => {
    const p = new FrameParser()
    const got: any[] = []
    p.onFrame = (m, b) => got.push([m.t, Buffer.from(b).toString()])
    const all = Buffer.concat([
      encodeFrame({ t: 'a' }, Buffer.from('12345')),
      encodeFrame({ t: 'b' }),
      encodeFrame({ t: 'c' }, Buffer.from('xyz'))
    ])
    p.push(all.subarray(0, 3))
    p.push(all.subarray(3, 20))
    p.push(all.subarray(20, 21))
    p.push(all.subarray(21))
    expect(got).toEqual([
      ['a', '12345'],
      ['b', ''],
      ['c', 'xyz']
    ])
  })

  it('skips a frame with invalid json without losing the next one', () => {
    const p = new FrameParser()
    const got: any[] = []
    p.onFrame = (m) => got.push(m.t)
    const bad = Buffer.from('{oops')
    const frame = Buffer.allocUnsafe(8 + bad.length)
    frame.writeUInt32BE(bad.length, 0)
    frame.writeUInt32BE(0, 4)
    bad.copy(frame, 8)
    p.push(Buffer.concat([frame, encodeFrame({ t: 'ok' })]))
    expect(got).toEqual(['ok'])
  })
})
