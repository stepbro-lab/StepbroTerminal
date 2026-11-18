export const PEEK_BAND_PX = 10
export const PEEK_DWELL_MS = 100
export const PEEK_LINGER_MS = 320
export const PEEK_TOP_GUARD_PX = 44
const SLACK_PX = 12

export function atLeftEdge(x: number, y: number, buttons: number): boolean {
  return x <= PEEK_BAND_PX && y >= PEEK_TOP_GUARD_PX && buttons === 0
}

export function leftAcrossLeftEdge(x: number, y: number): boolean {
  return x <= 0 && y >= PEEK_TOP_GUARD_PX
}

export function onPanel(x: number, y: number, r: { left: number; top: number; right: number; bottom: number }): boolean {
  return x >= r.left - SLACK_PX && x <= r.right + SLACK_PX && y >= r.top - SLACK_PX && y <= r.bottom + SLACK_PX
}

export interface PeekDeps {
  isOpen: () => boolean
  setOpen: (open: boolean) => void
  panel: () => { left: number; top: number; right: number; bottom: number } | null
  held: () => boolean
}

export class PeekController {
  private dwell: ReturnType<typeof setTimeout> | undefined
  private linger: ReturnType<typeof setTimeout> | undefined
  private inStrip = false
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

  leave(x: number, y: number, buttons: number): void {
    clearTimeout(this.dwell)
    this.inStrip = false
    const acrossLeft = leftAcrossLeftEdge(x, y)
    if (this.d.isOpen()) {
      if (acrossLeft) this.stayOut()
      else this.goBackSoon()
      return
    }
    if (this.armed && acrossLeft && buttons === 0) this.comeOut()
  }

  press(onItOrItsMenu: boolean): void {
    if (this.d.isOpen() && !onItOrItsMenu) this.goBack()
  }

  key(escape: boolean, inIt: boolean, menuUp: boolean): void {
    if (!this.d.isOpen() || menuUp) return
    if (escape || !inIt) this.goBack()
  }

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

  menuClosed(): void {
    if (this.d.isOpen() && !this.onIt()) this.goBackSoon()
  }

  dispose(): void {
    clearTimeout(this.dwell)
    clearTimeout(this.linger)
  }
}
