import net from 'node:net'
import fs from 'node:fs'
import { encodeFrame, FrameParser, type ClientMsg, type HostMsg } from '@shared/protocol'
import type { SessionManager } from './SessionManager'
import type { NoteStore } from './NoteStore'
import type { Note } from '@shared/types'
import { SizeOwners } from './sizeOwners'
import { log } from './log'

interface Client {
  sock: net.Socket
  parser: FrameParser
  attached: Set<string>
  unacked: Map<string, number>
  pending: Map<string, Buffer[]>
  flushTimer?: NodeJS.Timeout
}

const FLUSH_MS = 8
const PAUSE_ABOVE = 1024 * 1024
const RESUME_BELOW = 256 * 1024

/** Local socket server: fans out session events and output to attached clients with flow control. */
export class HostServer {
  private server: net.Server
  private clients = new Set<Client>()
  private owners = new SizeOwners<Client>()
  onClientsChange: () => void = () => {}
  onShutdown: () => void = () => {}

  constructor(
    private readonly sm: SessionManager,
    private readonly notes: NoteStore,
    private readonly socketPath: string,
    private readonly version: string
  ) {
    this.server = net.createServer((sock) => this.accept(sock))
    sm.on('session', (s) => this.broadcast({ t: 'session', session: s }))
    sm.on('removed', (id) => {
      for (const c of this.clients) {
        c.attached.delete(id)
        c.unacked.delete(id)
        c.pending.delete(id)
      }
      this.owners.forget(id)
      this.broadcast({ t: 'removed', id })
    })
    sm.on('clear', (id) => this.broadcast({ t: 'clear', id }))
    sm.on('exit', (id, code) => this.broadcast({ t: 'exit', id, code }))
    sm.on('prompt', (prompt) => this.broadcast({ t: 'prompt', prompt }))
    sm.on('output', (id: string, bytes: Uint8Array) => this.queueOutput(id, bytes))
    notes.on('change', (list: Note[], added?: Note) => this.broadcast({ t: 'notes', notes: list, added }))
  }

  get clientCount(): number {
    return this.clients.size
  }

