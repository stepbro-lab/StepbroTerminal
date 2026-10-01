import { describe, expect, it } from 'vitest'
import type { Preset } from '@shared/types'
import { chipsThatFit, quickAgents, stripWidth } from './quickAgents'

const preset = (id: string, installed = true): Preset => ({ id, name: id, color: '#000', binary: id, args: [], hooks: false, installed })
const PRESETS = [preset('shell'), preset('claude'), preset('codex'), preset('gemini', false), preset('opencode'), preset('clyra'), preset('kimi')]

describe('the agents a folder row offers', () => {
  it('offers every installed agent, never the shell or one that is not installed, in the app\'s order', () => {
    expect(quickAgents(PRESETS, {}, 10).map((p) => p.id)).toEqual(['claude', 'codex', 'opencode', 'clyra', 'kimi'])
  })

  it('keeps the most used when they do not all fit, still in the app\'s order', () => {
    const usage = { kimi: 9, codex: 4, claude: 4, opencode: 1 }
    expect(quickAgents(PRESETS, usage, 3).map((p) => p.id)).toEqual(['claude', 'codex', 'kimi'])
  })

  it('breaks a tie in usage by the app\'s order, and offers none with no room', () => {
    expect(quickAgents(PRESETS, {}, 2).map((p) => p.id)).toEqual(['claude', 'codex'])
    expect(quickAgents(PRESETS, {}, 0)).toEqual([])
  })
})

describe('the strip\'s size', () => {
  it('measures chips with the gaps between them and the padding at both ends', () => {
    expect(stripWidth(1)).toBe(28)
    expect(stripWidth(3)).toBe(3 * 22 + 2 + 6)
  })

  it('fits more chips in a wider sidebar, and always the "+" and the shell', () => {
    expect(chipsThatFit(206)).toBe(6)
    expect(chipsThatFit(240)).toBe(7)
    expect(chipsThatFit(360)).toBe(12)
    expect(chipsThatFit(60)).toBe(2)
    // The open strip stays inside the row.
    for (const w of [200, 206, 240, 300, 360]) expect(stripWidth(chipsThatFit(w))).toBeLessThanOrEqual(w - 58)
  })
})
