import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SizeTeller } from './sizeTeller'

describe('telling a program its terminal\'s size', () => {
  let told: string[]
  let sizes: SizeTeller
  beforeEach(() => {
    vi.useFakeTimers()
    told = []
    sizes = new SizeTeller((id) => told.push(id), 150, 60_000)
  })
  afterEach(() => vi.useRealTimers())

  it('tells a size once it holds still, however many came before it', () => {
    for (let i = 0; i < 40; i++) {
      sizes.changed('a')
      vi.advanceTimersByTime(16)
    }
    expect(told).toEqual([])
    vi.advanceTimersByTime(150)
    expect(told).toEqual(['a'])
  })

  it('tells each terminal its own', () => {
    sizes.changed('a')
    sizes.changed('b')
    vi.advanceTimersByTime(150)
    expect(told.sort()).toEqual(['a', 'b'])
  })

  it('tells nothing while a drag goes on, however long, and everything when it ends', () => {
    sizes.beginGesture()
    for (let i = 0; i < 300; i++) {
      sizes.changed('a')
      sizes.changed('b')
      vi.advanceTimersByTime(20)
    }
    vi.advanceTimersByTime(5000)
    expect(told).toEqual([])
    sizes.endGesture()
    expect(told.sort()).toEqual(['a', 'b'])
    vi.advanceTimersByTime(1000)
    expect(told).toHaveLength(2)
  })

  it('waits for a size still moving when the drag ends', () => {
    sizes.beginGesture()
    sizes.changed('a')
    vi.advanceTimersByTime(50)
    sizes.endGesture()
    expect(told).toEqual([])
    vi.advanceTimersByTime(150)
    expect(told).toEqual(['a'])
  })

  it('waits for the last of two drags, and lets go of one that never ends', () => {
    sizes.beginGesture()
    sizes.beginGesture()
    sizes.changed('a')
    vi.advanceTimersByTime(200)
    sizes.endGesture()
    expect(told).toEqual([])
    sizes.endGesture()
    expect(told).toEqual(['a'])
    told = []
    sizes.beginGesture()
    sizes.changed('a')
    vi.advanceTimersByTime(60_000)
    expect(told).toEqual(['a'])
  })

  it('forgets a terminal that goes away', () => {
    sizes.changed('a')
    sizes.forget('a')
    vi.advanceTimersByTime(500)
    expect(told).toEqual([])
  })
})
