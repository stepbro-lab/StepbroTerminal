import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FitHold } from './fitHold'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('FitHold', () => {
  it('starts out letting terminals fit', () => {
    expect(new FitHold(() => {}).isHeld).toBe(false)
  })

  it('holds until the last of several overlapping holds lets go', () => {
    const released = vi.fn()
    const hold = new FitHold(released)
    hold.hold()
    hold.hold()
    hold.release()
    expect(hold.isHeld).toBe(true)
    expect(released).not.toHaveBeenCalled()
    hold.release()
    expect(hold.isHeld).toBe(false)
    expect(released).toHaveBeenCalledTimes(1)
  })

  it('lets go by itself when a release never comes', () => {
    const released = vi.fn()
    const hold = new FitHold(released, 1500)
    hold.hold()
    vi.advanceTimersByTime(1499)
    expect(hold.isHeld).toBe(true)
    vi.advanceTimersByTime(1)
    expect(hold.isHeld).toBe(false)
    expect(released).toHaveBeenCalledTimes(1)
  })

  it('gives a fresh grace period to each new hold', () => {
    const released = vi.fn()
    const hold = new FitHold(released, 1000)
    hold.hold()
    vi.advanceTimersByTime(900)
    hold.hold()
    vi.advanceTimersByTime(900)
    expect(released).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    expect(released).toHaveBeenCalledTimes(1)
  })

  it('releases once, not once per hold, when time runs out', () => {
    const released = vi.fn()
    const hold = new FitHold(released, 500)
    hold.hold()
    hold.hold()
    vi.advanceTimersByTime(500)
    expect(released).toHaveBeenCalledTimes(1)
    expect(hold.isHeld).toBe(false)
  })

  it('ignores a release nobody asked for', () => {
    const released = vi.fn()
    const hold = new FitHold(released)
    hold.release()
    expect(released).not.toHaveBeenCalled()
    expect(hold.isHeld).toBe(false)
  })

  it('stops the clock once it has let go, so a later hold is not cut short', () => {
    const released = vi.fn()
    const hold = new FitHold(released, 1000)
    hold.hold()
    hold.release()
    vi.advanceTimersByTime(1000)
    expect(released).toHaveBeenCalledTimes(1)
  })

  it('keeps the longer hold of a drag even when a short one comes and goes during it', () => {
    const released = vi.fn()
    const hold = new FitHold(released, 1000)
    hold.hold(60_000)
    vi.advanceTimersByTime(5000)
    hold.hold()
    hold.release()
    vi.advanceTimersByTime(10_000)
    expect(hold.isHeld).toBe(true)
    expect(released).not.toHaveBeenCalled()
    hold.release()
    expect(released).toHaveBeenCalledTimes(1)
  })

  it('lets go of a drag that never ends, at its own limit', () => {
    const released = vi.fn()
    const hold = new FitHold(released, 1000)
    hold.hold(60_000)
    vi.advanceTimersByTime(59_999)
    expect(released).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(released).toHaveBeenCalledTimes(1)
  })
})
