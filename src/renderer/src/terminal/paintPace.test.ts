import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Terminal } from '@xterm/xterm'

let pace: 'live' | 'slow' | 'off' = 'live'
vi.mock('@/lib/windowPace', () => ({
  // The first question is what finds the window already behind another: the pace changes then,
  // before anyone is listening, and nothing calls back to say so.
  currentPace: () => pace,
  onPace: () => () => {}
}))

function fakeTerminal(): { term: Terminal; seen: boolean[] } {
  const seen: boolean[] = []
  const rs = { _handleIntersectionChange: (e: { isIntersecting?: boolean }) => seen.push(!!e.isIntersecting) }
  return { term: { _core: { _renderService: rs } } as unknown as Terminal, seen }
}

describe('paceDrawing', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('window', { setInterval, clearInterval })
    vi.resetModules()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('still draws now and then when the window starts out behind another', async () => {
    pace = 'slow'
    const { paceDrawing, SLOW_FRAME_MS } = await import('./paintPace')
    const { term, seen } = fakeTerminal()
    paceDrawing(term)
    seen.length = 0
    vi.advanceTimersByTime(SLOW_FRAME_MS * 3)
    expect(seen.filter(Boolean).length).toBe(3)
    expect(seen.at(-1)).toBe(false)
  })

  it('draws freely in front, with nothing ticking', async () => {
    pace = 'live'
    const { paceDrawing, SLOW_FRAME_MS } = await import('./paintPace')
    const { term, seen } = fakeTerminal()
    paceDrawing(term)
    expect(seen.at(-1)).toBe(true)
    seen.length = 0
    vi.advanceTimersByTime(SLOW_FRAME_MS * 3)
    expect(seen).toEqual([])
  })
})
