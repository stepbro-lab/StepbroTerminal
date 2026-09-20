interface Pausable {
  pause(): void
  resume(): void
}

/** Every consumer must catch up before the PTY can resume. */
export class OutputPressure {
  private reasons = new Set<'client' | 'screen' | 'log' | 'shutdown'>()
  private target?: Pausable
  private paused = false

  connect(target?: Pausable): void {
    this.target = target
    this.paused = false
    this.update()
  }

  set(reason: 'client' | 'screen' | 'log' | 'shutdown', paused: boolean): void {
    if (paused) this.reasons.add(reason)
    else this.reasons.delete(reason)
    this.update()
  }

  private update(): void {
    const paused = this.reasons.size > 0
    if (!this.target || paused === this.paused) return
    try {
      if (paused) this.target.pause()
      else this.target.resume()
      this.paused = paused
    } catch {
      /* The PTY may have exited while a consumer was draining. */
    }
  }
}
