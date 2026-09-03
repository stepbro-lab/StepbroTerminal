import type { CreateSessionOpts, Session } from './types'

export type ClientMsg =
  | { t: 'hello'; version: string }
  | { t: 'list' }
  | { t: 'new'; opts: CreateSessionOpts; reqId?: string }
  | { t: 'attach'; id: string }
  | { t: 'detach'; id: string }
  | { t: 'input'; id: string }
  | { t: 'resize'; id: string; cols: number; rows: number }
  | { t: 'kill'; id: string }
  | { t: 'close'; id: string }
  | { t: 'restart'; id: string }
  | { t: 'rename'; id: string; title: string }
  | { t: 'pin'; id: string; pinned: boolean }
  | { t: 'viewed'; id: string }
  | { t: 'ack'; id: string; bytes: number }
  | { t: 'shutdown' }

export type HostMsg =
  | { t: 'hello'; version: string; pid: number }
  | { t: 'sessions'; sessions: Session[] }
  | { t: 'session'; session: Session }
  | { t: 'created'; session: Session; reqId?: string }
  | { t: 'removed'; id: string }
  | { t: 'output'; id: string }
  | { t: 'replay'; id: string }
  | { t: 'clear'; id: string }
  | { t: 'exit'; id: string; code: number }
  | { t: 'error'; message: string; id?: string; reqId?: string }

const HEADER = 8
const EMPTY = new Uint8Array(0)

/** Frame layout: [u32 jsonLen][u32 binLen][json][bin] (big endian). */
export function encodeFrame(msg: object, bin?: Uint8Array): Buffer {
  const json = Buffer.from(JSON.stringify(msg), 'utf8')
  const binLen = bin ? bin.byteLength : 0
  const out = Buffer.allocUnsafe(HEADER + json.length + binLen)
  out.writeUInt32BE(json.length, 0)
  out.writeUInt32BE(binLen, 4)
  json.copy(out, HEADER)
  if (bin && binLen) out.set(bin, HEADER + json.length)
  return out
}

export class FrameParser {
  private acc: Buffer = Buffer.alloc(0)
  onFrame: (msg: any, bin: Uint8Array) => void = () => {}

  push(chunk: Buffer): void {
    this.acc = this.acc.length ? Buffer.concat([this.acc, chunk]) : chunk
    for (;;) {
      if (this.acc.length < HEADER) return
      const jsonLen = this.acc.readUInt32BE(0)
      const binLen = this.acc.readUInt32BE(4)
      const total = HEADER + jsonLen + binLen
      if (this.acc.length < total) return
      const json = this.acc.subarray(HEADER, HEADER + jsonLen).toString('utf8')
      const bin = binLen ? new Uint8Array(this.acc.subarray(HEADER + jsonLen, total)) : EMPTY
      this.acc = this.acc.subarray(total)
      let msg: unknown
      try {
        msg = JSON.parse(json)
      } catch {
        continue
      }
      this.onFrame(msg, bin)
    }
  }
}
