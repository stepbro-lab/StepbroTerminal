import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import net from 'node:net'
import { encodeFrame, FrameParser } from '@shared/protocol'
import type { HostInfo } from '@shared/types'
import { HostClient } from './HostClient'

class Socket extends EventEmitter {
  destroyed = false
  write = vi.fn(() => true)
  setNoDelay(): void {}
  destroy(): void { this.destroyed = true; this.emit('close') }
}
let client: HostClient
let sock: Socket
beforeEach(async () => {
  vi.useFakeTimers()
  sock = new Socket()
  vi.spyOn(net, 'connect').mockReturnValue(sock as unknown as net.Socket)
  client = new HostClient()
  const connected = client.connect({ socketPath: 'unused' } as HostInfo, 'test')
  sock.emit('connect')
  await connected
})
afterEach(() => { client.disconnect(); vi.useRealTimers(); vi.restoreAllMocks() })
describe('host request lifecycle', () => {
  it('clears the timeout when a request succeeds', async () => {
    const parser = new FrameParser()
    let reqId = ''
    parser.onFrame = (msg) => { reqId = msg.reqId }
    sock.write.mockImplementation(((data: Buffer) => { parser.push(data); return true }) as any)
    const result = client.stats()
    expect(vi.getTimerCount()).toBe(1)
    sock.emit('data', encodeFrame({ t: 'stats', reqId, stats: { pid: 99 } }))
    await expect(result).resolves.toEqual({ pid: 99 })
    expect(vi.getTimerCount()).toBe(0)
  })
  it('rejects immediately and removes timeouts when explicitly disconnected', async () => {
    const result = client.stats()
    const rejected = expect(result).rejects.toThrow('host disconnected')
    client.disconnect()
    await rejected
    expect(vi.getTimerCount()).toBe(0)
  })
})
