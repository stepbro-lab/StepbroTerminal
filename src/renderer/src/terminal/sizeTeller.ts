export class SizeTeller {
  private timers = new Map<string, ReturnType<typeof setTimeout>>()
  private waiting = new Set<string>()
  private gestures = 0
  private gestureTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly tell: (id: string) => void,
    private readonly settleMs = 150,
    private readonly gestureMaxMs = 60_000
  ) {}

  changed(id: string): void {
    const t = this.timers.get(id)
    if (t) clearTimeout(t)
    this.timers.set(
      id,
      setTimeout(() => {
        this.timers.delete(id)
        if (this.gestures > 0) this.waiting.add(id)
        else this.tell(id)
      }, this.settleMs)
    )
  }

  beginGesture(): void {
    this.gestures++
    if (this.gestureTimer) clearTimeout(this.gestureTimer)
    this.gestureTimer = setTimeout(() => this.endAll(), this.gestureMaxMs)
  }

  endGesture(): void {
    if (this.gestures === 0) return
    this.gestures--
    if (this.gestures === 0) this.endAll()
  }

  forget(id: string): void {
    const t = this.timers.get(id)
    if (t) clearTimeout(t)
    this.timers.delete(id)
    this.waiting.delete(id)
  }

  private endAll(): void {
    this.gestures = 0
    if (this.gestureTimer) clearTimeout(this.gestureTimer)
    this.gestureTimer = null
    const ids = [...this.waiting]
    this.waiting.clear()
    for (const id of ids) this.tell(id)
  }
}
