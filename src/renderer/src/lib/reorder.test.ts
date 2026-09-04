import { describe, expect, it } from 'vitest'
import { movedIds } from './reorder'

const rows = (...ids: string[]) => ids.map((id) => ({ id, pinned: id.startsWith('p') }))

describe('movedIds', () => {
  it('moves a row above or below another', () => {
    expect(movedIds(rows('a', 'b', 'c'), 'c', 'a', false)).toEqual(['c', 'a', 'b'])
    expect(movedIds(rows('a', 'b', 'c'), 'a', 'c', true)).toEqual(['b', 'c', 'a'])
    expect(movedIds(rows('a', 'b', 'c'), 'a', 'b', true)).toEqual(['b', 'a', 'c'])
  })

  it('returns null when nothing would move', () => {
    expect(movedIds(rows('a', 'b', 'c'), 'b', 'b', true)).toBeNull()
    expect(movedIds(rows('a', 'b', 'c'), 'b', 'a', true)).toBeNull()
    expect(movedIds(rows('a', 'b', 'c'), 'b', 'c', false)).toBeNull()
    expect(movedIds(rows('a', 'b'), 'zz', 'a', true)).toBeNull()
  })

  it('keeps pinned and unpinned rows apart', () => {
    expect(movedIds(rows('p1', 'p2', 'a', 'b'), 'b', 'p1', false)).toBeNull()
    expect(movedIds(rows('p1', 'p2', 'a', 'b'), 'p2', 'p1', false)).toEqual(['p2', 'p1', 'a', 'b'])
  })
})
