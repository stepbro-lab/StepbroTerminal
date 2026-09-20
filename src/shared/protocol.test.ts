import { describe, expect, it } from 'vitest'
import { encodeFrame, FrameParser } from './protocol'

describe('frame codec', () => {
  it('handles a large replay fragmented into small socket reads', () => {
    const p = new FrameParser()
    const payload = Buffer.alloc(2 * 1024 * 1024, 0x61)
    const frame = encodeFrame({ t: 'replay', id: 's' }, payload)
    let received: Uint8Array | undefined
    p.onFrame = (_, bytes) => { received = bytes }
    for (let i = 0; i < frame.length; i += 257) p.push(frame.subarray(i, i + 257))
    expect(Buffer.from(received!).equals(payload)).toBe(true)
    const retained = received!
    frame.fill(0)
    p.push(encodeFrame({ t: 'list' }))
    expect(retained[0]).toBe(0x61)
  })

  it('owns binary payloads and survives queue compaction with incomplete following frames', () => {
    const p = new FrameParser()
    const received: Uint8Array[] = []
    p.onFrame = (_, bytes) => { received.push(bytes) }
    const frame = encodeFrame({ t: 'output' }, Buffer.from('keep'))
    p.push(frame)
    frame.fill(0)
    expect(Buffer.from(received[0]).toString()).toBe('keep')
    const next = Buffer.concat(Array.from({ length: 3000 }, () => encodeFrame({ t: 'x' })))
    for (let i = 0; i < next.length; i += 13) p.push(next.subarray(i, i + 13))
    expect(received).toHaveLength(3001)
  })
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
