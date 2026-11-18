import fs from 'node:fs/promises'

export interface SessionLogOptions {
  maxBytes?: number
  keepBytes?: number
  batchBytes?: number
  delayMs?: number
  highWater?: number
  lowWater?: number
  pressure?: (paused: boolean) => void
  error?: (error: unknown) => void
  screen?: () => Promise<string | undefined>
}

export class SessionLog {
  private queue: (Buffer | null)[] = []
  private bytes = 0
  private size?: number
  private timer?: NodeJS.Timeout
  private running?: Promise<void>
  private finishing?: Promise<void>
  private ended = false
  private failed = false
  private pressured = false
  private readonly max: number
  private readonly keep: number

  constructor(private readonly file: string, private readonly opts: SessionLogOptions = {}) {
    this.max = opts.maxBytes ?? 8 * 1024 * 1024
    this.keep = opts.keepBytes ?? 2 * 1024 * 1024
    if (this.keep < 0 || this.keep >= this.max) throw new RangeError('Log keepBytes must be smaller than maxBytes')
  }

  append(data: Buffer): void {
    if (this.ended || this.failed || !data.length) return
    this.queue.push(data)
    this.bytes += data.length
    this.checkPressure()
    if (this.bytes >= (this.opts.batchBytes ?? 64 * 1024)) void this.flush()
    else if (!this.running && !this.timer) this.timer = setTimeout(() => void this.flush(), this.opts.delayMs ?? 25)
  }

  clear(): void {
    if (this.ended || this.failed) return
    this.queue.push(null)
    void this.flush()
  }

  flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer)
    this.timer = undefined
    if (this.running) return this.running
    if (!this.queue.length) return Promise.resolve()
    this.running = this.drain().catch((e) => {
      this.failed = true
      this.queue = []
      this.bytes = 0
      this.checkPressure()
      this.opts.error?.(e)
    }).finally(() => {
      this.running = undefined
      if (this.queue.length) return this.flush()
    })
    return this.running
  }

  finish(remove = false): Promise<void> {
    if (this.finishing) return this.finishing
    this.ended = true
    this.finishing = this.flush().then(async () => {
      if (remove) {
        try { await fs.rm(this.file, { force: true }) } catch (e) { this.opts.error?.(e) }
      }
    })
    return this.finishing
  }

  private async drain(): Promise<void> {
    if (this.size === undefined) {
      try { this.size = (await fs.stat(this.file)).size } catch (e: any) {
        if (e.code !== 'ENOENT') throw e
        this.size = 0
      }
    }
    while (this.queue.length) {
      const ops = this.queue
      this.queue = []
      let chunks: Buffer[] = []
      let length = 0
      const write = async (): Promise<void> => {
        if (!length) return
        const data = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks, length)
        await fs.appendFile(this.file, data)
        this.size! += length
        if (this.size! > this.max) {
          const screen = await this.opts.screen?.()
          const kept = screen === undefined ? await readLogTail(this.file, this.keep) : Buffer.from(screen, 'utf8')
          await fs.writeFile(this.file, kept)
          this.size = kept.length
        }
        this.bytes -= length
        chunks = []
        length = 0
        this.checkPressure()
      }
      for (const op of ops) {
        if (op === null) {
          await write()
          await fs.writeFile(this.file, Buffer.alloc(0))
          this.size = 0
        } else {
          chunks.push(op)
          length += op.length
        }
      }
      await write()
    }
  }

  private checkPressure(): void {
    const next = this.pressured ? this.bytes > (this.opts.lowWater ?? 256 * 1024) : this.bytes >= (this.opts.highWater ?? 1024 * 1024)
    if (next === this.pressured) return
    this.pressured = next
    this.opts.pressure?.(next)
  }
}

export async function altScreenBefore(file: string, before: number): Promise<boolean> {
  if (before <= 0) return false
  const fh = await fs.open(file, 'r')
  try {
    const size = Math.min(before, (await fh.stat()).size)
    const buffer = Buffer.allocUnsafe(Math.min(size, 64 * 1024))
    let at = 0
    let alt = false
    let carry = ''
    while (at < size) {
      const { bytesRead } = await fh.read(buffer, 0, Math.min(buffer.length, size - at), at)
      if (!bytesRead) break
      at += bytesRead
      const text = carry + buffer.subarray(0, bytesRead).toString('latin1')
      for (const m of text.matchAll(/\x1b\[\?(?:1049|1047|47)([hl])/g)) alt = m[1] === 'h'
      carry = text.slice(-8)
    }
    return alt
  } finally {
    await fh.close()
  }
}

export async function readLogTail(file: string, max: number): Promise<Buffer> {
  const fh = await fs.open(file, 'r')
  try {
    const st = await fh.stat()
    const size = Math.min(st.size, max)
    const out = Buffer.allocUnsafe(size)
    let offset = 0
    while (offset < size) {
      const { bytesRead } = await fh.read(out, offset, size - offset, st.size - size + offset)
      if (!bytesRead) break
      offset += bytesRead
    }
    return out.subarray(0, offset)
  } finally {
    await fh.close()
  }
}
