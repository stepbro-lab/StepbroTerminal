import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import net from 'node:net'
import { encodeFrame } from '@shared/protocol'
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
describe('what an agent asks of the window', () => {
  it('fails at once when the window goes away, rather than when its time runs out', async () => {
    const sock = await attach()
    const asked = server.browser('s', { kind: 'screenshot' })
    const failed = expect(asked).rejects.toThrow(/window closed/)
    sock.destroy()
    await failed
  })
})

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
