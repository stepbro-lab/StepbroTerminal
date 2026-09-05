import { randomUUID } from 'node:crypto'
import type { AgentMessage } from '@shared/types'

/**
 * How agents talk to each other without touching each other's terminals. Every session has an
 * inbox; `report` drops a message in one, `wait` sleeps until something lands in the caller's
 * inbox or a watched session changes state. What travels shows up where it belongs: in the
 * agents' own transcripts, as the tool calls they made.
 */
export class AgentBus {
  private inbox = new Map<string, AgentMessage[]>()
  private waiters = new Map<string, Set<() => void>>()
  /** Who last handed work to a session, so a report without a target goes back to them. */
  private lastSender = new Map<string, string>()
  private lastSentAt = new Map<string, number>()

  // ---- messages ----

  post(from: string, to: string, text: string): AgentMessage {
    const m: AgentMessage = { id: randomUUID(), ts: Date.now(), from, to, text }
    const list = this.inbox.get(to) ?? []
    list.push(m)
    this.inbox.set(to, list)
    this.wake(to)
    return m
  }

  /** Every message waiting for a session, removed from the inbox. */
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

  // ---- waiting ----

  /** Resolves true as soon as any of the keys is woken, false when the time runs out. */
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
    this.lastSender.delete(sessionId)
    this.lastSentAt.delete(sessionId)
    this.wake(sessionId)
  }
}
