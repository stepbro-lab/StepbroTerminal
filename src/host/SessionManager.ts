import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import * as nodePty from 'node-pty'
import { Terminal as HeadlessTerminal } from '@xterm/headless'
import { SerializeAddon } from '@xterm/addon-serialize'
import type { CreateSessionOpts, HostStats, LiveClaude, Session, SessionStats } from '@shared/types'
import { TitleCapture, detectAgentFromCommand } from './titleCapture'
import { OscTitleParser, isBoringTitle, stripTitleGlyph } from './oscTitle'
import { reduceStatus, type ReducerEvent } from './statusReducer'
import { applyAgentWrap, findOnPath, posixShellWithAgents, ptyEnv, resolveCommand, shellArgsWithAgents, substituteArgs, writeHooksSettings, writeMcpConfig, type AgentWrap } from './launch'
import { describeSpawnEnv } from './ptyHelper'
import { findAncestor, processTable } from './procTree'
import { log } from './log'
import { waitingForApproval } from './screenPrompts'
import { conptyReply, isControlOnly, stripProbeReplies } from './conptyReply'
import { isOwnEndpoint, previewUrlIn } from './previewUrl'

export interface SessionManagerOpts {
  stateFile: string
  logDir: string
  hooksDir: string
  hookUrl: (sessionId: string) => string
  /** Where the posix shims live; goes first on PATH inside every session. */
  binDir: string
  /** The per-session MCP endpoint (notes tools) for agents that take one. */
import { CpuMeter, readProcesses, subtree } from './procStats'
  mcpUrl: (sessionId: string) => string
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
  /** From a launch configuration: typed into the pane once it first settles, then forgotten. */
  runOnStart?: string
  /** ConPTY is still probing the terminal (nothing printable yet); the host answers and views must not. */
  probing: boolean
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
  // ---- resource use ----

  private cpu = new CpuMeter()

  /** What every live session and the host itself use right now; CPU is measured between two calls. */
  async stats(): Promise<HostStats> {
    const procs = await readProcesses()
    const now = Date.now()
    const seen = new Set<number>([process.pid])
    const sessions: SessionStats[] = []
    for (const l of this.live.values()) {
      if (!l.s.alive || !l.s.pid) continue
      const tree = subtree(procs, l.s.pid)
      let cpu = 0
      let memory = 0
      for (const p of tree) {
        seen.add(p.pid)
        cpu += this.cpu.rate(p, now)
        memory += p.rss
      }
      sessions.push({ id: l.s.id, pid: l.s.pid, processes: tree.length, cpu, memory })
    }
    const self = procs.get(process.pid)
    const cpu = self ? this.cpu.rate(self, now) : 0
    this.cpu.keepOnly(seen)
    return { pid: process.pid, memory: process.memoryUsage().rss, cpu, sessions, sessionsOnDisk: this.live.size, scrollbackBytes: this.scrollbackOnDisk(), at: now }
  }

  private scrollbackOnDisk(): number {
    let total = 0
    try {
      for (const name of fs.readdirSync(this.opts.logDir)) {
        try {
          total += fs.statSync(path.join(this.opts.logDir, name)).size
        } catch {
          /* gone between readdir and stat */
        }
      }
    } catch {
      /* no log dir yet */
    }
    return total
  }

    for (const s of parsed.sessions ?? []) {
      if (!s || typeof s.id !== 'string' || !s.launch) continue
      const wasAlive = s.alive
      s.alive = false
      s.pid = undefined
      if (wasAlive || s.status === 'working' || s.status === 'attention' || s.status === 'starting') s.status = 'exited'
      // A start error belonged to the previous run. Do not carry it into a fresh host, or an
      // update would greet the user with a red banner and a Retry for a session they never touched.
      if (s.status === 'error') s.status = 'exited'
      s.error = undefined
      s.errorDetail = undefined
      s.agent = s.agent ?? {}
      s.agent.registryPid = undefined
      // Recompute every load so it never persists stale: true only for sessions the host lost while alive.
      s.leftRunning = wasAlive
      if (typeof s.order !== 'number') s.order = s.createdAt
      if (s.previewUrl && isOwnEndpoint(s.previewUrl)) s.previewUrl = undefined
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
      order: now,
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
    l.runOnStart = opts.runOnStart?.trim() || undefined
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
    let text = Buffer.from(bytes).toString('utf8')
    if (l.probing) {
      // A view attached while the shell starts answers ConPTY's probes as well (a restored
      // session does: its pane is on screen before the shell is respawned). The host has already
      // answered, and a second answer reaches the shell as typed text, "[?1;2c" at the prompt.
      text = stripProbeReplies(text)
      if (!text) return
      bytes = Buffer.from(text, 'utf8')
    }
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
      // Lines typed into an agent are prompts worth remembering; the launch command itself is not.
      const isAgent = l.s.launch.hooks || !!l.s.agent.detectedPreset || l.s.presetId !== 'shell'
      if (isAgent && !agent && line.length >= 2) {
        this.emit('prompt', {
          ts: Date.now(),
          sessionId: l.s.id,
          projectPath: l.s.projectPath,
          presetId: l.s.agent.detectedPreset ?? l.s.presetId,
          text: line
        })
      }
    }
    l.pty.write(text)
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