  async listen(): Promise<void> {
    if (process.platform !== 'win32') {
      // Remove a stale socket file if nobody answers on it.
      if (fs.existsSync(this.socketPath) && !(await probe(this.socketPath))) {
        try {
          fs.unlinkSync(this.socketPath)
        } catch {
          /* ignore */
        }
      }
    }
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject)
      this.server.listen(this.socketPath, () => {
        this.server.off('error', reject)
        this.server.on('error', (e) => log('socket server error', e))
        resolve()
      })
    })
  }

  close(): void {
    for (const c of this.clients) c.sock.destroy()
    this.server.close()
  }

  private accept(sock: net.Socket): void {
    const c: Client = { sock, parser: new FrameParser(), attached: new Set(), unacked: new Map(), pending: new Map() }
    this.clients.add(c)
    sock.setNoDelay?.(true)
    c.parser.onFrame = (msg, bin) => {
      try {
        this.dispatch(c, msg as ClientMsg, bin)
      } catch (e) {
        log('dispatch error', e)
        this.send(c, { t: 'error', message: String((e as Error)?.message ?? e) })
      }
    }
    sock.on('data', (d) => c.parser.push(d))
    const drop = (): void => {
      if (!this.clients.has(c)) return
      this.clients.delete(c)
      if (c.flushTimer) clearTimeout(c.flushTimer)
      for (const id of c.attached) {
        this.recheckFlow(id)
        this.letGo(c, id)
      }
      this.onClientsChange()
    }
    sock.on('close', drop)
    sock.on('error', (e) => {
      log('client socket error', e.message)
      drop()
    })
    this.onClientsChange()
  }

  private dispatch(c: Client, msg: ClientMsg, bin: Uint8Array): void {
    switch (msg.t) {
      case 'hello':
        this.send(c, { t: 'hello', version: this.version, pid: process.pid })
        this.send(c, { t: 'sessions', sessions: this.sm.list() })
        this.send(c, { t: 'notes', notes: this.notes.list() })
        break
      case 'list':
        this.send(c, { t: 'sessions', sessions: this.sm.list() })
        break
      case 'new': {
        const s = this.sm.create(msg.opts)
        this.send(c, { t: 'created', session: s, reqId: msg.reqId })
        break
      }
      case 'attach': {
        c.attached.add(msg.id)
        this.owners.claim(msg.id, c)
        void this.sm.snapshot(msg.id).then((snap) => {
          if (!c.attached.has(msg.id) || c.sock.destroyed) return
          c.unacked.set(msg.id, snap.byteLength)
          this.send(c, { t: 'replay', id: msg.id }, snap)
          this.recheckFlow(msg.id)
        })
        break
      }
      case 'detach':
        c.attached.delete(msg.id)
        c.unacked.delete(msg.id)
        c.pending.delete(msg.id)
        this.recheckFlow(msg.id)
        this.letGo(c, msg.id)
        break
      case 'input':
        this.sm.input(msg.id, bin)
        break
      case 'resize':
        // Only the client that got to the session first sizes it; see SizeOwners.
        this.owners.note(msg.id, c, { cols: msg.cols, rows: msg.rows })
        if (this.owners.owns(msg.id, c)) this.sm.resize(msg.id, msg.cols, msg.rows)
        break
      case 'kill':
        this.sm.kill(msg.id)
        break
      case 'close':
        this.sm.close(msg.id)
        break
      case 'restart':
        this.sm.restart(msg.id)
        break
      case 'rename':
        this.sm.rename(msg.id, msg.title)
        break
      case 'pin':
        this.sm.pin(msg.id, msg.pinned)
        break
      case 'viewed':
        this.sm.viewed(msg.id)
        break
      case 'ack': {
        const cur = c.unacked.get(msg.id) ?? 0
        c.unacked.set(msg.id, Math.max(0, cur - msg.bytes))
        this.recheckFlow(msg.id)
        break
      }
      case 'notes:list':
        this.send(c, { t: 'notes', notes: this.notes.list() })
        break
      case 'notes:add':
        this.notes.add(msg.text, { kind: 'user' })
        break
      case 'notes:update':
        this.notes.update(msg.id, { text: msg.text, done: msg.done })
        break
      case 'notes:delete':
        this.notes.remove(msg.id)
        break
      case 'shutdown':
        this.onShutdown()
        break
    }
  }

  /** `c` stopped looking at `id`; whoever inherits the session gets the size they asked for. */
  private letGo(c: Client, id: string): void {
    const others = [...this.clients].filter((o) => o !== c && o.attached.has(id))
    const size = this.owners.release(id, c, others)
    if (size) this.sm.resize(id, size.cols, size.rows)
  }

  private queueOutput(id: string, bytes: Uint8Array): void {
    for (const c of this.clients) {
      if (!c.attached.has(id)) continue
      let arr = c.pending.get(id)
      if (!arr) {
        arr = []
        c.pending.set(id, arr)
      }
      arr.push(Buffer.from(bytes))
      if (!c.flushTimer) c.flushTimer = setTimeout(() => this.flush(c), FLUSH_MS)
    }
  }

  private flush(c: Client): void {
    c.flushTimer = undefined
    for (const [id, chunks] of c.pending) {
      const data = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks)
      c.unacked.set(id, (c.unacked.get(id) ?? 0) + data.length)
      this.send(c, { t: 'output', id }, data)
      this.recheckFlow(id)
    }
    c.pending.clear()
  }

  /** Pause the PTY when any attached client is far behind; resume when everyone caught up. */
  private recheckFlow(id: string): void {
    let max = 0
    for (const c of this.clients) if (c.attached.has(id)) max = Math.max(max, c.unacked.get(id) ?? 0)
    if (max > PAUSE_ABOVE) this.sm.pause(id)
    else if (max < RESUME_BELOW) this.sm.resume(id)
  }

  private broadcast(msg: HostMsg): void {
    for (const c of this.clients) this.send(c, msg)
  }

  private send(c: Client, msg: HostMsg, bin?: Uint8Array): void {
    if (c.sock.destroyed) return
    c.sock.write(encodeFrame(msg, bin))
  }
}

function probe(socketPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.connect(socketPath)
    const done = (v: boolean): void => {
      s.destroy()
      resolve(v)
    }
    s.once('connect', () => done(true))
    s.once('error', () => done(false))
    setTimeout(() => done(false), 1000)
  })
}
