import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { SessionLog, altScreenBefore, readLogTail } from './SessionLog'

let dir: string
let logs: SessionLog[]
beforeEach(async () => { dir = await fs.mkdtemp(path.join(os.tmpdir(), 'step-log-')); logs = [] })
afterEach(async () => {
  await Promise.all(logs.map((log) => log.finish()))
  vi.restoreAllMocks()
  await fs.rm(dir, { recursive: true, force: true })
})
function make(opts: ConstructorParameters<typeof SessionLog>[1] = {}): SessionLog {
  const log = new SessionLog(path.join(dir, 'session.log'), opts)
  logs.push(log)
  return log
}

describe('session log', () => {
  it('batches small chunks and flushes every byte in order on shutdown', async () => {
    const append = vi.spyOn(fs, 'appendFile')
    const log = make()
    for (let i = 0; i < 100; i++) log.append(Buffer.from(`line ${i} ñ\n`))
    await log.finish()
    expect(await fs.readFile(path.join(dir, 'session.log'), 'utf8')).toBe(Array.from({ length: 100 }, (_, i) => `line ${i} ñ\n`).join(''))
    expect(append).toHaveBeenCalledTimes(1)
    log.append(Buffer.from('after shutdown'))
    expect(append).toHaveBeenCalledTimes(1)
  })

  it('automatically flushes a quiet terminal without an explicit flush', async () => {
    const log = make({ delayMs: 5 })
    log.append(Buffer.from('quiet'))
    await vi.waitFor(async () => expect(await fs.readFile(path.join(dir, 'session.log'), 'utf8')).toBe('quiet'))
  })

  it('orders a restart after an in-flight write and before fresh output', async () => {
    const original = fs.appendFile.bind(fs)
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const append = vi.spyOn(fs, 'appendFile').mockImplementationOnce(async (...args) => {
      await gate
      await original(...args)
    })
    const log = make({ batchBytes: 1 })
    log.append(Buffer.from('old'))
    await vi.waitFor(() => expect(append).toHaveBeenCalledTimes(1))
    log.clear()
    log.append(Buffer.from('new'))
    release()
    await log.finish()
    expect(await fs.readFile(path.join(dir, 'session.log'), 'utf8')).toBe('new')
  })

  it('rotates to the latest bytes and continues appending', async () => {
    const log = make({ maxBytes: 20, keepBytes: 8 })
    log.append(Buffer.from('01234567890123456789012345'))
    await log.flush()
    expect(await fs.readFile(path.join(dir, 'session.log'), 'utf8')).toBe('89012345')
    log.append(Buffer.from('ABC'))
    await log.finish()
    expect(await fs.readFile(path.join(dir, 'session.log'), 'utf8')).toBe('89012345ABC')
    expect((await readLogTail(path.join(dir, 'session.log'), 4)).toString()).toBe('5ABC')
  })

  it('removes a closed session only after queued writes finish', async () => {
    const log = make()
    log.append(Buffer.from('pending'))
    await log.finish(true)
    await expect(fs.stat(path.join(dir, 'session.log'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('holds pressure until the disk catches up', async () => {
    const pressure = vi.fn()
    const log = make({ highWater: 16, lowWater: 4, pressure })
    log.append(Buffer.alloc(16))
    expect(pressure.mock.calls).toEqual([[true]])
    await log.flush()
    expect(pressure.mock.calls).toEqual([[true], [false]])
  })

  it('releases pressure and reports disk failures without rejecting shutdown', async () => {
    vi.spyOn(fs, 'appendFile').mockRejectedValueOnce(new Error('disk full'))
    const pressure = vi.fn()
    const error = vi.fn()
    const log = make({ highWater: 16, lowWater: 4, pressure, error })
    log.append(Buffer.alloc(16))
    await log.finish()
    expect(pressure.mock.calls).toEqual([[true], [false]])
    expect(error).toHaveBeenCalledTimes(1)
  })
})

describe('altScreenBefore', () => {
  it('says which screen the part that was cut away left the session on', async () => {
    const file = path.join(dir, 'screens.log')
    await fs.writeFile(file, 'shell output\x1b[?1049hframes and frames\x1b[?1049lback at the shell\x1b[?1049hmore frames')
    const size = (await fs.stat(file)).size
    expect(await altScreenBefore(file, size)).toBe(true)
    expect(await altScreenBefore(file, size - 'more frames'.length - '\x1b[?1049h'.length)).toBe(false)
    expect(await altScreenBefore(file, 'shell output'.length)).toBe(false)
    expect(await altScreenBefore(file, 0)).toBe(false)
  })

  it('sees a switch that falls across two reads', async () => {
    const file = path.join(dir, 'split.log')
    await fs.writeFile(file, 'x'.repeat(64 * 1024 - 4) + '\x1b[?1049h' + 'y'.repeat(100))
    expect(await altScreenBefore(file, (await fs.stat(file)).size)).toBe(true)
  })
})

describe('a log that outgrows its limit', () => {
  it('keeps the screen it is given rather than the last bytes printed', async () => {
    const file = path.join(dir, 'rotated.log')
    const log = new SessionLog(file, { maxBytes: 4096, keepBytes: 1024, batchBytes: 1, screen: async () => 'THE SCREEN AS IT WAS' })
    log.append(Buffer.from('x'.repeat(5000)))
    await log.finish()
    expect(await fs.readFile(file, 'utf8')).toBe('THE SCREEN AS IT WAS')
  })

  it('falls back to the last bytes when no screen is on offer', async () => {
    const file = path.join(dir, 'plain.log')
    const log = new SessionLog(file, { maxBytes: 4096, keepBytes: 1024, batchBytes: 1 })
    log.append(Buffer.from('a'.repeat(3000) + 'b'.repeat(2000)))
    await log.finish()
    const kept = await fs.readFile(file, 'utf8')
    expect(kept.length).toBe(1024)
    expect(kept.endsWith('b')).toBe(true)
  })
})
