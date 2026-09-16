/**
 * Fitting a terminal to its card reflows its text and resizes the program behind it, so it is
 * held off while the layout is in motion: a pane travelling to a new place, the sidebar sliding
 * shut. Several of those can overlap, which is why this counts rather than flips a switch, and
 * why it lets go by itself after a while. A hold that is never released is a terminal that never
 * matches its card again, which is a program drawing at the wrong width until someone drags
 * something.
 */
export class FitHold {
  private held = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private onRelease: () => void
  private maxMs: number

  constructor(onRelease: () => void, maxMs = 1500) {
    this.onRelease = onRelease
    this.maxMs = maxMs
  }

  get isHeld(): boolean {
    return this.held > 0
  }

  hold(): void {
    this.held++
    if (this.timer) clearTimeout(this.timer)
    // However many holds are outstanding, none of them may outlast this.
    this.timer = setTimeout(() => this.releaseAll(), this.maxMs)
  }

  /** One hold let go; fitting resumes when the last one has. */
  release(): void {
    if (this.held === 0) return
    this.held--
    if (this.held === 0) this.releaseAll()
  }

  private releaseAll(): void {
    this.held = 0
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.onRelease()
  }
}