  /** Numbers the given sessions 0, 1, 2… so the sidebar shows them in this order. */
  reorder(ids: string[]): void {
    ids.forEach((id, i) => {
      const l = this.live.get(id)
      if (!l || l.s.order === i) return
      l.s.order = i
      this.emitSession(l)
    })
  }

  viewed(id: string): void {
    const l = this.live.get(id)
    if (!l) return
    this.apply(l, { kind: 'viewed' })
  }

  // ---- agent awareness ----

  /**
   * Types `text` into session `to` for `from`, presses Enter when asked, and tells clients so they
   * can show it travelling. `suffix` is typed too but stays out of the title an untitled shell
   * takes from its first line: it is the request to report back, not the task.
   */
  handoff(from: string, to: string, text: string, submit: boolean, opts: { suffix?: string; titled?: boolean } = {}): void {
    const l = this.live.get(to)
    if (!l?.pty) return
    const body = text.replace(/\r?\n/g, '\n')
    // A task names an untitled session; a message passing through it does not.
    if (opts.titled === false) l.pty.write(body)
    else this.input(to, Buffer.from(body, 'utf8'))
    if (opts.suffix) l.pty.write(opts.suffix)
    // Agents' TUIs treat a burst of input as a paste and fold an Enter that arrives inside the
    // burst into it, so the text never gets submitted (Codex showed "[Pasted Content]" and sat
    // there). Enter comes once the burst is well over. Bracketed-paste markers are not an option:
    // ConPTY hands them to the program as stray characters.
    if (submit) setTimeout(() => this.input(to, Buffer.from('\r')), 900)
    this.emit('handoff', { from, to, text })
  }

  /** The last `max` lines on a session's screen, scrollback included, without the blank tail. */
  async screenLines(id: string, max: number): Promise<string[]> {
    const l = this.live.get(id)
    if (!l) return []
    await l.drained
    if (!this.live.has(id)) return []
    const buf = l.screen.buffer.active
    const row = (y: number): string => buf.getLine(y)?.translateToString(true) ?? ''
    // A fresh screen has its text at the top and blank rows below; count from the last written row.
    let last = buf.baseY + l.screen.rows - 1
    while (last >= 0 && !row(last).trim()) last--
    const lines: string[] = []
    for (let y = Math.max(0, last - max + 1); y <= last; y++) lines.push(row(y))
    return lines
  }

  /** `stepSessionId` comes from the per-session hook URL; older settings files only carry the agent's own id. */
  applyHook(agentSessionId: string, name: string, payload: Record<string, unknown>, stepSessionId?: string): void {
    const l = (stepSessionId && this.live.get(stepSessionId)) || [...this.live.values()].find((x) => x.s.agent.sessionId === agentSessionId)
    if (!l) return
    if (!l.s.launch.hooks) {
      // An agent the user started by hand inside this shell: its hooks run the status while it lives.
      l.s.agent.hooked = name !== 'SessionEnd'
    }
    if (name === 'PostToolUse') this.noteEditedFile(l, payload)
    this.apply(l, { kind: 'hook', name, payload })
  }

