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
beforeEach(async () => {
  ptys.length = 0
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'step-manager-'))
  sm = new SessionManager({ stateFile: path.join(dir, 'state.json'), logDir: path.join(dir, 'logs'), hooksDir: path.join(dir, 'hooks'),
    binDir: path.join(dir, 'bin'), hookUrl: () => 'http://127.0.0.1:1/hooks', mcpUrl: () => 'http://127.0.0.1:1/mcp',
    scrollback: 5000, baseEnv: process.env })
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
