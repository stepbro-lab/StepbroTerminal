export interface Size {
  cols: number
  rows: number
}

export class SizeOwners<C> {
  private owners = new Map<string, C>()
  private sizes = new Map<string, Map<C, Size>>()

  claim(id: string, c: C): void {
    if (!this.owners.has(id)) this.owners.set(id, c)
  }

  owns(id: string, c: C): boolean {
    const o = this.owners.get(id)
    return o === undefined || o === c
  }

  note(id: string, c: C, size: Size): void {
    let m = this.sizes.get(id)
    if (!m) {
      m = new Map()
      this.sizes.set(id, m)
    }
    m.set(c, size)
  }

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
