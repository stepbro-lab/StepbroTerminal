export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError('Concurrency must be a positive integer')
  const results = new Array<R>(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i], i)
    }
  }))
  return results
}

export function sampled<T>(read: () => Promise<T>, ttlMs: number): () => Promise<T> {
  let pending: Promise<T> | undefined
  let cached: { value: T; at: number } | undefined
  return () => {
    if (pending) return pending
    if (cached && performance.now() - cached.at < ttlMs) return Promise.resolve(cached.value)
    pending = Promise.resolve().then(read).then((value) => {
      cached = { value, at: performance.now() }
      return value
    }).finally(() => { pending = undefined })
    return pending
  }
}
