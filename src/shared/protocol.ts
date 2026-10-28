import type { BrowserOp, BrowserResult, CreateSessionOpts, PromptRecord, Session, Note, Handoff, HostStats, TopitoSay, WorkspaceOp, WorkspaceResult } from './types'

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
  /** Whether Topito is turned on in the app; the MCP server only offers agents his tool while he is. */
  | { t: 'topito'; on: boolean }
  /** The app's answer to a `workspaces` request: what came of it, or why it could not be done. */
  | { t: 'workspaces:result'; reqId: string; ok: boolean; result?: WorkspaceResult; error?: string }
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
  /** An agent asked Topito to tell the person something. */
  | { t: 'topito'; say: TopitoSay }
  | { t: 'stats'; reqId: string; stats: HostStats }
  /** An agent asks, through the MCP server, for something to happen in the preview pane beside its session. */
  | { t: 'browser'; reqId: string; sessionId: string; op: BrowserOp }
  /** An agent asks, through the MCP server, to read or change the saved workspaces, or to open one. */
  | { t: 'workspaces'; reqId: string; op: WorkspaceOp }
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
  private chunks: Buffer[] = []
  private head = 0
  private offset = 0
  private available = 0
  private lengths?: { json: number; bin: number }
  onFrame: (msg: any, bin: Uint8Array) => void = () => {}

  push(chunk: Buffer): void {
    // Common case: complete small frames already fit in this socket read. Avoid the queue.
    if (!this.available && !this.lengths) {
      let offset = 0
      while (chunk.length - offset >= HEADER) {
        const jsonLen = chunk.readUInt32BE(offset)
        const binLen = chunk.readUInt32BE(offset + 4)
        const end = offset + HEADER + jsonLen + binLen
        if (end > chunk.length) break
        const json = chunk.subarray(offset + HEADER, offset + HEADER + jsonLen).toString('utf8')
        const bin = binLen ? new Uint8Array(chunk.subarray(offset + HEADER + jsonLen, end)) : EMPTY
        offset = end
        let msg: unknown
        try { msg = JSON.parse(json) } catch { continue }
        this.onFrame(msg, bin)
      }
      if (offset === chunk.length) return
      chunk = chunk.subarray(offset)
    }
    if (chunk.length) {
      this.chunks.push(chunk)
      this.available += chunk.length
    }
    for (;;) {
      if (!this.lengths) {
        if (this.available < HEADER) return
        const header = this.read(HEADER)
        this.lengths = { json: header.readUInt32BE(0), bin: header.readUInt32BE(4) }
      }
      const { json: jsonLen, bin: binLen } = this.lengths
      if (this.available < jsonLen + binLen) return
      const json = this.read(jsonLen).toString('utf8')
      // Own the payload: listeners may retain it after the next push.
      const bin = binLen ? this.read(binLen, true) : EMPTY
      this.lengths = undefined
      let msg: unknown
      try {
        msg = JSON.parse(json)
      } catch {
        continue
      }
      this.onFrame(msg, bin)
    }
  }

  /** Consume each fragment once instead of copying the accumulated frame on every push. */
  private read(size: number, own = false): Buffer {
    const first = this.chunks[this.head]
    const contiguous = first && first.length - this.offset >= size
    // JSON/header can be views. Binary is copied exactly once, including fragmented payloads.
    const out = contiguous && !own ? first.subarray(this.offset, this.offset + size) : Buffer.allocUnsafe(size)
    let written = 0
    while (written < size) {
      const chunk = this.chunks[this.head]
      const n = Math.min(size - written, chunk.length - this.offset)
      if (!contiguous || own) chunk.copy(out, written, this.offset, this.offset + n)
      written += n
      this.offset += n
      if (this.offset === chunk.length) {
        this.head++
        this.offset = 0
      }
    }
    this.available -= size
    if (this.head === this.chunks.length) {
      this.chunks = []
      this.head = 0
    } else if (this.head > 1024 && this.head * 2 >= this.chunks.length) {
      this.chunks = this.chunks.slice(this.head)
      this.head = 0
    }
    return out
  }
}
