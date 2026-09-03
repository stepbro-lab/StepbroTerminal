import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import * as nodePty from 'node-pty'
import { Terminal as HeadlessTerminal } from '@xterm/headless'
import { SerializeAddon } from '@xterm/addon-serialize'
import type { CreateSessionOpts, LiveClaude, Session } from '@shared/types'
import { TitleCapture, detectAgentFromCommand } from './titleCapture'
import { OscTitleParser, isBoringTitle, stripTitleGlyph } from './oscTitle'
import { reduceStatus, type ReducerEvent } from './statusReducer'
import { ptyEnv, resolveCommand, substituteArgs, writeHooksSettings } from './launch'
import { findAncestor, processTable } from './procTree'
import { log } from './log'

export interface SessionManagerOpts {
  stateFile: string
  logDir: string
  hooksDir: string
  hookUrl: () => string
  scrollback: number
  baseEnv: NodeJS.ProcessEnv
}

interface Live {
  s: Session
  pty?: nodePty.IPty
  /** Server-side emulator: the source of truth for what is on screen while nobody is attached. */
  screen: HeadlessTerminal
  serializer: SerializeAddon
  /** Resolves when every byte handed to the emulator has been parsed. */
  drained: Promise<void>
  lines: TitleCapture
  osc: OscTitleParser
  quietTimer?: NodeJS.Timeout
  /** When the current burst of output started; reset after QUIET_MS of silence. */
  burstStart: number
  logFd?: number
  logBytes: number
  paused: boolean
}

const QUIET_MS = 1500
/** Output must keep flowing this long before a plain shell shows as working. */
const BUSY_AFTER_MS = 400
const LOG_MAX = 8 * 1024 * 1024
const LOG_KEEP = 2 * 1024 * 1024

/**
 * Owns every PTY, its screen state and its status. Emits:
 * 'session' (Session) · 'removed' (id) · 'output' (id, bytes) · 'clear' (id) · 'exit' (id, code)
 */
export class SessionManager extends EventEmitter {
  private live = new Map<string, Live>()
  private persistTimer?: NodeJS.Timeout
  private registryBusy = false
  private registryDirty: LiveClaude[] | null = null

  constructor(private readonly opts: SessionManagerOpts) {
    super()
    fs.mkdirSync(opts.logDir, { recursive: true })
    fs.mkdirSync(opts.hooksDir, { recursive: true })
  }

  // ---- queries ----

  list(): Session[] {
    return [...this.live.values()].map((l) => l.s)
  }

  get(id: string): Session | undefined {
    return this.live.get(id)?.s
  }

  hasAlive(): boolean {
    for (const l of this.live.values()) if (l.s.alive) return true
    return false
  }

  /** Serialized screen plus scrollback as escape sequences; replaying it reproduces the display exactly. */
  async snapshot(id: string): Promise<Uint8Array> {
    const l = this.live.get(id)
    if (!l) return new Uint8Array(0)
    await l.drained
    try {
      return Buffer.from(l.serializer.serialize({ scrollback: this.opts.scrollback }), 'utf8')
    } catch (e) {
      log('serialize failed', id, e)
      return new Uint8Array(0)
    }
  }

  // ---- persistence ----

  load(): void {
    let raw: string
    try {
      raw = fs.readFileSync(this.opts.stateFile, 'utf8')
    } catch {
      return
    }
    let parsed: { sessions?: Session[] }
    try {
      parsed = JSON.parse(raw)
    } catch (e) {
      log('state.json unreadable, starting empty', e)
      return
    }
    for (const s of parsed.sessions ?? []) {
      if (!s || typeof s.id !== 'string' || !s.launch) continue
      const wasAlive = s.alive
      s.alive = false
      s.pid = undefined
      if (wasAlive || s.status === 'working' || s.status === 'attention' || s.status === 'starting') s.status = 'exited'
      s.agent = s.agent ?? {}
      s.agent.registryPid = undefined
      const l = this.newLive(s)
      this.replayLogTail(l)
      this.live.set(s.id, l)
    }
  }

