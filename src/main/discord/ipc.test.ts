import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { FrameReader, OP, connectDiscord, encode, socketPaths } from './ipc'

describe('Discord frames', () => {
  it('are an opcode and a length, little-endian, then the JSON', () => {
    const f = encode(OP.handshake, { v: 1, client_id: '42' })
    expect(f.readInt32LE(0)).toBe(0)
    expect(f.readInt32LE(4)).toBe(f.length - 8)
    expect(JSON.parse(f.subarray(8).toString())).toEqual({ v: 1, client_id: '42' })
  })

  it('come out whole however the bytes arrive', () => {
    const r = new FrameReader()
    const two = Buffer.concat([encode(OP.frame, { a: 1 }), encode(OP.ping, { b: 'ñ' })])
    expect(r.push(two.subarray(0, 5))).toEqual([])
    expect(r.push(two.subarray(5, 20))).toEqual([{ op: 1, data: { a: 1 } }])
    expect(r.push(two.subarray(20))).toEqual([{ op: 3, data: { b: 'ñ' } }])
  })
})

describe('where Discord listens', () => {
  it('is a named pipe on Windows', () => {
    expect(socketPaths('win32', {})[0]).toBe('\\\\?\\pipe\\discord-ipc-0')
  })

  it('is the runtime folder first elsewhere, then Flatpak and Snap, for each number', () => {
    const p = socketPaths('linux', { XDG_RUNTIME_DIR: '/run/user/1000' })
    expect(p[0]).toBe('/run/user/1000/discord-ipc-0')
    expect(p).toContain('/run/user/1000/app/com.discordapp.Discord/discord-ipc-0')
    expect(p).toContain('/run/user/1000/snap.discord/discord-ipc-0')
    expect(p.indexOf('/run/user/1000/discord-ipc-0')).toBeLessThan(p.indexOf('/run/user/1000/discord-ipc-1'))
    // The same folder written two ways is looked in once.
    const q = socketPaths('darwin', { TMPDIR: '/var/folders/x/T/', TMP: '/var/folders/x/T' })
    expect(q.filter((x) => x === '/var/folders/x/T/discord-ipc-0')).toHaveLength(1)
  })
})

describe('connecting to Discord', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'step-discord-'))
  // Discord listens on a named pipe on Windows and on a socket file elsewhere; so does the stand-in.
  const at = (name: string) => (process.platform === 'win32' ? `\\\\?\\pipe\\step-test-${process.pid}-${name}` : path.join(dir, name))
  let server: net.Server | null = null
  afterEach(() => server?.close())

  /** A stand-in for the Discord app: answers the handshake, records what it is sent. */
  function fakeDiscord(file: string, knownId: string, got: Array<{ op: number; data: any }>): Promise<void> {
    server = net.createServer((sock) => {
      const r = new FrameReader()
      sock.on('data', (chunk) => {
        for (const m of r.push(chunk)) {
          got.push(m)
          if (m.op === OP.handshake) {
            if (m.data.client_id === knownId) sock.write(encode(OP.frame, { cmd: 'DISPATCH', evt: 'READY', data: { v: 1 } }))
            else sock.write(encode(OP.close, { code: 4000, message: 'Invalid Client ID' }))
          } else if (m.data?.args?.activity?.details === '') {
            sock.write(encode(OP.frame, { cmd: 'SET_ACTIVITY', evt: 'ERROR', data: { code: 4000, message: 'child "details" fails' }, nonce: m.data.nonce }))
          }
        }
      })
    })
    return new Promise((resolve) => server!.listen(file, resolve))
  }

  it('says hello as the application and then sets the activity', async () => {
    const file = at('discord-ipc-0')
    const got: Array<{ op: number; data: any }> = []
    await fakeDiscord(file, '123', got)
    const link = await connectDiscord('123', [at('missing'), file])
    link.setActivity({ details: 'Coding with Codex' })
    await new Promise((r) => setTimeout(r, 50))
    expect(got[0]).toEqual({ op: OP.handshake, data: { v: 1, client_id: '123' } })
    expect(got[1].data).toMatchObject({ cmd: 'SET_ACTIVITY', args: { pid: process.pid, activity: { details: 'Coding with Codex' } } })
    // An activity Discord turns down is reported, not dropped in silence.
    const refused: string[] = []
    link.onError((m) => refused.push(m))
    link.setActivity({ details: '' })
    await new Promise((r) => setTimeout(r, 50))
    expect(refused).toEqual(['child "details" fails'])
    link.close()
  })

  it('fails when Discord is not running, or does not know the application', async () => {
    await expect(connectDiscord('123', [at('nobody-here')])).rejects.toThrow('not running')
    const file = at('discord-ipc-1')
    await fakeDiscord(file, '123', [])
    await expect(connectDiscord('999', [file])).rejects.toThrow('Invalid Client ID')
  })
})
