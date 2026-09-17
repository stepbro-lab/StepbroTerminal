/** How long after passing on a message Topito waits before he takes another from the same session. */
export const TOPITO_GAP_MS = 20_000

/**
 * Keeps an agent from talking over Topito. He comes out at the corner of the person's terminal, and
 * a session that had him out every few seconds would turn a nudge into noise; once a session has
 * spoken through him, it waits a little before it can again. Other sessions are not held up.
 */
export class TopitoGate {
  private last = new Map<string, number>()

  constructor(private gap = TOPITO_GAP_MS) {}

  /** 0 when the session may speak now, which counts as speaking; otherwise how many ms are left to wait. */
  take(sessionId: string, now = Date.now()): number {
    const at = this.last.get(sessionId)
    if (at !== undefined && now - at < this.gap) return this.gap - (now - at)
    this.last.set(sessionId, now)
    return 0
  }
}
