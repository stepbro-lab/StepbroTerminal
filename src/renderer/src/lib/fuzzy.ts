/** Subsequence match score. Higher is better; -1 means no match. */
export function score(query: string, text: string): number {
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  if (!q) return 0
  let qi = 0
  let s = 0
  let streak = 0
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      qi++
      streak++
      s += 1 + streak * 2
      if (ti === 0 || /[\s\-_/\\.]/.test(t[ti - 1])) s += 6
    } else {
      streak = 0
    }
  }
  if (qi < q.length) return -1
  if (t.startsWith(q)) s += 20
  return s - Math.max(0, t.length - q.length) * 0.05
}

export function filter<T>(items: T[], query: string, key: (t: T) => string): T[] {
  if (!query.trim()) return items
  return items
    .map((it) => ({ it, s: score(query, key(it)) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.it)
}
