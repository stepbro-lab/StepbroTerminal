/**
 * The folded sidebar comes out for a look when the pointer reaches the window's left edge, the way
 * Arc and Zen do it. What counts as reaching it, and as leaving it again.
 */

/** The strip along the left edge that brings it out: thin, so working near the edge does not. */
export const PEEK_BAND_PX = 10
/** How long the pointer rests in the strip first: enough to tell a visit from passing through. */
export const PEEK_DWELL_MS = 100
/** How long the pointer may be off the sidebar before it goes back: a brush past its edge is not leaving. */
export const PEEK_LINGER_MS = 320
/** Above this the left edge belongs to the window's buttons and the top bar, not to the sidebar. */
export const PEEK_TOP_GUARD_PX = 44
/** How far past the sidebar's edge the pointer still counts as on it. */
const SLACK_PX = 12

/** The pointer is in the strip, below the window's buttons, with no button held (that is a selection). */
export function atLeftEdge(x: number, y: number, buttons: number): boolean {
  return x <= PEEK_BAND_PX && y >= PEEK_TOP_GUARD_PX && buttons === 0
}

/**
 * The pointer left the window across its left edge, below the buttons. A window rarely sits at the
 * screen's edge, so the hand overshoots the strip; that overshoot is the clearest sign of all.
 */
export function leftAcrossLeftEdge(x: number, y: number): boolean {
  return x <= 0 && y >= PEEK_TOP_GUARD_PX
}

/** The pointer is on the sidebar, or close enough to its edge to still be. */
export function onPanel(x: number, y: number, r: { left: number; top: number; right: number; bottom: number }): boolean {
  return x >= r.left - SLACK_PX && x <= r.right + SLACK_PX && y >= r.top - SLACK_PX && y <= r.bottom + SLACK_PX
}

export interface PeekDeps {
  isOpen: () => boolean
  setOpen: (open: boolean) => void
  /** Where the sidebar is while it is out; null while it is not. */
  panel: () => { left: number; top: number; right: number; bottom: number } | null
  /** Something keeps it out whatever the pointer does: a menu from it, a field in it being typed into. */
  held: () => boolean
}

/**
 * When the folded sidebar comes out and goes back, fed with what the pointer and keys do. Kept
 * apart from the page so every case can be played out step by step with a clock of its own.
 */
export class PeekController {
  private dwell: ReturnType<typeof setTimeout> | undefined
  private linger: ReturnType<typeof setTimeout> | undefined
  private inStrip = false
  /** Off until the pointer has been away from the edge, after the sidebar went back with it there. */
  private armed = true
  private dragging = false
  private last = { x: -1, y: -1 }

  constructor(private readonly d: PeekDeps) {}

  private onIt(): boolean {
    const r = this.d.panel()
    return !!r && onPanel(this.last.x, this.last.y, r)
  }
  private held(): boolean {
    return this.dragging || this.d.held()
  }
  private stayOut(): void {
    clearTimeout(this.linger)
    this.linger = undefined
  }
  private comeOut(): void {
    clearTimeout(this.dwell)
    this.stayOut()
    this.d.setOpen(true)
  }
  goBack(): void {
    clearTimeout(this.dwell)
    this.stayOut()
    this.inStrip = false
    this.armed = false
    if (this.d.isOpen()) this.d.setOpen(false)
  }
  private goBackSoon(): void {
    if (this.linger) return
    this.linger = setTimeout(() => {
      this.linger = undefined
      if (!this.held() && !this.onIt()) this.goBack()
    }, PEEK_LINGER_MS)
  }

  move(x: number, y: number, buttons: number): void {
    this.last = { x, y }
    if (this.d.isOpen()) {
      if (this.onIt() || this.held()) this.stayOut()
      else this.goBackSoon()
      return
    }
    if (!atLeftEdge(x, y, buttons)) {
      this.armed = true
      if (this.inStrip) {
        this.inStrip = false
        clearTimeout(this.dwell)
      }
      return
    }
    if (this.armed && !this.inStrip) {
      this.inStrip = true
      this.dwell = setTimeout(() => this.comeOut(), PEEK_DWELL_MS)
    }
  }

  /** The pointer left the window. */
  leave(x: number, y: number, buttons: number): void {
    clearTimeout(this.dwell)
    this.inStrip = false
    const acrossLeft = leftAcrossLeftEdge(x, y)
    if (this.d.isOpen()) {
      // Off the window past the sidebar's own edge, still reaching for it; anywhere else, leaving.
      if (acrossLeft) this.stayOut()
      else this.goBackSoon()
      return
    }
    if (this.armed && acrossLeft && buttons === 0) this.comeOut()
  }

  /** A press somewhere: on the sidebar or a menu from it, nothing; anywhere else, it goes back. */
  press(onItOrItsMenu: boolean): void {
    if (this.d.isOpen() && !onItOrItsMenu) this.goBack()
  }

  /** A key: Escape sends it back, and so does typing anywhere but in it. Not while a menu is up. */
  key(escape: boolean, inIt: boolean, menuUp: boolean): void {
    if (!this.d.isOpen() || menuUp) return
    if (escape || !inIt) this.goBack()
  }

  /** The window lost focus. */
  blur(): void {
    if (this.d.isOpen() && !this.held()) this.goBack()
  }

  dragStart(fromIt: boolean): void {
    if (this.d.isOpen() && fromIt) this.dragging = true
  }
  dragEnd(): void {
    if (!this.dragging) return
    this.dragging = false
    this.goBack()
  }

  /** A menu from it closed: decide again from where the pointer is. */
  menuClosed(): void {
    if (this.d.isOpen() && !this.onIt()) this.goBackSoon()
  }

  dispose(): void {
    clearTimeout(this.dwell)
    clearTimeout(this.linger)
  }
}
