export function movedIds(rows: Array<{ id: string; pinned: boolean }>, from: string, target: string, after: boolean): string[] | null {
  const a = rows.find((r) => r.id === from)
  const b = rows.find((r) => r.id === target)
  if (!a || !b || a === b || a.pinned !== b.pinned) return null
  const rest = rows.filter((r) => r.id !== from).map((r) => r.id)
  const at = rest.indexOf(target) + (after ? 1 : 0)
  const ids = [...rest.slice(0, at), from, ...rest.slice(at)]
  return ids.every((id, i) => id === rows[i].id) ? null : ids
}
