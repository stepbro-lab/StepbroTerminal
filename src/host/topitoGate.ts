export const TOPITO_GAP_MS = 20_000

export class TopitoGate {
  private last = new Map<string, number>()

  constructor(private gap = TOPITO_GAP_MS) {}

  take(sessionId: string, now = Date.now()): number {
    const at = this.last.get(sessionId)
    if (at !== undefined && now - at < this.gap) return this.gap - (now - at)
    this.last.set(sessionId, now)
    return 0
  }
}
