import { randomUUID } from 'node:crypto'
import type { AgentMessage, Session } from '@shared/types'
import { agentOf } from './handoff'

const AFTER_SEND_MS = 1500

export interface AgentBusDeps {
  session: (id: string) => Session | undefined
  deliver: (to: string, messages: AgentMessage[]) => void
}

export class AgentBus {
  private inbox = new Map<string, AgentMessage[]>()
  private waiters = new Map<string, Set<() => void>>()
  private waiting = new Set<string>()
  private lastSender = new Map<string, string>()
  private lastSentAt = new Map<string, number>()
  private retry = new Map<string, NodeJS.Timeout>()

  constructor(private readonly deps: AgentBusDeps) {}

  post(from: string, to: string, text: string): AgentMessage {
    const m: AgentMessage = { id: randomUUID(), ts: Date.now(), from, to, text }
    const list = this.inbox.get(to) ?? []
    list.push(m)
    this.inbox.set(to, list)
    this.wake(to)
    this.tryDeliver(to)
    return m
  }

  take(sessionId: string): AgentMessage[] {
    const list = this.inbox.get(sessionId) ?? []
    this.inbox.delete(sessionId)
    return list
  }

  pending(sessionId: string): number {
    return this.inbox.get(sessionId)?.length ?? 0
  }

  noteSend(from: string, to: string): void {
    this.lastSender.set(to, from)
    this.lastSentAt.set(to, Date.now())
  }

  replyTarget(sessionId: string): string | undefined {
    return this.lastSender.get(sessionId)
  }

  sentAt(sessionId: string): number | undefined {
    return this.lastSentAt.get(sessionId)
  }

  tryDeliver(to: string): void {
    if (!this.pending(to) || this.waiting.has(to)) return
    const s = this.deps.session(to)
    if (!s || !s.alive || agentOf(s) === 'shell') return
    if (s.status !== 'idle' && s.status !== 'done') return
    const sent = this.lastSentAt.get(to)
    const since = sent ? Date.now() - sent : Infinity
    if (since < AFTER_SEND_MS) {
      if (!this.retry.has(to)) {
        this.retry.set(
          to,
          setTimeout(() => {
            this.retry.delete(to)
            this.tryDeliver(to)
          }, AFTER_SEND_MS - since + 50)
        )
      }
      return
    }
    const messages = this.take(to)
    const last = messages[messages.length - 1]
    this.noteSend(last.from, to)
    this.deps.deliver(to, messages)
  }

  setWaiting(sessionId: string, on: boolean): void {
    if (on) this.waiting.add(sessionId)
    else {
      this.waiting.delete(sessionId)
      this.tryDeliver(sessionId)
    }
  }

  isWaiting(sessionId: string): boolean {
    return this.waiting.has(sessionId)
  }

  waitFor(keys: string[], ms: number): Promise<boolean> {
    return new Promise((resolve) => {
      let done = false
      const finish = (woken: boolean): void => {
        if (done) return
        done = true
        clearTimeout(timer)
        for (const k of keys) this.waiters.get(k)?.delete(finish1)
        resolve(woken)
      }
      const finish1 = (): void => finish(true)
      const timer = setTimeout(() => finish(false), ms)
      for (const k of keys) {
        const set = this.waiters.get(k) ?? new Set()
        set.add(finish1)
        this.waiters.set(k, set)
      }
    })
  }

  wake(key: string): void {
    const set = this.waiters.get(key)
    if (!set) return
    this.waiters.delete(key)
    for (const fn of set) fn()
  }

  forget(sessionId: string): void {
    this.inbox.delete(sessionId)
    this.waiting.delete(sessionId)
    this.lastSender.delete(sessionId)
    this.lastSentAt.delete(sessionId)
    const t = this.retry.get(sessionId)
    if (t) clearTimeout(t)
    this.retry.delete(sessionId)
    this.wake(sessionId)
  }
}
