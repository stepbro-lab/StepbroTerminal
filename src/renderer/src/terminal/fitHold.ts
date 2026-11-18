export class FitHold {
  private held = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private until = 0
  private onRelease: () => void
  private maxMs: number

  constructor(onRelease: () => void, maxMs = 1500) {
    this.onRelease = onRelease
    this.maxMs = maxMs
  }

  get isHeld(): boolean {
    return this.held > 0
  }

  hold(maxMs = this.maxMs): void {
    this.held++
    const until = Date.now() + maxMs
    if (this.timer && until <= this.until) return
    if (this.timer) clearTimeout(this.timer)
    this.until = until
    this.timer = setTimeout(() => this.releaseAll(), maxMs)
  }

  release(): void {
    if (this.held === 0) return
    this.held--
    if (this.held === 0) this.releaseAll()
  }

  private releaseAll(): void {
    this.held = 0
    this.until = 0
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.onRelease()
  }
}
