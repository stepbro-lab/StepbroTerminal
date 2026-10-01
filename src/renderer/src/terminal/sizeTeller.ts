/**
 * When the program behind a terminal is told the terminal's new size. Every resize makes it redraw,
 * and an agent that gets dozens in a row (an edge dragged for a few seconds, a window pulled wider)
 * redraws over its own half-finished frames: Claude Code was left with blank holes in its screen.
 * So a size is told once it has held still for a moment, and while a person is dragging something
 * that changes it, not until they let go. The terminal itself still shows every size at once.
 */
export class SizeTeller {
  private timers = new Map<string, ReturnType<typeof setTimeout>>()
  /** Sizes that settled while a drag was going on, told when it ends. */
  private waiting = new Set<string>()
  private gestures = 0
  private gestureTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly tell: (id: string) => void,
    private readonly settleMs = 150,
    /** A drag that never says it ended must not keep sizes back for ever. */
    private readonly gestureMaxMs = 60_000
  ) {}

  /** The terminal's size changed, or may have: tell it once it holds still. */
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

  /** A person started dragging something that resizes terminals. */
  beginGesture(): void {
    this.gestures++
    if (this.gestureTimer) clearTimeout(this.gestureTimer)
    this.gestureTimer = setTimeout(() => this.endAll(), this.gestureMaxMs)
  }

  /** They let go: what settled meanwhile is told now, and what is still moving once it settles. */
  endGesture(): void {
    if (this.gestures === 0) return
    this.gestures--
    if (this.gestures === 0) this.endAll()
  }

  /** The terminal is gone: nothing more to tell about it. */
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
