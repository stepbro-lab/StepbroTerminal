import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { encodeFrame, FrameParser } from '@shared/protocol'
import { workingSessions } from './launcher'

let server: net.Server | undefined
afterEach(() => server?.close())

function hostWith(sessions: Array<{ alive: boolean; status: string }>): Promise<string> {
  const socketPath = process.platform === 'win32' ? `\\\\.\\pipe\\step-test-${process.pid}-${Date.now()}` : path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'step-l-')), 'h.sock')
  server = net.createServer((sock) => {
    const parser = new FrameParser()
    parser.onFrame = (msg) => {
      if (msg.t === 'hello') sock.write(Buffer.concat([encodeFrame({ t: 'hello', version: 'old', pid: 1 }), encodeFrame({ t: 'sessions', sessions })]))
    }
    sock.on('data', (d) => parser.push(d))
  })
  return new Promise((resolve) => server!.listen(socketPath, () => resolve(socketPath)))
}

describe('a host left from another version', () => {
  it('says how many of its sessions are in the middle of something', async () => {
    const at = await hostWith([
      { alive: true, status: 'working' },
      { alive: true, status: 'attention' },
      { alive: true, status: 'idle' },
      { alive: false, status: 'working' }
    ])
    expect(await workingSessions(at)).toBe(2)
  })

  it('counts none when nothing answers', async () => {
    expect(await workingSessions(path.join(os.tmpdir(), 'step-nobody-here.sock'), 200)).toBe(0)
  })
})