  persistNow(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer)
    this.persistTimer = undefined
    const data = { version: 1, sessions: this.list() }
    const tmp = this.opts.stateFile + '.tmp'
    try {
      fs.writeFileSync(tmp, JSON.stringify(data))
      fs.renameSync(tmp, this.opts.stateFile)
    } catch (e) {
      log('persist failed', e)
    }
  }

  private persist(): void {
    if (this.persistTimer) return
    this.persistTimer = setTimeout(() => this.persistNow(), 200)
  }

  // ---- lifecycle ----

  create(opts: CreateSessionOpts): Session {
    const now = Date.now()
    const id = randomUUID()
    const s: Session = {
      id,
      projectPath: opts.projectPath,
      presetId: opts.presetId,
      title: opts.title ?? '',
      titleSource: opts.title ? 'history' : 'none',
      pinned: false,
      createdAt: now,
      updatedAt: now,
      status: 'starting',
      statusAt: now,
      alive: false,
      cols: opts.cols || 80,
      rows: opts.rows || 24,
      agent: { sessionId: opts.agentSessionId ?? (opts.launch.hooks ? id : undefined) },
      launch: opts.launch
    }
    const l = this.newLive(s)
    this.live.set(id, l)
    this.spawn(l, !!opts.resume)
    this.emitSession(l)
    return s
  }

  restart(id: string): void {
    const l = this.live.get(id)
    if (!l) return
    if (l.pty) {
      const old = l.pty
      l.pty = undefined
      try {
        old.kill()
      } catch {
        /* already gone */
      }
    }
    l.screen.reset()
    l.lines.reset()
    l.s.exitCode = undefined
    l.s.error = undefined
    l.s.agent.tool = undefined
    l.s.agent.registryPid = undefined
    if (l.s.titleSource === 'osc' || l.s.titleSource === 'input') {
      l.s.title = ''
      l.s.titleSource = 'none'
    }
    this.truncateLog(l, true)
    this.emit('clear', id)
    const canResume = !!l.s.launch.resumeArgs && !!l.s.agent.sessionId
    this.spawn(l, canResume)
    this.emitSession(l)
  }

  kill(id: string): void {
    const l = this.live.get(id)
    if (!l?.pty) return
    try {
      l.pty.kill()
    } catch {
      /* already gone */
    }
  }

  close(id: string): void {
    const l = this.live.get(id)
    if (!l) return
    if (l.pty) {
      const p = l.pty
      l.pty = undefined
      try {
        p.kill()
      } catch {
        /* already gone */
      }
    }
    if (l.quietTimer) clearTimeout(l.quietTimer)
    if (l.logFd !== undefined) {
      try {
        fs.closeSync(l.logFd)
      } catch {
        /* ignore */
      }
    }
    try {
      l.screen.dispose()
    } catch {
      /* ignore */
    }
    this.live.delete(id)
    for (const f of [this.logPath(id), path.join(this.opts.hooksDir, `${id}.json`)]) {
      try {
        fs.rmSync(f, { force: true })
      } catch {
        /* ignore */
      }
    }
    this.emit('removed', id)
    this.persist()
  }

  // ---- io ----

  input(id: string, bytes: Uint8Array): void {
    const l = this.live.get(id)
    if (!l?.pty) return
    const line = l.lines.feed(bytes)
    if (line) {
      if (l.s.titleSource === 'none') {
        l.s.title = line
        l.s.titleSource = 'input'
        this.emitSession(l)
      }
      const agent = detectAgentFromCommand(line)
      if (agent && agent !== l.s.agent.detectedPreset && !l.s.launch.hooks) {
        l.s.agent.detectedPreset = agent
        this.emitSession(l)
      }
    }
    l.pty.write(Buffer.from(bytes).toString('utf8'))
  }

  resize(id: string, cols: number, rows: number): void {
    const l = this.live.get(id)
    if (!l) return
    if (cols < 2 || rows < 1 || cols > 1000 || rows > 1000) return
    if (l.s.cols === cols && l.s.rows === rows) return
    l.s.cols = cols
    l.s.rows = rows
    try {
      l.screen.resize(cols, rows)
    } catch (e) {
      log('screen resize failed', id, e)
    }
    if (l.pty) {
      try {
        l.pty.resize(cols, rows)
      } catch (e) {
        log('pty resize failed', id, e)
      }
    }
  }

  pause(id: string): void {
    const l = this.live.get(id)
    if (!l?.pty || l.paused) return
    l.paused = true
    try {
      l.pty.pause()
    } catch {
      /* not supported */
    }
  }

  resume(id: string): void {
    const l = this.live.get(id)
    if (!l?.pty || !l.paused) return
    l.paused = false
    try {
      l.pty.resume()
    } catch {
      /* not supported */
    }
  }

  // ---- metadata ----

  rename(id: string, title: string): void {
    const l = this.live.get(id)
    if (!l) return
    const t = title.trim()
    if (t) {
      l.s.title = t.slice(0, 120)
      l.s.titleSource = 'user'
    } else {
      l.s.title = ''
      l.s.titleSource = 'none'
    }
    this.emitSession(l)
  }

  pin(id: string, pinned: boolean): void {
    const l = this.live.get(id)
    if (!l) return
    l.s.pinned = pinned
    this.emitSession(l)
  }

  viewed(id: string): void {
    const l = this.live.get(id)
    if (!l) return
    this.apply(l, { kind: 'viewed' })
  }

  // ---- agent awareness ----

  applyHook(agentSessionId: string, name: string, payload: Record<string, unknown>): void {
    for (const l of this.live.values()) {
      if (l.s.agent.sessionId !== agentSessionId) continue
      this.apply(l, { kind: 'hook', name, payload })
      return
    }
  }

  /** Maps Claude Code registry entries (claude typed inside a Step shell) to sessions and applies their status. */
  async applyRegistry(entries: LiveClaude[]): Promise<void> {
    if (this.registryBusy) {
      this.registryDirty = entries
      return
    }
    this.registryBusy = true
    try {
      const byPid = new Map(entries.map((e) => [e.pid, e]))
      // Update or clear already-mapped sessions.
      for (const l of this.live.values()) {
        const pid = l.s.agent.registryPid
        if (!pid) continue
        const e = byPid.get(pid)
        if (e) {
          if (e.status) this.apply(l, { kind: 'registry', status: e.status })
          byPid.delete(pid)
        } else {
          l.s.agent.registryPid = undefined
          l.s.agent.detectedPreset = undefined
          l.s.agent.tool = undefined
          if (l.s.status === 'working' || l.s.status === 'attention' || l.s.status === 'done') l.s.status = 'idle'
          this.emitSession(l)
        }
      }
      // Map new entries through the process tree.
      const candidates = new Map<number, Live>()
      for (const l of this.live.values()) if (l.s.alive && l.s.pid && !l.s.launch.hooks && !l.s.agent.registryPid) candidates.set(l.s.pid, l)
      const unmapped = [...byPid.values()].filter((e) => !this.isKnownAgentSession(e.sessionId))
      if (unmapped.length && candidates.size) {
        const table = await processTable()
        const pids = new Set(candidates.keys())
        for (const e of unmapped) {
          const anc = findAncestor(table, e.pid, pids)
          if (anc === null) continue
          const l = candidates.get(anc)!
          candidates.delete(anc)
          pids.delete(anc)
          l.s.agent.registryPid = e.pid
          l.s.agent.sessionId = e.sessionId
          l.s.agent.detectedPreset = 'claude'
          log('mapped claude', e.pid, '->', l.s.id)
          // A freshly mapped agent that is not busy is simply idle; "done" is reserved for finished turns.
          const busy = /busy|working|running/i.test(e.status ?? '')
          if (busy) this.apply(l, { kind: 'registry', status: e.status! })
          else {
            l.s.status = 'idle'
            l.s.statusAt = Date.now()
            this.emitSession(l)
          }
        }
      }
    } catch (e) {
      log('applyRegistry failed', e)
    } finally {
      this.registryBusy = false
      if (this.registryDirty) {
        const next = this.registryDirty
        this.registryDirty = null
        void this.applyRegistry(next)
      }
    }
  }

  private isKnownAgentSession(agentSessionId: string): boolean {
    for (const l of this.live.values()) if (l.s.agent.sessionId === agentSessionId && l.s.launch.hooks) return true
    return false
  }

  // ---- internals ----

  private newLive(s: Session): Live {
    const screen = new HeadlessTerminal({
      cols: s.cols || 80,
      rows: s.rows || 24,
      scrollback: this.opts.scrollback,
      allowProposedApi: true
    })
    const serializer = new SerializeAddon()
    screen.loadAddon(serializer as any)
    return {
      s,
      screen,
      serializer,
      drained: Promise.resolve(),
      lines: new TitleCapture(60),
      osc: new OscTitleParser(),
      burstStart: 0,
      logBytes: 0,
      paused: false
    }
  }

  private spawn(l: Live, resume: boolean): void {
    const s = l.s
    const now = Date.now()
    s.status = 'starting'
    s.statusAt = now
    s.updatedAt = now
    s.error = undefined
    const env = ptyEnv(this.opts.baseEnv, { ...(s.launch.env ?? {}), STEP_SESSION_ID: s.id })
    const sessionId = s.agent.sessionId ?? s.id
    let hooksSettings = ''
    if (s.launch.hooks) {
      try {
        hooksSettings = writeHooksSettings(this.opts.hooksDir, s.id, this.opts.hookUrl())
      } catch (e) {
        log('hooks settings write failed', e)
      }
    }
    const template = resume && s.launch.resumeArgs ? s.launch.resumeArgs : s.launch.args
    const args = substituteArgs(template, { sessionId, hooksSettings })
    const resolved = resolveCommand(s.launch.command, env)
    if (!resolved) {
      s.status = 'error'
      s.error = `Command not found: ${s.launch.command}`
      s.alive = false
      this.persist()
      return
    }
    let p: nodePty.IPty
    try {
      p = nodePty.spawn(resolved.file, [...resolved.argsPrefix, ...args], {
        name: 'xterm-256color',
        cols: s.cols,
        rows: s.rows,
        cwd: s.projectPath,
        env,
        useConpty: true,
        // node-pty bundles a recent ConPTY (1.23+); the one in Windows misplaces the cursor with TUI apps.
        useConptyDll: true,
        conptyInheritCursor: true
      })
    } catch (e: any) {
      s.status = 'error'
      s.error = `Failed to start: ${e?.message ?? e}`
      s.alive = false
      this.persist()
      return
    }
    l.pty = p
    l.paused = false
    s.alive = true
    s.pid = p.pid
    s.exitCode = undefined
    this.openLog(l)
    p.onData((data) => {
      if (l.pty !== p) return
      this.onOutput(l, data)
    })
    p.onExit(({ exitCode }) => {
      if (l.pty !== p) return
      l.pty = undefined
      s.alive = false
      s.pid = undefined
      s.exitCode = exitCode
      if (l.quietTimer) clearTimeout(l.quietTimer)
      this.apply(l, { kind: 'exit', code: exitCode })
      this.emit('exit', s.id, exitCode)
    })
    this.persist()
  }

  private onOutput(l: Live, data: string): void {
    const bytes = Buffer.from(data, 'utf8')
    this.feedScreen(l, data)
    this.appendLog(l, bytes)
    this.emit('output', l.s.id, bytes)
    for (const t of l.osc.feed(bytes)) this.onOscTitle(l, t)
    const now = Date.now()
    if (!l.burstStart) l.burstStart = now
    if (now - l.burstStart >= BUSY_AFTER_MS) this.apply(l, { kind: 'output' })
    if (l.quietTimer) clearTimeout(l.quietTimer)
    l.quietTimer = setTimeout(() => {
      l.quietTimer = undefined
      l.burstStart = 0
      this.apply(l, { kind: 'quiet' })
    }, QUIET_MS)
  }

  private feedScreen(l: Live, data: string | Uint8Array): void {
    l.drained = new Promise<void>((resolve) => {
      try {
        l.screen.write(data as any, resolve)
      } catch (e) {
        log('screen write failed', l.s.id, e)
        resolve()
      }
    })
  }

  private onOscTitle(l: Live, title: string): void {
    const s = l.s
    if (s.titleSource === 'user') return
    const t = stripTitleGlyph(title)
    if (isBoringTitle(t)) return
    if (s.title === t && s.titleSource === 'osc') return
    s.title = t.slice(0, 120)
    s.titleSource = 'osc'
    this.emitSession(l)
  }

  private apply(l: Live, e: ReducerEvent): void {
    const patch = reduceStatus(l.s, e)
    if (!patch) return
    const s = l.s
    let changed = false
    if (patch.status && patch.status !== s.status) {
      s.status = patch.status
      s.statusAt = Date.now()
      changed = true
    }
    if (patch.agent) {
      for (const [k, v] of Object.entries(patch.agent)) {
        if ((s.agent as any)[k] !== v) {
          ;(s.agent as any)[k] = v
          changed = true
        }
      }
    }
    if (patch.error !== undefined && patch.error !== s.error) {
      s.error = patch.error
      changed = true
    }
    if (changed) this.emitSession(l)
  }

  private emitSession(l: Live): void {
    l.s.updatedAt = Date.now()
    this.emit('session', l.s)
    this.persist()
  }

  // ---- raw output log on disk (used to rebuild the screen after a host restart) ----

  private logPath(id: string): string {
    return path.join(this.opts.logDir, `${id}.log`)
  }

  private openLog(l: Live): void {
    if (l.logFd !== undefined) return
    try {
      const file = this.logPath(l.s.id)
      l.logFd = fs.openSync(file, 'a')
      l.logBytes = fs.fstatSync(l.logFd).size
    } catch (e) {
      log('open log failed', e)
      l.logFd = undefined
    }
  }

  private appendLog(l: Live, bytes: Buffer): void {
    if (l.logFd === undefined) return
    try {
      fs.writeSync(l.logFd, bytes)
      l.logBytes += bytes.length
      if (l.logBytes > LOG_MAX) this.truncateLog(l, false)
    } catch {
      /* disk issues are not fatal */
    }
  }

  private truncateLog(l: Live, clear: boolean): void {
    const file = this.logPath(l.s.id)
    try {
      if (l.logFd !== undefined) fs.closeSync(l.logFd)
      l.logFd = undefined
      if (clear) {
        fs.rmSync(file, { force: true })
      } else {
        const keep = this.readTail(file, LOG_KEEP)
        fs.writeFileSync(file, keep)
      }
    } catch {
      /* ignore */
    }
    if (l.pty) this.openLog(l)
  }

  private replayLogTail(l: Live): void {
    const tail = this.readTail(this.logPath(l.s.id), LOG_KEEP)
    if (tail.length) this.feedScreen(l, tail)
  }

  private readTail(file: string, max: number): Buffer {
    try {
      const st = fs.statSync(file)
      const size = Math.min(st.size, max)
      if (size === 0) return Buffer.alloc(0)
      const fd = fs.openSync(file, 'r')
      try {
        const out = Buffer.allocUnsafe(size)
        fs.readSync(fd, out, 0, size, st.size - size)
        return out
      } finally {
        fs.closeSync(fd)
      }
    } catch {
      return Buffer.alloc(0)
    }
  }
}
