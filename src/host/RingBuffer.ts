/** Fixed-capacity byte ring. Keeps the most recent `capacity` bytes written. */
export class RingBuffer {
  private readonly buf: Buffer
  private head = 0
  private len = 0

  constructor(readonly capacity: number) {
    this.buf = Buffer.allocUnsafe(capacity)
  }

  get size(): number {
    return this.len
  }

  write(chunk: Uint8Array): void {
    const n = chunk.byteLength
    if (n === 0) return
    if (n >= this.capacity) {
      this.buf.set(chunk.subarray(n - this.capacity), 0)
      this.head = 0
      this.len = this.capacity
      return
    }
    const tail = (this.head + this.len) % this.capacity
    const firstPart = Math.min(n, this.capacity - tail)
    this.buf.set(chunk.subarray(0, firstPart), tail)
    if (firstPart < n) this.buf.set(chunk.subarray(firstPart), 0)
    const overflow = this.len + n - this.capacity
    if (overflow > 0) {
      this.head = (this.head + overflow) % this.capacity
      this.len = this.capacity
    } else {
      this.len += n
    }
  }

  snapshot(): Uint8Array {
    const out = Buffer.allocUnsafe(this.len)
    const firstPart = Math.min(this.len, this.capacity - this.head)
    this.buf.copy(out, 0, this.head, this.head + firstPart)
    if (firstPart < this.len) this.buf.copy(out, firstPart, 0, this.len - firstPart)
    return out
  }

  clear(): void {
    this.head = 0
    this.len = 0
  }
}
