import type { BrowserOp, BrowserResult, CreateSessionOpts, PromptRecord, Session, Note, Handoff, HostStats } from './types'

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
  /** Put a session away (its process ends) or bring it back, exited and ready to restart. */
  | { t: 'archive'; id: string; archived: boolean }
  /** The sessions of one project in the order the sidebar should show them. */
  | { t: 'reorder'; ids: string[] }
  | { t: 'viewed'; id: string }
  | { t: 'ack'; id: string; bytes: number }
  | { t: 'notes:list' }
  | { t: 'notes:add'; text: string }
  | { t: 'notes:update'; id: string; text?: string; done?: boolean }
  | { t: 'notes:delete'; id: string }
  /** What the host and its sessions use right now; answered with `stats` carrying the same reqId. */
  | { t: 'stats'; reqId: string }
  /** The app's answer to a `browser` request: what the preview pane did, or why it could not. */
  | { t: 'browser:result'; reqId: string; ok: boolean; result?: BrowserResult; error?: string }
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
  | { t: 'prompt'; prompt: PromptRecord }
  /** The whole list after any change; `added` is set when an agent just saved one. */
  | { t: 'notes'; notes: Note[]; added?: Note }
  /** One agent typed text into another session. */
  | { t: 'handoff'; handoff: Handoff }
  | { t: 'stats'; reqId: string; stats: HostStats }
  /** An agent asks, through the MCP server, for something to happen in the preview pane beside its session. */
  | { t: 'browser'; reqId: string; sessionId: string; op: BrowserOp }
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
