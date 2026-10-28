import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import net from 'node:net'
import { FrameParser, encodeFrame } from '@shared/protocol'
import { HostServer } from './HostServer'
import type { SessionManager } from './SessionManager'
import type { NoteStore } from './NoteStore'

class Socket extends EventEmitter {
  destroyed = false
  write = vi.fn((_data: Buffer) => true)
  setNoDelay(): void {}
  destroy(): void { this.destroyed = true; this.emit('close') }
}
let accept: (socket: net.Socket) => void
let server: HostServer
let sm: EventEmitter & { pause: ReturnType<typeof vi.fn>; resume: ReturnType<typeof vi.fn>; snapshot: ReturnType<typeof vi.fn>; resize: ReturnType<typeof vi.fn> }
beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(net, 'createServer').mockImplementation(((listener: typeof accept) => {
    accept = listener
    return { close: vi.fn() }
  }) as any)
  sm = Object.assign(new EventEmitter(), { pause: vi.fn(), resume: vi.fn(), snapshot: vi.fn(async () => Buffer.alloc(0)), resize: vi.fn() })
  server = new HostServer(sm as unknown as SessionManager, new EventEmitter() as NoteStore, 'unused', 'test')
})
afterEach(() => { server.close(); vi.useRealTimers(); vi.restoreAllMocks() })
async function attach(): Promise<Socket> {
  const sock = new Socket()
  accept(sock as unknown as net.Socket)
  sock.emit('data', encodeFrame({ t: 'attach', id: 's' }))
  await Promise.resolve()
  sm.pause.mockClear()
  sm.resume.mockClear()
  return sock
}
describe('socket output pressure', () => {
  it('counts bytes before the batch timer flushes and releases them on detach', async () => {
    const sock = await attach()
    sm.emit('output', 's', Buffer.alloc(1024 * 1024 + 1))
    expect(sm.pause).toHaveBeenCalledWith('s')
    sock.emit('data', encodeFrame({ t: 'detach', id: 's' }))
    expect(sm.resume).toHaveBeenCalledWith('s')
    const writes = sock.write.mock.calls.length
    vi.advanceTimersByTime(8)
    expect(sock.write).toHaveBeenCalledTimes(writes)
  })

  it('does not let an ACK resume a socket whose write buffer is still blocked', async () => {
    const sock = await attach()
    sock.write.mockReturnValue(false)
    sm.emit('output', 's', Buffer.from('hello'))
    vi.advanceTimersByTime(8)
    expect(sm.pause).toHaveBeenCalledWith('s')
    sm.resume.mockClear()
    sock.emit('data', encodeFrame({ t: 'ack', id: 's', bytes: 5 }))
    expect(sm.resume).not.toHaveBeenCalled()
    sock.emit('drain')
    expect(sm.resume).toHaveBeenCalledWith('s')
  })

  it('releases a disconnected slow client without keeping its session paused', async () => {
    const sock = await attach()
    sm.emit('output', 's', Buffer.alloc(1024 * 1024 + 1))
    sm.resume.mockClear()
    sock.destroy()
    expect(sm.resume).toHaveBeenCalledWith('s')
    expect(server.clientCount).toBe(0)
  })
})

describe('errors the host lives through', () => {
  /** What the app on this socket was sent, as messages. */
  function received(sock: Socket): Array<Record<string, unknown>> {
    const out: Array<Record<string, unknown>> = []
    const parser = new FrameParser()
    parser.onFrame = (msg) => out.push(msg as Record<string, unknown>)
    for (const [data] of sock.write.mock.calls) parser.push(data)
    return out
  }
  function hello(): Socket {
    Object.assign(sm, { list: () => [] })
    ;(server as any).notes.list = () => []
    const sock = new Socket()
    accept(sock as unknown as net.Socket)
    sock.emit('data', encodeFrame({ t: 'hello', version: 'test' }))
    return sock
  }

  it('go to the app, the same one only once every ten minutes', () => {
    const sock = hello()
    server.fault('boom', 'Error: boom\n    at x', 0)
    server.fault('boom', 'Error: boom\n    at x', 60_000)
    server.fault('other', undefined, 60_000)
    server.fault('boom', 'Error: boom\n    at x', 11 * 60_000)
    const faults = received(sock).filter((m) => m.t === 'fault')
    expect(faults).toEqual([
      { t: 'fault', message: 'boom', stack: 'Error: boom\n    at x' },
      { t: 'fault', message: 'other' },
      { t: 'fault', message: 'boom', stack: 'Error: boom\n    at x' }
    ])
  })

  it('wait for the next app to connect when none is there', () => {
    server.fault('while closed', undefined, 0)
    const sock = hello()
    expect(received(sock).filter((m) => m.t === 'fault')).toEqual([{ t: 'fault', message: 'while closed' }])
    const again = hello()
    expect(received(again).filter((m) => m.t === 'fault')).toEqual([])
  })
})
