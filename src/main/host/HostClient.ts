import { EventEmitter } from 'node:events'
import net from 'node:net'
import { randomUUID } from 'node:crypto'
import { encodeFrame, FrameParser, type ClientMsg, type HostMsg } from '@shared/protocol'
import type { CreateSessionOpts, HostInfo, HostStats, Session } from '@shared/types'

/**
 * Socket client for step-host. Events:
 * 'hello' (version, pid) · 'sessions' (Session[]) · 'session' (Session) · 'removed' (id)
 * 'output' (id, bytes) · 'replay' (id, bytes) · 'clear' (id) · 'exit' (id, code) · 'error' (msg) · 'disconnected'
 */
export class HostClient extends EventEmitter {
  private sock: net.Socket | null = null
  private parser = new FrameParser()
  private pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>()
  info: HostInfo | null = null

  get connected(): boolean {
    return !!this.sock && !this.sock.destroyed
  }

  connect(info: HostInfo, version: string): Promise<void> {
    this.disconnect()
    this.info = info
    return new Promise((resolve, reject) => {
      const s = net.connect(info.socketPath)
      this.sock = s
      s.setNoDelay?.(true)
      this.parser = new FrameParser()
      this.parser.onFrame = (msg, bin) => this.onFrame(msg as HostMsg, bin)
      s.once('connect', () => {
        this.send({ t: 'hello', version })
        resolve()
      })
      s.on('data', (d) => this.parser.push(d))
      s.on('error', (e) => {
        if (this.sock === s) this.emit('error', e.message)
        reject(e)
      })
      s.on('close', () => {
        if (this.sock !== s) return
        this.sock = null
        this.rejectPending()
        this.emit('disconnected')
      })
    })
  }

  disconnect(): void {
    const s = this.sock
    this.sock = null
    if (s) s.destroy()
    this.rejectPending()
  }

  private rejectPending(): void {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer)
      p.reject(new Error('host disconnected'))
    }
    this.pending.clear()
  }

  send(msg: ClientMsg, bin?: Uint8Array): void {
    if (!this.sock || this.sock.destroyed) return
    this.sock.write(encodeFrame(msg, bin))
  }

  create(opts: CreateSessionOpts): Promise<Session> {
    return this.request<Session>((reqId) => ({ t: 'new', opts, reqId }), 10_000)
  }

  /** What the host and its sessions use right now; the host samples processes, so allow it a moment. */
  stats(): Promise<HostStats> {
    return this.request<HostStats>((reqId) => ({ t: 'stats', reqId }), 15_000)
  }

  private request<T>(build: (reqId: string) => ClientMsg, timeoutMs: number): Promise<T> {
    const reqId = randomUUID()
    return new Promise<T>((resolve, reject) => {
      if (!this.connected) return reject(new Error('host not connected'))
      const timer = setTimeout(() => {
        if (this.pending.delete(reqId)) reject(new Error('host did not answer'))
      }, timeoutMs)
      this.pending.set(reqId, { resolve: resolve as (v: unknown) => void, reject, timer })
      this.send(build(reqId))
    })
  }

  private onFrame(msg: HostMsg, bin: Uint8Array): void {
    switch (msg.t) {
      case 'hello':
        this.emit('hello', msg.version, msg.pid)
        break
      case 'sessions':
        this.emit('sessions', msg.sessions)
        break
      case 'session':
        this.emit('session', msg.session)
        break
      case 'created': {
        const p = msg.reqId ? this.pending.get(msg.reqId) : undefined
        if (p && msg.reqId) {
          this.pending.delete(msg.reqId)
          clearTimeout(p.timer)
          p.resolve(msg.session)
        }
        this.emit('session', msg.session)
        break
      }
      case 'removed':
        this.emit('removed', msg.id)
        break
      case 'output':
        this.emit('output', msg.id, bin)
        break
      case 'replay':
        this.emit('replay', msg.id, bin)
        break
      case 'clear':
        this.emit('clear', msg.id)
        break
      case 'exit':
        this.emit('exit', msg.id, msg.code)
        break
      case 'prompt':
        this.emit('prompt', msg.prompt)
        break
      case 'notes':
        this.emit('notes', msg.notes, msg.added)
        break
      case 'handoff':
        this.emit('handoff', msg.handoff)
        break
      case 'topito':
        this.emit('topito', msg.say)
        break
      case 'stats': {
        const p = this.pending.get(msg.reqId)
        if (p) {
          this.pending.delete(msg.reqId)
          clearTimeout(p.timer)
          p.resolve(msg.stats)
        }
        break
      }
      case 'browser':
        this.emit('browser', msg.reqId, msg.sessionId, msg.op)
        break
      case 'error': {
        const p = msg.reqId ? this.pending.get(msg.reqId) : undefined
        if (p && msg.reqId) {
          this.pending.delete(msg.reqId)
          clearTimeout(p.timer)
          p.reject(new Error(msg.message))
        }
        this.emit('error', msg.message)
        break
      }
    }
  }
}
