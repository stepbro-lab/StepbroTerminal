import { describe, expect, it } from 'vitest'
import { orderRows, type SidebarSession } from './sidebarModel'

const row = (id: string, order: number, view: number | null = null, pinned = false): SidebarSession =>
  ({ key: id, id, title: id, status: 'idle', presetId: 'shell', pinned, lastAt: 0, view, session: { order, createdAt: order } }) as unknown as SidebarSession

const ids = (rows: SidebarSession[]): string[] => rows.map((r) => r.id)

describe('orderRows', () => {
  it('follows the user order, pinned first', () => {
    expect(ids(orderRows([row('a', 2), row('b', 0), row('c', 1, null, true)]))).toEqual(['c', 'b', 'a'])
  })

  it('keeps the sessions of a split view together where the first of them sits', () => {
    // b and d share view 0; d moves up next to b, c follows them.
    expect(ids(orderRows([row('a', 0), row('b', 1, 0), row('c', 2), row('d', 3, 0)]))).toEqual(['a', 'b', 'd', 'c'])
  })

  it('orders the members of a box among themselves and boxes among the rest', () => {
    const rows = [row('a', 5, 1), row('b', 0, 0), row('c', 1), row('d', 2, 1), row('e', 3, 0)]
    expect(ids(orderRows(rows))).toEqual(['b', 'e', 'c', 'd', 'a'])
  })
})
