import { describe, expect, it, vi } from 'vitest'
import { mapLimit, sampled } from './async'

describe('bounded async work', () => {
  it('limits concurrency and preserves result order', async () => {
    let active = 0
    let peak = 0
    const result = await mapLimit([0, 1, 2, 3, 4, 5], 2, async (n) => {
      active++
      peak = Math.max(peak, active)
      await new Promise((resolve) => setImmediate(resolve))
      active--
      return n * 2
    })
    expect(peak).toBe(2)
    expect(result).toEqual([0, 2, 4, 6, 8, 10])
  })

  it('shares an in-flight sample and reuses it within the TTL', async () => {
    const read = vi.fn(async () => 42)
    const sample = sampled(read, 1000)
    expect(await Promise.all(Array.from({ length: 20 }, () => sample()))).toEqual(Array(20).fill(42))
    expect(await sample()).toBe(42)
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('does not cache failures and refreshes expired samples', async () => {
    const read = vi.fn().mockRejectedValueOnce(new Error('failed')).mockResolvedValueOnce(1).mockResolvedValueOnce(2)
    const sample = sampled(read, 0)
    await expect(sample()).rejects.toThrow('failed')
    expect(await sample()).toBe(1)
    expect(await sample()).toBe(2)
  })
})