  private noteEditedFile(l: Live, payload: Record<string, unknown>): void {
    const tool = String(payload['tool_name'] ?? '')
    if (!/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(tool)) return
    const input = payload['tool_input'] as Record<string, unknown> | undefined
    const file = input?.['file_path'] ?? input?.['notebook_path']
    if (typeof file !== 'string' || !file) return
    const list = (l.s.agent.changedFiles ?? []).filter((f) => f !== file)
    list.push(file)
    l.s.agent.changedFiles = list.slice(-200)
    this.emitSession(l)
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
          if (e.status && !l.s.agent.hooked) this.apply(l, { kind: 'registry', status: e.status })
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
          if (busy && !l.s.agent.hooked) this.apply(l, { kind: 'registry', status: e.status! })
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
      paused: false,
      probing: false
    }
  }

  private spawn(l: Live, resume: boolean): void {
    const s = l.s
    const now = Date.now()
    s.status = 'starting'
    s.statusAt = now
    s.updatedAt = now
    s.error = undefined
    s.leftRunning = false
    const env = ptyEnv(this.opts.baseEnv, { ...(s.launch.env ?? {}), STEP_SESSION_ID: s.id })
    const sessionId = s.agent.sessionId ?? s.id
    // Every session gets its hook and notes files. Agents started from the menu take them as
    // arguments; agents the user types inside a shell pick them up through the shell itself.
    const tryWrite = (what: string, fn: () => string): string => {
      try {
        return fn()
      } catch (e) {
        log(`${what} write failed`, e)
        return ''
      }
    }
    const hooksSettings = tryWrite('hooks settings', () => writeHooksSettings(this.opts.hooksDir, s.id, this.opts.hookUrl(s.id)))
    const mcpUrl = this.opts.mcpUrl(s.id)
    const mcpConfig = tryWrite('mcp config', () => writeMcpConfig(this.opts.hooksDir, s.id, mcpUrl))
    const template = resume && s.launch.resumeArgs ? s.launch.resumeArgs : s.launch.args
    const args = substituteArgs(template, { sessionId, hooksSettings, mcpConfig, mcpUrl })
    // Resolve against the plain PATH, before the shims go in front of it.
    const resolved = resolveCommand(s.launch.command, env)
    const wrap: AgentWrap = { hooksSettings, mcpConfig, mcpUrl, claude: findOnPath('claude', env), codex: findOnPath('codex', env) }
    if (!resolved) {
      s.status = 'error'
      s.error = `Command not found: ${s.launch.command}`
      s.alive = false
      this.persist()
      return
    }
    let p: nodePty.IPty
    try {
      applyAgentWrap(env, wrap, this.opts.binDir)
      const full = [...resolved.argsPrefix, ...args]
      const shellArgs = process.platform === 'win32' ? shellArgsWithAgents(resolved.file, full, wrap) : posixShellWithAgents(resolved.file, full, wrap, env, this.opts.binDir)
      p = nodePty.spawn(resolved.file, shellArgs, {
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
      const detail = [`Failed to start ${resolved.file}: ${e?.message ?? e}`, `cwd=${s.projectPath}`, describeSpawnEnv()].join('\n')
      log('session spawn failed\n' + detail)
      s.status = 'error'
      s.error = `Failed to start: ${e?.message ?? e}`
      s.errorDetail = detail
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
    // Answer ConPTY's startup probes so the shell does not sit blocked for ~3s. The window closes
    // on the first printable output; while it is open, input() also drops the replies a view sends.
    l.probing = true
    p.onData((data) => {
      if (l.pty !== p) return
      if (l.probing) {
        // Answer ConPTY's probes only while nothing printable has arrived yet: the shell is still
        // blocked waiting, and ConPTY consumes the reply. The moment real output shows (the prompt),
        // the shell is interactive; injecting a reply then would land it at the prompt and PSReadLine
        // would read "[?1;2c" as typed input and ring the bell. So close the window without answering.
        if (isControlOnly(data)) {
          const reply = conptyReply(data)
          if (reply) p.write(reply)
        } else {
          l.probing = false
        }
      }
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
    this.spotPreviewUrl(l, data)
    const now = Date.now()
    if (!l.burstStart) l.burstStart = now
    if (now - l.burstStart >= BUSY_AFTER_MS) this.apply(l, { kind: 'output' })
    if (l.quietTimer) clearTimeout(l.quietTimer)
    l.quietTimer = setTimeout(() => {
      l.quietTimer = undefined
      l.burstStart = 0
      this.apply(l, { kind: 'quiet' })
      this.typeStartCommand(l)
      void this.lookAtScreen(l)
    }, QUIET_MS)
  }

  /**
   * A launch configuration's start text goes in only once the pane has settled: after its first
   * quiet spell, and never while it is working or asking something. Each line gets its own Enter.
   */
  private typeStartCommand(l: Live): void {
    const text = l.runOnStart
    if (!text || !l.pty || !l.s.alive) return
    const st = l.s.status
    if (st === 'working' || st === 'attention' || st === 'exited' || st === 'error') return
    l.runOnStart = undefined
    let burst = ''
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim()
      if (t) burst += t + '\r'
    }
    if (burst) l.pty.write(burst)
  }

  /** Agents without hooks only show their permission questions on screen; look once output settles. */
  private async lookAtScreen(l: Live): Promise<void> {
    const s = l.s
    if (s.launch.hooks || s.agent.registryPid || !s.alive) return
    if (!s.agent.detectedPreset && s.presetId === 'shell') return
    await l.drained
    if (!this.live.has(s.id)) return
    // The whole visible screen: the question sits wherever the program's live area is.
    const buf = l.screen.buffer.active
    const lines: string[] = []
    for (let y = buf.baseY; y < buf.baseY + l.screen.rows; y++) lines.push(buf.getLine(y)?.translateToString(true) ?? '')
    this.apply(l, { kind: 'screen', waiting: waitingForApproval(lines) })
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

  /** Dev servers print their address; keep the latest local URL so the UI can offer a preview. */
  private spotPreviewUrl(l: Live, data: string): void {
    const url = previewUrlIn(data, this.ownPort())
    if (!url || l.s.previewUrl === url) return
    l.s.previewUrl = url
    this.emitSession(l)
  }

  /** The port of the host's own HTTP endpoints, so their URLs never pass for a dev server. */
  private ownPort(): number | undefined {
    try {
      return Number(new URL(this.opts.hookUrl('x')).port) || undefined
    } catch {
      return undefined
    }
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
