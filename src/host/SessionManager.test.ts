import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { Session } from '@shared/types'
import { SessionManager } from './SessionManager'

const ptys = vi.hoisted(() => [] as any[])
vi.mock('node-pty', () => ({ spawn: () => {
  const p = { pid: 1234 + ptys.length, pause: vi.fn(), resume: vi.fn(), kill: vi.fn(), resize: vi.fn(), write: vi.fn(),
    onData(fn: (s: string) => void) { this.data = fn }, onExit(fn: (e: { exitCode: number }) => void) { this.exit = fn },
    data: (_: string) => {}, exit: (_: { exitCode: number }) => {} }
  ptys.push(p)
  return p
} }))

let dir: string
let sm: SessionManager
/** Whether a window has the sessions attached; most tests are of a session someone is looking at. */
let watched = true
beforeEach(async () => {
  ptys.length = 0
  watched = true
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'step-manager-'))
  sm = new SessionManager({ stateFile: path.join(dir, 'state.json'), logDir: path.join(dir, 'logs'), hooksDir: path.join(dir, 'hooks'),
    binDir: path.join(dir, 'bin'), hookUrl: () => 'http://127.0.0.1:1/hooks', mcpUrl: () => 'http://127.0.0.1:1/mcp',
    scrollback: 5000, baseEnv: process.env, viewed: () => watched })
})
afterEach(async () => {
  for (const s of sm.list()) sm.close(s.id)
  sm.persistNow()
  await sm.finishLogs()
  vi.restoreAllMocks()
  await fs.rm(dir, { recursive: true, force: true })
})
const create = (): Session => sm.create({ projectPath: dir, presetId: 'shell', cols: 80, rows: 24, launch: { command: process.execPath, args: [], hooks: false } })

