import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

/**
 * The Discord app's local RPC socket, as much of it as a presence needs: say hello as an
 * application, set the activity, answer pings. Each message is an 8-byte header, the opcode and
 * the length as little-endian 32-bit integers, then that many bytes of JSON.
 */
export const OP = { handshake: 0, frame: 1, close: 2, ping: 3, pong: 4 } as const

export function encode(op: number, payload: unknown): Buffer {
  const json = Buffer.from(JSON.stringify(payload), 'utf8')
  const head = Buffer.alloc(8)
  head.writeInt32LE(op, 0)
  head.writeInt32LE(json.length, 4)
  return Buffer.concat([head, json])
}

/** Takes the socket's bytes as they come and hands back each whole message. */
export class FrameReader {
  private buf: Buffer = Buffer.alloc(0)

  push(chunk: Buffer): Array<{ op: number; data: any }> {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk
    const out: Array<{ op: number; data: any }> = []
    while (this.buf.length >= 8) {
      const op = this.buf.readInt32LE(0)
      const len = this.buf.readInt32LE(4)
      if (this.buf.length < 8 + len) break
      const body = this.buf.subarray(8, 8 + len).toString('utf8')
      this.buf = this.buf.subarray(8 + len)
      let data: any = null
      try {
        data = JSON.parse(body)
      } catch {
        data = null
      }
      out.push({ op, data })
    }
    return out
  }
}

/**
 * Where Discord listens, in the order it is looked for: a named pipe on Windows; elsewhere a socket
 * in the runtime or temporary folder, or inside the Flatpak or Snap sandbox's own folder there.
 * The first Discord running takes 0, a second one (Canary, PTB) the next number.
 */
export function socketPaths(platform: NodeJS.Platform = process.platform, env: NodeJS.ProcessEnv = process.env): string[] {
  const ids = Array.from({ length: 10 }, (_, i) => i)
  if (platform === 'win32') return ids.map((i) => `\\\\?\\pipe\\discord-ipc-${i}`)
  const bases = [env['XDG_RUNTIME_DIR'], env['TMPDIR'], env['TMP'], env['TEMP'], os.tmpdir(), '/tmp'].filter((b): b is string => !!b).map((b) => path.resolve(b))
  const dirs: string[] = []
  for (const b of bases) {
    for (const d of [b, path.join(b, 'app', 'com.discordapp.Discord'), path.join(b, 'snap.discord')]) if (!dirs.includes(d)) dirs.push(d)
  }
  return ids.flatMap((i) => dirs.map((d) => path.join(d, `discord-ipc-${i}`)))
}

/** An open link to Discord, ready for activities once it said it was. */
export interface DiscordLink {
  setActivity(activity: Record<string, unknown> | null): void
  close(): void
  onClose(fn: (reason: string) => void): void
  /** What Discord said when it turned an activity down. */
  onError(fn: (message: string) => void): void
}

function open(file: string): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const sock = net.connect(file)
    sock.once('connect', () => {
      sock.removeAllListeners('error')
      resolve(sock)
    })
    sock.once('error', reject)
  })
}

/**
 * Connects to the Discord app as `clientId`, trying each place it may listen. Fails when Discord is
 * not running or does not know the application, which is the usual case and not an error.
 */
export async function connectDiscord(clientId: string, paths = socketPaths(), timeoutMs = 5000): Promise<DiscordLink> {
  let sock: net.Socket | null = null
  for (const p of paths) {
    try {
      sock = await open(p)
      break
    } catch {
      /* not this one */
    }
  }
  if (!sock) throw new Error('Discord is not running')
  const s = sock
  const reader = new FrameReader()
  const closers: Array<(reason: string) => void> = []
  const refusals: Array<(message: string) => void> = []
  let closed = false
  const finish = (reason: string): void => {
    if (closed) return
    closed = true
    s.destroy()
    for (const fn of closers) fn(reason)
  }

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      finish('no answer')
      reject(new Error('Discord did not answer'))
    }, timeoutMs)
    s.on('data', (chunk: Buffer) => {
      for (const { op, data } of reader.push(chunk)) {
        if (op === OP.ping) s.write(encode(OP.pong, data))
        else if (op === OP.close) {
          clearTimeout(timer)
          const reason = String(data?.message ?? 'closed')
          finish(reason)
          reject(new Error(reason))
        } else if (op === OP.frame && data?.cmd === 'DISPATCH' && data?.evt === 'READY') {
          clearTimeout(timer)
          resolve()
        } else if (op === OP.frame && data?.evt === 'ERROR') {
          const message = String(data?.data?.message ?? 'error')
          for (const fn of refusals) fn(message)
        }
      }
    })
    s.on('error', (e) => {
      clearTimeout(timer)
      finish(e.message)
      reject(e)
    })
    s.on('close', () => {
      clearTimeout(timer)
      finish('closed')
      reject(new Error('closed'))
    })
    s.write(encode(OP.handshake, { v: 1, client_id: clientId }))
  })

  return {
    setActivity(activity) {
      if (closed) return
      s.write(encode(OP.frame, { cmd: 'SET_ACTIVITY', args: { pid: process.pid, activity: activity ?? undefined }, nonce: randomUUID() }))
    },
    close() {
      if (closed) return
      // Leaving clears the activity on Discord's side too.
      s.end()
      finish('closed here')
    },
    onClose(fn) {
      closers.push(fn)
    },
    onError(fn) {
      refusals.push(fn)
    }
  }
}
