import { describe, expect, it } from 'vitest'
import { parseCostState } from './transcript'

describe('parseCostState', () => {
  it('extracts cost, dominant model and token totals from the last cost-state line', () => {
    const tail = [
      '{"type":"user","message":"x"}',
      JSON.stringify({
        type: 'cost-state',
        totalCostUSD: 1.5,
        modelUsage: {
          'claude-haiku-4-5': { inputTokens: 100, outputTokens: 10 },
          'claude-fable-5-1': { inputTokens: 5000, outputTokens: 900 }
        }
      }),
      '{"type":"assistant"}'
    ].join('\n')
    expect(parseCostState(tail)).toEqual({ costUsd: 1.5, model: 'claude-fable-5-1', inputTokens: 5100, outputTokens: 910 })
  })

  it('returns empty when nothing usable is present', () => {
    expect(parseCostState('{"type":"user"}\n{"type":"cost-state"')).toEqual({})
  })
})
