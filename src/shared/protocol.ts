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
  | { t: 'archive'; id: string; archived: boolean }
  | { t: 'reorder'; ids: string[] }
  | { t: 'viewed'; id: string }
  | { t: 'ack'; id: string; bytes: number }
  | { t: 'notes:list' }
  | { t: 'notes:add'; text: string }
  | { t: 'notes:update'; id: string; text?: string; done?: boolean }
  | { t: 'notes:delete'; id: string }
  | { t: 'stats'; reqId: string }
  | { t: 'browser:result'; reqId: string; ok: boolean; result?: BrowserResult; error?: string }
  | { t: 'topito'; on: boolean }
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
  | { t: 'notes'; notes: Note[]; added?: Note }
  | { t: 'handoff'; handoff: Handoff }
  | { t: 'topito'; say: TopitoSay }
  | { t: 'stats'; reqId: string; stats: HostStats }
  | { t: 'browser'; reqId: string; sessionId: string; op: BrowserOp }
  | { t: 'workspaces'; reqId: string; op: WorkspaceOp }
  | { t: 'error'; message: string; id?: string; reqId?: string }

const HEADER = 8
export const MAX_FRAME = 256 * 1024 * 1024
const EMPTY = new Uint8Array(0)

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
  onOversize: () => void = () => {}

  push(chunk: Buffer): void {
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
        if (this.lengths.json + this.lengths.bin > MAX_FRAME) {
          this.chunks = []
          this.head = 0
          this.offset = 0
          this.available = 0
          this.lengths = undefined
          this.onOversize()
          return
        }
      }
      const { json: jsonLen, bin: binLen } = this.lengths
      if (this.available < jsonLen + binLen) return
      const json = this.read(jsonLen).toString('utf8')
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

  private read(size: number, own = false): Buffer {
    const first = this.chunks[this.head]
    const contiguous = first && first.length - this.offset >= size
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