describe('session output lifecycle', () => {
  it('preserves terminal output in the screen and on disk through shutdown', async () => {
    const s = create()
    ptys[0].data('hello ñ\r\nsecond line\r\n')
    expect((await sm.screenLines(s.id, 10)).join('\n')).toContain('hello ñ')
    await sm.finishLogs()
    expect(await fs.readFile(path.join(dir, 'logs', `${s.id}.log`), 'utf8')).toBe('hello ñ\r\nsecond line\r\n')
  })

  it('clears queued old log output on restart and ignores the old PTY', async () => {
    const s = create()
    ptys[0].data('OLD\r\n')
    sm.restart(s.id)
    ptys[0].data('STALE\r\n')
    ptys[1].data('NEW\r\n')
    const screen = (await sm.screenLines(s.id, 10)).join('\n')
    expect(screen).toContain('NEW')
    expect(screen).not.toContain('OLD')
    expect(screen).not.toContain('STALE')
    await sm.finishLogs()
    expect(await fs.readFile(path.join(dir, 'logs', `${s.id}.log`), 'utf8')).toBe('NEW\r\n')
  })

  it('does not load archived scrollback at startup and restores it once on demand', async () => {
    const saved: Session = { id: 'archived', projectPath: dir, presetId: 'shell', title: '', titleSource: 'none', pinned: false,
      order: 0, createdAt: 0, updatedAt: 0, status: 'exited', statusAt: 0, alive: false, archived: true,
      cols: 80, rows: 24, agent: {}, launch: { command: process.execPath, args: [], hooks: false } }
    await fs.writeFile(path.join(dir, 'state.json'), JSON.stringify({ sessions: [saved] }))
    await fs.writeFile(path.join(dir, 'logs', 'archived.log'), 'saved output\r\n')
    const open = vi.spyOn(fs, 'open')
    sm.load()
    expect(open).not.toHaveBeenCalled()
    const [a, b] = await Promise.all([sm.snapshot(saved.id), sm.snapshot(saved.id)])
    expect(Buffer.from(a).toString()).toContain('saved output')
    expect(Buffer.from(b)).toEqual(Buffer.from(a))
    expect(open).toHaveBeenCalledTimes(1)
    await sm.snapshot(saved.id)
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('pauses for a backed-up emulator even without an attached client', async () => {
    const s = create()
    ptys[0].data('x'.repeat(1024 * 1024 + 10))
    expect(ptys[0].pause).toHaveBeenCalled()
    sm.resume(s.id)
    expect(ptys[0].resume).not.toHaveBeenCalled()
    await sm.snapshot(s.id)
    await vi.waitFor(() => expect(ptys[0].resume).toHaveBeenCalled())
  })
})

describe('full-screen programs through a host restart', () => {
  /** A second host over the same files, the way an update starts one. */
  const restarted = (): SessionManager =>
    new SessionManager({ stateFile: path.join(dir, 'state.json'), logDir: path.join(dir, 'logs'), hooksDir: path.join(dir, 'hooks'),
      binDir: path.join(dir, 'bin'), hookUrl: () => 'http://127.0.0.1:1/hooks', mcpUrl: () => 'http://127.0.0.1:1/mcp',
      scrollback: 5000, baseEnv: process.env })

  it('brings back the screen a program was drawing on, not the log behind it', async () => {
    const s = create()
    // A full-screen program: its own screen, then frames drawn over each other in place.
    ptys[0].data('\x1b[?1049h\x1b[2J')
    for (let frame = 1; frame <= 40; frame++) ptys[0].data(`\x1b[H\x1b[2Jframe ${frame} of the drawing`)
    sm.persistNow()
    await sm.finishLogs()

    const next = restarted()
    next.load()
    const screen = Buffer.from(await next.snapshot(s.id)).toString()
    expect(screen).toContain('frame 40 of the drawing')
    expect(screen).not.toContain('frame 39')
    expect(screen).toContain('?1049h')
    await next.finishLogs()
  })

  it('puts a program back on its own screen when the head of its log was cut away', async () => {
    const saved: Session = { id: 'cut', projectPath: dir, presetId: 'shell', title: '', titleSource: 'none', pinned: false,
      order: 0, createdAt: 0, updatedAt: 0, status: 'exited', statusAt: 0, alive: false,
      cols: 80, rows: 24, agent: {}, launch: { command: process.execPath, args: [], hooks: false } }
    await fs.writeFile(path.join(dir, 'state.json'), JSON.stringify({ sessions: [saved] }))
    // The switch to its own screen, and then more frames than the host keeps: the tail read back
    // starts long after that switch.
    const frame = (n: number): string => `\x1b[H\x1b[2Jframe ${n} ` + 'filler '.repeat(140)
    let written = '\x1b[?1049h\x1b[2J'
    for (let n = 1; written.length < 3 * 1024 * 1024; n++) written += frame(n)
    written += frame(999999)
    await fs.writeFile(path.join(dir, 'logs', 'cut.log'), written)

    const next = restarted()
    next.load()
    const screen = Buffer.from(await next.snapshot('cut')).toString()
    expect(screen).toContain('frame 999999')
    // On its own screen, so the frames are not stacked one under another as scrollback.
    expect(screen).toContain('?1049h')
    expect(screen.split('frame ').length - 1).toBe(1)
    await next.finishLogs()
  })

  it('survives a log so long that it had to be cut while the program was drawing', async () => {
    const s = create()
    ptys[0].data('\x1b[?1049h\x1b[2J')
    // Past the eight megabytes a log holds, so it is cut with the program still on its own screen.
    const filler = 'filler '.repeat(150)
    for (let frame = 1; frame <= 1400; frame++) ptys[0].data(`\x1b[H\x1b[2Jframe ${frame} ${filler}`)
    await vi.waitFor(async () => expect((await fs.stat(path.join(dir, 'logs', `${s.id}.log`))).size).toBeLessThan(8 * 1024 * 1024), { timeout: 10000 })
    // The host is lost without a word: only what the log holds is left to go on.
    sm.persistNow()

    const next = restarted()
    next.load()
    const screen = Buffer.from(await next.snapshot(s.id)).toString()
    expect(screen).toContain('frame 1400')
    expect(screen).toContain('?1049h')
    expect(screen.split('frame ').length - 1).toBe(1)
    await next.finishLogs()
  })

  it('reads the screen it saved once, then keeps its own', async () => {
    const s = create()
    ptys[0].data('\x1b[?1049h\x1b[2Jwhat was on screen')
    sm.persistNow()
    await sm.finishLogs()
    expect(await fs.readFile(path.join(dir, 'logs', `${s.id}.screen`), 'utf8')).toContain('what was on screen')

    const next = restarted()
    next.load()
    expect(Buffer.from(await next.snapshot(s.id)).toString()).toContain('what was on screen')
    await expect(fs.access(path.join(dir, 'logs', `${s.id}.screen`))).rejects.toThrow()
    await next.finishLogs()
  })
})

describe("answers a program asks the terminal for as it starts", () => {
  const platform = process.platform
  const onPlatform = (value: string): void => {
    Object.defineProperty(process, 'platform', { value, configurable: true })
  }
  afterEach(() => onPlatform(platform))
  /** What the program was sent, beyond the host's own answer to ConPTY. */
  const sentToProgram = (p: any): string => p.write.mock.calls.map((c: any[]) => Buffer.from(c[0]).toString()).filter((t: string) => t !== '\x1b[?1;2c').join('')

  it('passes on where the cursor is, away from Windows, even before anything was printed', () => {
    onPlatform('darwin')
    const s = create()
    // A full-screen program measuring its text: a question, and nothing printable yet.
    ptys[0].data('\x1b[?1049h\x1b[3;7H\x1b[6n')
    sm.input(s.id, Buffer.from('\x1b[3;7R'))
    expect(sentToProgram(ptys[0])).toBe('\x1b[3;7R')
  })

  it('answers the program itself while no window is watching yet', async () => {
    onPlatform('darwin')
    watched = false
    const s = create()
    ptys[0].data('\x1b[?1049h\x1b[3;7H\x1b[6n')
    await sm.snapshot(s.id)
    expect(sentToProgram(ptys[0])).toBe('\x1b[3;7R')
    // Once a window watches, it answers and the host stays quiet.
    ptys[0].write.mockClear()
    watched = true
    ptys[0].data('\x1b[5;9H\x1b[6n')
    await sm.snapshot(s.id)
    expect(sentToProgram(ptys[0])).toBe('')
  })

  it('still drops a view\'s answers to ConPTY\'s startup probe on Windows', () => {
    onPlatform('win32')
    const s = create()
    // ConPTY's probe: the host answers it, and a view that saw it answers it again.
    ptys[0].data('\x1b[c\x1b[6n')
    expect(ptys[0].write).toHaveBeenCalledWith('\x1b[?1;2c')
    sm.input(s.id, Buffer.from('\x1b[?1;2c\x1b[1;1R'))
    expect(sentToProgram(ptys[0])).toBe('')
  })
})
