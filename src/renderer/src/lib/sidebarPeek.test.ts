import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PEEK_BAND_PX, PEEK_DWELL_MS, PEEK_LINGER_MS, PEEK_TOP_GUARD_PX, PeekController, atLeftEdge, leftAcrossLeftEdge, onPanel } from './sidebarPeek'

describe('the left edge', () => {
  it('counts only a thin strip along it, below the window buttons, with no button held', () => {
    expect(atLeftEdge(0, 300, 0)).toBe(true)
    expect(atLeftEdge(PEEK_BAND_PX, 300, 0)).toBe(true)
    // Working near the edge, in the terminal, is not reaching for the sidebar.
    expect(atLeftEdge(PEEK_BAND_PX + 20, 300, 0)).toBe(false)
    // On the way to the traffic lights or the top bar.
    expect(atLeftEdge(2, PEEK_TOP_GUARD_PX - 1, 0)).toBe(false)
    // Dragging a selection out to the left.
    expect(atLeftEdge(2, 300, 1)).toBe(false)
  })

  it('counts the pointer leaving across it, but not across the top corner', () => {
    expect(leftAcrossLeftEdge(-1, 300)).toBe(true)
    expect(leftAcrossLeftEdge(0, 300)).toBe(true)
    expect(leftAcrossLeftEdge(4, 300)).toBe(false)
    expect(leftAcrossLeftEdge(-1, 10)).toBe(false)
  })

  it('keeps the sidebar out while the pointer is on it or just past its edge', () => {
    const r = { left: 8, top: 8, right: 248, bottom: 700 }
    expect(onPanel(100, 300, r)).toBe(true)
    expect(onPanel(256, 300, r)).toBe(true)
    expect(onPanel(300, 300, r)).toBe(false)
  })
})

describe('the sidebar out for a look', () => {
  const PANEL = { left: 8, top: 8, right: 248, bottom: 700 }
  let open = false
  let held = false
  let peek: PeekController
  beforeEach(() => {
    vi.useFakeTimers()
    open = false
    held = false
    peek = new PeekController({ isOpen: () => open, setOpen: (v) => (open = v), panel: () => (open ? PANEL : null), held: () => held })
  })
  afterEach(() => {
    peek.dispose()
    vi.useRealTimers()
  })
  const comeOut = (): void => {
    peek.move(500, 400, 0)
    peek.move(4, 400, 0)
    vi.advanceTimersByTime(PEEK_DWELL_MS)
    expect(open).toBe(true)
  }

  it('comes out once the pointer rests at the edge, not before', () => {
    peek.move(500, 400, 0)
    peek.move(4, 400, 0)
    vi.advanceTimersByTime(PEEK_DWELL_MS - 40)
    expect(open).toBe(false)
    vi.advanceTimersByTime(40)
    expect(open).toBe(true)
  })

  it('stays in when the pointer only passes through the edge', () => {
    peek.move(4, 400, 0)
    vi.advanceTimersByTime(40)
    peek.move(300, 400, 0)
    vi.advanceTimersByTime(500)
    expect(open).toBe(false)
  })

  it('stays in for the window buttons and for a selection dragged to the edge', () => {
    peek.move(4, 20, 0)
    vi.advanceTimersByTime(500)
    peek.move(4, 400, 1)
    vi.advanceTimersByTime(500)
    expect(open).toBe(false)
  })

  it('comes out at once when the pointer leaves the window across the left edge', () => {
    peek.leave(-1, 400, 0)
    expect(open).toBe(true)
  })

  it('stays out while the pointer is on it, and through a brush past its edge', () => {
    comeOut()
    peek.move(120, 300, 0)
    vi.advanceTimersByTime(5000)
    expect(open).toBe(true)
    peek.move(400, 300, 0)
    vi.advanceTimersByTime(PEEK_LINGER_MS - 100)
    peek.move(200, 300, 0)
    vi.advanceTimersByTime(PEEK_LINGER_MS * 2)
    expect(open).toBe(true)
  })

  it('goes back a moment after the pointer leaves it', () => {
    comeOut()
    peek.move(600, 300, 0)
    vi.advanceTimersByTime(PEEK_LINGER_MS - 1)
    expect(open).toBe(true)
    vi.advanceTimersByTime(1)
    expect(open).toBe(false)
  })

  it('stays out while a menu from it is up, and decides again when the menu closes', () => {
    comeOut()
    held = true
    peek.move(600, 300, 0)
    vi.advanceTimersByTime(3000)
    expect(open).toBe(true)
    held = false
    peek.menuClosed()
    vi.advanceTimersByTime(PEEK_LINGER_MS)
    expect(open).toBe(false)
  })

  it('goes back on a click or a key elsewhere, and on Escape, but not on its own clicks and keys', () => {
    comeOut()
    peek.press(true)
    peek.key(false, true, false)
    expect(open).toBe(true)
    peek.key(false, false, false)
    expect(open).toBe(false)
    peek.move(500, 400, 0)
    comeOut()
    peek.key(true, true, false)
    expect(open).toBe(false)
    peek.move(500, 400, 0)
    comeOut()
    peek.press(false)
    expect(open).toBe(false)
  })

  it('needs the pointer to leave the edge and come back before it comes out again', () => {
    comeOut()
    peek.move(4, 400, 0)
    peek.press(false)
    peek.move(5, 410, 0)
    vi.advanceTimersByTime(500)
    expect(open).toBe(false)
    peek.move(300, 410, 0)
    peek.move(4, 410, 0)
    vi.advanceTimersByTime(PEEK_DWELL_MS)
    expect(open).toBe(true)
  })

  it('stays out while a session is dragged out of it, and goes back when it is dropped', () => {
    comeOut()
    peek.dragStart(true)
    peek.move(800, 300, 0)
    vi.advanceTimersByTime(3000)
    expect(open).toBe(true)
    peek.dragEnd()
    expect(open).toBe(false)
  })

  it('goes back when the window loses focus, unless something in it holds it', () => {
    comeOut()
    held = true
    peek.blur()
    expect(open).toBe(true)
    held = false
    peek.blur()
    expect(open).toBe(false)
  })
})
