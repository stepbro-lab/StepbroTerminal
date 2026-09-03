export interface Size {
  cols: number
  rows: number
}

/**
 * One client per session decides its size. The first client to attach keeps that role until it
 * lets go, so a second window looking at the same session cannot pull the PTY to its own width
 * and garble what the first one shows. When the owner leaves, another attached client inherits
 * the role together with the last size it asked for.
 */
export class SizeOwners<C> {
  private owners = new Map<string, C>()
  private sizes = new Map<string, Map<C, Size>>()

  /** Makes `c` the owner of `id` unless someone already is. */
  claim(id: string, c: C): void {
    if (!this.owners.has(id)) this.owners.set(id, c)
  }

  /** Whether a resize from `c` should be applied: it owns the session or nobody does. */
  owns(id: string, c: C): boolean {
    const o = this.owners.get(id)
    return o === undefined || o === c
  }

  /** Remembers what `c` wants, so it can be applied if `c` inherits the session later. */
  note(id: string, c: C, size: Size): void {
    let m = this.sizes.get(id)
    if (!m) {
      m = new Map()
      this.sizes.set(id, m)
    }
    m.set(c, size)
  }

  /**
   * `c` stops looking at `id`. Returns the size to apply when the role passes to one of the
   * `others` still attached, or null when nothing changes.
   */
  release(id: string, c: C, others: Iterable<C>): Size | null {
    this.sizes.get(id)?.delete(c)
    if (this.owners.get(id) !== c) return null
    this.owners.delete(id)
    for (const o of others) {
      if (o === c) continue
      this.owners.set(id, o)
      return this.sizes.get(id)?.get(o) ?? null
    }
    return null
  }

  forget(id: string): void {
    this.owners.delete(id)
    this.sizes.delete(id)
  }
}
