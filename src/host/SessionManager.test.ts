import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { Session } from '@shared/types'
import { SessionManager } from './SessionManager'

const ptys = vi.hoisted(() => [] as any[])
vi.mock('node-pty', () => ({ spawn: (_file: string, args: string[], opts: { cwd?: string }) => {
  const p = { args, cwd: opts?.cwd, pid: 1234 + ptys.length, pause: vi.fn(), resume: vi.fn(), kill: vi.fn(), resize: vi.fn(), write: vi.fn(),
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

  it('on Windows, drops a watching window\'s answers to ConPTY\'s probe and passes the program\'s', () => {
    onPlatform('win32')
    const s = create()
    // ConPTY's probe: the host answers it, and the window watching answers it again.
    ptys[0].data('\x1b[6n\x1b[c')
    expect(ptys[0].write).toHaveBeenCalledWith('\x1b[?1;2c')
    sm.input(s.id, Buffer.from('\x1b[1;1R\x1b[?1;2c'))
    expect(sentToProgram(ptys[0])).toBe('')
    // ConPTY has let the program go; it asks before printing anything, and gets its answer.
    ptys[0].data('\x1b[?1049h\x1b[3;7H\x1b[6n')
    sm.input(s.id, Buffer.from('\x1b[3;7R'))
    expect(sentToProgram(ptys[0])).toBe('\x1b[3;7R')
  })

  it('on Windows with no window yet, never answers ConPTY\'s cursor question but answers the program\'s', async () => {
    onPlatform('win32')
    watched = false
    const s = create()
    ptys[0].data('\x1b[6n\x1b[c')
    await sm.snapshot(s.id)
    // Only the host's own answer to ConPTY: its question about the cursor stays unanswered.
    expect(sentToProgram(ptys[0])).toBe('')
    ptys[0].data('\x1b[?1049h\x1b[3;7H\x1b[6n')
    await sm.snapshot(s.id)
    expect(sentToProgram(ptys[0])).toBe('\x1b[3;7R')
  })
})

describe('names a session after what it is asked', () => {
  const agent = (): Session => sm.create({ projectPath: dir, presetId: 'claude', cols: 80, rows: 24, launch: { command: process.execPath, args: [], hooks: false } })
  const type = (id: string, text: string): void => sm.input(id, Buffer.from(text))
  const title = (id: string) => sm.list().find((s) => s.id === id)!

  it('takes an agent\'s first prompt, past slash commands and menu answers', () => {
    const s = agent()
    type(s.id, '/model\r')
    type(s.id, '2\r')
    expect(title(s.id).titleSource).toBe('none')
    type(s.id, 'fix the login bug\r')
    expect(title(s.id)).toMatchObject({ title: 'fix the login bug', titleSource: 'input' })
    type(s.id, 'and add a test\r')
    expect(title(s.id).title).toBe('fix the login bug')
  })

  it('waits for the prompt when the agent is started by hand in a shell', () => {
    const s = create()
    type(s.id, 'claude\r')
    expect(title(s.id).titleSource).toBe('none')
    type(s.id, 'explain the host\r')
    expect(title(s.id).title).toBe('explain the host')
  })

  it('lets a fresh conversation name the session again, but never a name you gave it', () => {
    const s = agent()
    type(s.id, 'fix the login bug\r')
    type(s.id, '/clear\r')
    type(s.id, 'write the release notes\r')
    expect(title(s.id).title).toBe('write the release notes')
    sm.rename(s.id, 'Mine')
    type(s.id, '/new\r')
    type(s.id, 'something else\r')
    expect(title(s.id)).toMatchObject({ title: 'Mine', titleSource: 'user' })
  })
})

describe('picks a Claude Code conversation back up only when there is one', () => {
  const claudeSession = async (saved: boolean): Promise<Session> => {
    const config = path.join(dir, 'claude')
    const s = sm.create({ projectPath: dir, presetId: 'claude', cols: 80, rows: 24,
      launch: { command: process.execPath, args: ['--session-id', '{sessionId}'], resumeArgs: ['--resume', '{sessionId}'], env: { CLAUDE_CONFIG_DIR: config }, hooks: true } })
    if (saved) {
      await fs.mkdir(path.join(config, 'projects', 'p'), { recursive: true })
      await fs.writeFile(path.join(config, 'projects', 'p', `${s.agent.sessionId}.jsonl`), '{}\n')
    }
    return s
  }
  const lastArgs = (): string => JSON.stringify(ptys.at(-1).args)

  it('resumes a conversation that was saved', async () => {
    const s = await claudeSession(true)
    sm.restart(s.id)
    expect(lastArgs()).toContain('--resume')
    expect(lastArgs()).not.toContain('--session-id')
  })

  it('starts over, with the same id, when no prompt ever saved one', async () => {
    const s = await claudeSession(false)
    sm.restart(s.id)
    expect(lastArgs()).toContain('--session-id')
    expect(lastArgs()).not.toContain('--resume')
    expect(lastArgs()).toContain(s.agent.sessionId!)
  })
})

describe('a name kept from an earlier version', () => {
  const saved = (over: Partial<Session>): Session => ({ id: randomId(), projectPath: dir, presetId: 'shell', title: '', titleSource: 'none', pinned: false,
    order: 0, createdAt: 0, updatedAt: 0, status: 'exited', statusAt: 0, alive: false, cols: 80, rows: 24, agent: {},
    launch: { command: process.execPath, args: [], hooks: false }, ...over } as Session)
  let n = 0
  const randomId = (): string => `kept-${++n}`
  const reload = async (sessions: Session[]): Promise<Session[]> => {
    await fs.writeFile(path.join(dir, 'state.json'), JSON.stringify({ version: 1, sessions }))
    const again = new SessionManager({ stateFile: path.join(dir, 'state.json'), logDir: path.join(dir, 'logs'), hooksDir: path.join(dir, 'hooks'),
      binDir: path.join(dir, 'bin'), hookUrl: () => 'http://127.0.0.1:1/hooks', mcpUrl: () => 'http://127.0.0.1:1/mcp', scrollback: 5000, baseEnv: process.env })
    again.load()
    return again.list()
  }

  it('goes when today it would not be taken, and stays otherwise', async () => {
    const [codex, typed, prompt, mine] = await reload([
      saved({ presetId: 'codex', title: '! ] Action Required', titleSource: 'osc' }),
      saved({ title: 'claude --dangerously-skip-permissions', titleSource: 'input' }),
      saved({ presetId: 'codex', title: 'fix the overlay banner', titleSource: 'input' }),
      saved({ title: 'Action Required', titleSource: 'user' })
    ])
    expect(codex).toMatchObject({ title: '', titleSource: 'none' })
    expect(typed).toMatchObject({ title: '', titleSource: 'none' })
    expect(prompt).toMatchObject({ title: 'fix the overlay banner', titleSource: 'input' })
    expect(mine).toMatchObject({ title: 'Action Required', titleSource: 'user' })
  })
})

describe('the folder a shell is in', () => {
  it('follows what the shell reports, and forgets it with the process', () => {
    const s = create()
    ptys[0].data('\x1b]7;file://host/Users/me/app\x07$ ')
    expect(sm.list().find((x) => x.id === s.id)!.cwd).toBe('/Users/me/app')
    ptys[0].data('\x1b]9;9;C:\\work\\landing\x1b\\PS> ')
    expect(sm.list().find((x) => x.id === s.id)!.cwd).toBe('C:\\work\\landing')
    sm.restart(s.id)
    expect(sm.list().find((x) => x.id === s.id)!.cwd).toBeUndefined()
  })

  it('starts a split pane where it was split from, under the same project', async () => {
    const deeper = path.join(dir, 'frontend_voucher_landing')
    await fs.mkdir(deeper)
    const s = sm.create({ projectPath: dir, presetId: 'shell', cols: 80, rows: 24, startDir: deeper, launch: { command: process.execPath, args: [], hooks: false } })
    expect(ptys.at(-1).cwd).toBe(deeper)
    expect(s.projectPath).toBe(dir)
    // Gone since: the project's folder instead of a shell that cannot start.
    await fs.rm(deeper, { recursive: true })
    sm.restart(s.id)
    expect(ptys.at(-1).cwd).toBe(dir)
  })
})

describe('picks a Codex conversation back up', () => {
  const codex = async (home: string): Promise<Session> =>
    sm.create({ projectPath: dir, presetId: 'codex', cols: 80, rows: 24,
      launch: { command: process.execPath, args: [], resumeArgs: ['resume', '{sessionId}'], env: { CODEX_HOME: home }, hooks: false } })
  const write = async (home: string, id: string, cwd: string): Promise<void> => {
    const d = new Date()
    const folder = path.join(home, 'sessions', String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0'))
    await fs.mkdir(folder, { recursive: true })
    await fs.writeFile(path.join(folder, `rollout-x-${id}.jsonl`), JSON.stringify({ type: 'session_meta', payload: { id, timestamp: d.toISOString(), cwd } }) + '\n')
  }
  const lastArgs = (): string => JSON.stringify(ptys.at(-1).args)

  it('notes the conversation as a turn ends, and resumes it on restart', async () => {
    const home = path.join(dir, 'codex-home')
    const s = await codex(home)
    await write(home, 'thread-1', dir)
    const l = (sm as any).live.get(s.id)
    ;(sm as any).apply(l, { kind: 'busy', busy: true })
    ;(sm as any).apply(l, { kind: 'busy', busy: false })
    expect(sm.list().find((x) => x.id === s.id)!.agent.sessionId).toBe('thread-1')
    sm.restart(s.id)
    expect(lastArgs()).toContain('resume')
    expect(lastArgs()).toContain('thread-1')
  })

  it('finds it at restart when no turn was caught, and starts fresh when there is none', async () => {
    const home = path.join(dir, 'codex-home')
    const s = await codex(home)
    sm.restart(s.id)
    expect(lastArgs()).not.toContain('resume')
    await write(home, 'thread-2', dir)
    sm.restart(s.id)
    expect(lastArgs()).toContain('thread-2')
  })

  it('never puts two panes on one conversation', async () => {
    const home = path.join(dir, 'codex-home')
    const a = await codex(home)
    await write(home, 'thread-a', dir)
    sm.restart(a.id)
    const b = await codex(home)
    sm.restart(b.id)
    expect(sm.list().find((x) => x.id === b.id)!.agent.sessionId).toBeUndefined()
    expect(lastArgs()).not.toContain('thread-a')
  })
})
