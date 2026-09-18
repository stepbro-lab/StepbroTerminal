import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import * as nodePty from 'node-pty'
import { Terminal as HeadlessTerminal } from '@xterm/headless'
import { SerializeAddon } from '@xterm/addon-serialize'
import type { CreateSessionOpts, HostStats, LiveClaude, Session, SessionStats } from '@shared/types'
import { TitleCapture, detectAgentFromCommand } from './titleCapture'
import { OscTitleParser, isBoringTitle, isOwnNameTitle, stripTitleGlyph, withoutFolder } from './oscTitle'
import { projectName } from '@shared/paths'
import { reduceStatus, type ReducerEvent } from './statusReducer'
import {
  applyAgentWrap,
  findOnPath,
  posixShellWithAgents,
  ptyEnv,
  resolveCommand,
  shellArgsWithAgents,
  substituteArgs,
  writeHooksSettings,
  writeMcpConfig,
  writeOpencodeConfig,
  type AgentWrap
} from './launch'
import { describeSpawnEnv } from './ptyHelper'
import { findAncestor, processTable } from './procTree'
import { log } from './log'
import { CpuMeter, readProcesses, subtree } from './procStats'
import { busyMarkerFor, busyOnScreen, waitingForApproval } from './screenPrompts'
import { conptyReply, hasQuery, isControlOnly, stripProbeReplies, stripStaleReplies } from './conptyReply'
import { agentOf } from './handoff'
import { pacePieces } from './pace'
import { isOwnEndpoint, previewUrlIn } from './previewUrl'

export interface SessionManagerOpts {
  stateFile: string
  logDir: string
  hooksDir: string
  hookUrl: (sessionId: string) => string
  /** Where the posix shims live; goes first on PATH inside every session. */
  binDir: string
  /** The per-session MCP endpoint (notes tools) for agents that take one. */
  mcpUrl: (sessionId: string) => string
  /** The OpenCode plugin file, when it could be written; every session's OpenCode config points at it. */
  opencodePlugin?: string
  scrollback: number
  baseEnv: NodeJS.ProcessEnv
}

/** How long after asking the terminal about itself an answer is still worth passing on. */
const REPLY_WINDOW_MS = 2000

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
  /** A typed agent has been seen drawing on the alternate screen; its going away means the agent quit. */
  altSeen?: boolean
  /** When the screen was last read for whether a turn is running, and whether a read is under way. */
  busyLookAt?: number
  busyLooking?: boolean
  /** When the current burst of output started; reset after QUIET_MS of silence. */
  burstStart: number
  /** When the program last printed anything: a spinner still turning means it is not ready to be typed into. */
  lastOutputAt: number
  /** The size the pty was last told about, which is not always what the session record says. */
  ptyCols?: number
  ptyRows?: number
  logFd?: number
  logBytes: number
  paused: boolean
  /** From a launch configuration: typed into the pane once it first settles, then forgotten. */
  runOnStart?: string
  /** ConPTY is still probing the terminal (nothing printable yet); the host answers and views must not. */
  probing: boolean
  /** When the program last asked the terminal about itself; an answer after that is worth passing on. */
  askedAt?: number
}

/**
 * A held hand-off goes in once the agent is free and its screen has been still for this long: after
 * the Stop hook, Claude Code keeps a spinner turning while it runs its stop hooks, and what is
 * typed under it loses its head. Past HELD_MAX_WAIT_MS of a screen that never settles it goes in anyway.
 */
const HELD_QUIET_MS = 1000
// Stop hooks have been seen to take half a minute; the cap is for a screen that never settles.
const HELD_MAX_WAIT_MS = 60000
const HELD_POLL_MS = 250
/**
 * An agent gets a hand-off in pieces this big, this far apart. Claude Code reads its input a
 * kilobyte at a time and keeps only the last read of a burst that comes in one write (measured:
 * a 2.4 KB hand-off arrived as its final 332 bytes); pieces under a kilobyte, a beat apart, all
 * arrive, and each still reads as a paste to the TUI.
 */
const PIECE_BYTES = 900
const PIECE_GAP_MS = 150
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export type HandoffOutcome = 'typed' | 'held' | 'lost'

interface HeldHandoff {
  from: string
  text: string
  submit: boolean
  suffix?: string
  titled?: boolean
}

const QUIET_MS = 1500
/** Output must keep flowing this long before a plain shell shows as working. */
const BUSY_AFTER_MS = 400
/** How often the screen of an agent that never stops drawing is read for whether it is working. */
const BUSY_LOOK_MS = 700
const LOG_MAX = 8 * 1024 * 1024
const LOG_KEEP = 2 * 1024 * 1024

/**
 * Owns every PTY, its screen state and its status. Emits:
 * 'session' (Session) · 'removed' (id) · 'output' (id, bytes) · 'clear' (id) · 'exit' (id, code)
 */
export class SessionManager extends EventEmitter {
  private live = new Map<string, Live>()
  /** Hand-offs for agents that were busy when they arrived, typed once the agent is free. */
  private heldHandoffs = new Map<string, HeldHandoff[]>()
  private heldTimers = new Map<string, NodeJS.Timeout>()
  /** Sessions a hand-off is being typed into right now, piece by piece. */
  private typing = new Set<string>()
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

  /**
   * Puts a session away without losing it: the process ends, and the row moves under the folder's
   * archived ones with its screen and its conversation kept, so it can be restored later and pick
   * up where it was. Unarchiving brings it back exited; the client restarts it if it wants.
   */
  archive(id: string, archived: boolean): void {
    const l = this.live.get(id)
    if (!l || !!l.s.archived === archived) return
    l.s.archived = archived
    if (archived && l.pty) {
      // The exit that follows carries the flag along, so the row lands in the right place at once.
      this.kill(id)
    } else {
      this.emitSession(l)
    }
    this.persist()
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
    this.heldHandoffs.delete(id)
    this.typing.delete(id)
    const held = this.heldTimers.get(id)
    if (held) clearTimeout(held)
    this.heldTimers.delete(id)
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
    } else if (Date.now() - (l.askedAt ?? 0) > REPLY_WINDOW_MS) {
      // Nothing asked the terminal anything recently, so an answer arriving now is one the
      // window worked out for output it was catching up on, long after the program gave up
      // waiting. Passed on, the program reads it as typed text.
      const kept = stripStaleReplies(text)
      if (kept !== text) {
        if (!kept) return
        text = kept
        bytes = Buffer.from(text, 'utf8')
      }
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
        l.s.agent.lastPreset = agent
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

  /**
   * The window is the authority on how big a terminal is, and says so whenever it fits one. The
   * emulator and the record are only touched when the size really changed, but the pty is told
   * whenever what it was last told differs: the two can drift apart, and a program left drawing
   * at a width the window no longer has stays wrong until someone drags something.
   */
  resize(id: string, cols: number, rows: number): void {
    const l = this.live.get(id)
    if (!l) return
    if (cols < 2 || rows < 1 || cols > 1000 || rows > 1000) return
    if (l.s.cols !== cols || l.s.rows !== rows) {
      l.s.cols = cols
      l.s.rows = rows
      try {
        l.screen.resize(cols, rows)
      } catch (e) {
        log('screen resize failed', id, e)
      }
    }
    if (l.pty && (l.ptyCols !== cols || l.ptyRows !== rows)) {
      try {
        l.pty.resize(cols, rows)
        l.ptyCols = cols
        l.ptyRows = rows
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
  handoff(from: string, to: string, text: string, submit: boolean, opts: { suffix?: string; titled?: boolean } = {}): HandoffOutcome {
    const l = this.live.get(to)
    if (!l?.pty) return 'lost'
    const item: HeldHandoff = { from, text, submit, suffix: opts.suffix, titled: opts.titled }
    // An agent in the middle of a turn loses the head of a paste (measured with Claude Code: from
    // two hundred to two thousand characters never reach the conversation), one asking a person
    // something would take the Enter as the answer, and one whose screen is still moving is not
    // at its prompt yet. Their text waits until they are free and still.
    if (agentOf(l.s) !== 'shell' && (this.typing.has(to) || !(this.freeToType(l) && this.still(l)))) {
      const list = this.heldHandoffs.get(to) ?? []
      list.push(item)
      this.heldHandoffs.set(to, list)
      this.flushHeld(l)
      return 'held'
    }
    this.typeHandoff(l, [item])
    return 'typed'
  }

  private freeToType(l: Live): boolean {
    return l.s.status !== 'working' && l.s.status !== 'attention'
  }

  private still(l: Live): boolean {
    return Date.now() - l.lastOutputAt >= HELD_QUIET_MS
  }

  /** Types hand-offs into a session, an agent's in paced pieces, then presses Enter once the burst is well over. */
  private typeHandoff(l: Live, items: HeldHandoff[]): void {
    const to = l.s.id
    if (!l.pty) return
    const body = items.map((it) => it.text.replace(/\r?\n/g, '\n') + (it.suffix ?? '')).join('\n\n')
    const pieces = agentOf(l.s) === 'shell' ? [body] : pacePieces(body, PIECE_BYTES)
    // A task names an untitled session; a message passing through it does not.
    const titled = !items.every((it) => it.titled === false)
    this.typing.add(to)
    for (const it of items) this.emit('handoff', { from: it.from, to, text: it.text })
    void this.typePieces(to, pieces, titled, items.some((it) => it.submit))
  }

  private async typePieces(to: string, pieces: string[], titled: boolean, submit: boolean): Promise<void> {
    try {
      for (let i = 0; i < pieces.length; i++) {
        if (i > 0) await sleep(PIECE_GAP_MS)
        const l = this.live.get(to)
        if (!l?.pty) return
        if (i === 0 && titled) this.input(to, Buffer.from(pieces[i], 'utf8'))
        else l.pty.write(pieces[i])
      }
      // Agents' TUIs treat a burst of input as a paste and fold an Enter that arrives inside the
      // burst into it, so the text never gets submitted (Codex showed "[Pasted Content]" and sat
      // there). Enter comes once the burst is well over. Bracketed-paste markers are not an option:
      // ConPTY hands them to the program as stray characters.
      if (submit) {
        await sleep(900)
        if (this.live.get(to)?.pty) this.input(to, Buffer.from('\r'))
      }
    } finally {
      this.typing.delete(to)
      const l = this.live.get(to)
      if (l) this.flushHeld(l)
    }
  }

  /**
   * Once a session with held hand-offs is free, waits for its screen to settle and types them in
   * together. Busy again before that: stops, and starts over when the status next changes.
   */
  private flushHeld(l: Live): void {
    const id = l.s.id
    if (!this.heldHandoffs.get(id)?.length || this.heldTimers.has(id) || !this.freeToType(l)) return
    const since = Date.now()
    const tick = (): void => {
      this.heldTimers.delete(id)
      const live = this.live.get(id)
      const items = this.heldHandoffs.get(id) ?? []
      if (!live?.pty || !items.length || !this.freeToType(live)) return
      if (!this.still(live) && Date.now() - since < HELD_MAX_WAIT_MS) {
        this.heldTimers.set(id, setTimeout(tick, HELD_POLL_MS))
        return
      }
      this.heldHandoffs.delete(id)
      log('handoff', id.slice(0, 8), `typing ${items.length} held after ${Date.now() - since}ms`, this.still(live) ? 'screen still' : 'screen still moving')
      this.typeHandoff(live, items)
    }
    this.heldTimers.set(id, setTimeout(tick, HELD_POLL_MS))
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
          // A live shell the agent has left is a shell again; a session that has ended keeps the
          // name of the agent that ran in it, and its conversation, for when it is brought back.
          if (l.s.alive) l.s.agent.detectedPreset = undefined
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
          l.s.agent.lastPreset = 'claude'
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
      lastOutputAt: 0,
      logBytes: 0,
      paused: false,
      probing: false
    }
  }

  private spawn(l: Live, resume: boolean): void {
    const s = l.s
    const now = Date.now()
    // An agent typed into the previous process went with it. Left on the session, a restored shell
    // would wear its logo and, with its hooks still counted on, wait as 'starting' for events that
    // never come. What the agent was (lastPreset) and its conversation stay, so it can be resumed.
    s.agent.detectedPreset = undefined
    s.agent.hooked = false
    s.agent.tool = undefined
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
    const hookUrl = this.opts.hookUrl(s.id)
    const hooksSettings = tryWrite('hooks settings', () => writeHooksSettings(this.opts.hooksDir, s.id, hookUrl))
    const mcpUrl = this.opts.mcpUrl(s.id)
    const mcpConfig = tryWrite('mcp config', () => writeMcpConfig(this.opts.hooksDir, s.id, mcpUrl))
    const plugin = this.opts.opencodePlugin
    const opencodeConfig = plugin ? tryWrite('opencode config', () => writeOpencodeConfig(this.opts.hooksDir, s.id, mcpUrl, plugin, env['OPENCODE_CONFIG'])) : ''
    const template = resume && s.launch.resumeArgs ? s.launch.resumeArgs : s.launch.args
    const args = substituteArgs(template, { sessionId, hooksSettings, mcpConfig, mcpUrl })
    // Resolve against the plain PATH, before the shims go in front of it.
    const resolved = resolveCommand(s.launch.command, env)
    const wrap: AgentWrap = {
      hooksSettings,
      mcpConfig,
      mcpUrl,
      hookUrl,
      opencodeConfig: opencodeConfig || undefined,
      claude: findOnPath('claude', env),
      codex: findOnPath('codex', env)
    }
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
    l.askedAt = Date.now()
    p.onData((data) => {
      if (l.pty !== p) return
      // Whenever the program asks the terminal about itself, an answer becomes worth passing on
      // again: it is waiting for one, wherever it is in its life.
      if (hasQuery(data)) l.askedAt = Date.now()
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
    l.lastOutputAt = now
    if (!l.burstStart) l.burstStart = now
    // Codex keeps drawing while it waits, so output says nothing about it; its screen does.
    const byScreen = busyMarkerFor(agentOf(l.s)) !== undefined
    if (byScreen) void this.lookForWork(l)
    else if (now - l.burstStart >= BUSY_AFTER_MS) this.apply(l, { kind: 'output' })
    if (l.quietTimer) clearTimeout(l.quietTimer)
    l.quietTimer = setTimeout(() => {
      l.quietTimer = undefined
      l.burstStart = 0
      if (byScreen) void this.lookForWork(l, true)
      else this.apply(l, { kind: 'quiet' })
      this.typeStartCommand(l)
      void this.lookAtScreen(l)
      void this.noteAgentScreen(l)
    }, QUIET_MS)
  }

  /**
   * An agent typed into a shell draws on the alternate screen (OpenCode, Codex, Gemini all do).
   * When that screen goes away, the agent has quit and the pane is a plain shell again: the
   * status stops following the agent's events and the shell's own output counts once more.
   */
  private async noteAgentScreen(l: Live): Promise<void> {
    const s = l.s
    if (s.launch.hooks || s.agent.registryPid || !s.agent.detectedPreset || !s.alive) return
    await l.drained
    if (!this.live.has(s.id)) return
    if (l.screen.buffer.active.type === 'alternate') {
      l.altSeen = true
      return
    }
    if (!l.altSeen) return
    l.altSeen = false
    const hooked = s.agent.hooked
    s.agent.hooked = false
    s.agent.detectedPreset = undefined
    s.agent.tool = undefined
    if (hooked) this.apply(l, { kind: 'hook', name: 'SessionEnd', payload: {} })
    else this.emitSession(l)
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

  /**
   * For an agent whose output never settles, whether its screen shows a turn running: read at most
   * once every BUSY_LOOK_MS while it draws, and once more when it does go quiet.
   */
  private async lookForWork(l: Live, now = false): Promise<void> {
    const at = Date.now()
    if (l.busyLooking || (!now && at - (l.busyLookAt ?? 0) < BUSY_LOOK_MS)) return
    l.busyLooking = true
    l.busyLookAt = at
    try {
      await l.drained
      const s = l.s
      if (!this.live.has(s.id) || !s.alive) return
      const buf = l.screen.buffer.active
      const lines: string[] = []
      for (let y = buf.baseY; y < buf.baseY + l.screen.rows; y++) lines.push(buf.getLine(y)?.translateToString(true) ?? '')
      // Its questions only show on screen too, and the look that finds them waits for quiet that never comes.
      this.apply(l, { kind: 'screen', waiting: waitingForApproval(lines) })
      this.apply(l, { kind: 'busy', busy: busyOnScreen(agentOf(s), lines) })
    } finally {
      l.busyLooking = false
    }
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
    const folder = projectName(s.projectPath)
    const t = withoutFolder(stripTitleGlyph(title), folder)
    if (isBoringTitle(t) || isOwnNameTitle(t, agentOf(s), folder)) return
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
    if (this.heldHandoffs.has(l.s.id)) this.flushHeld(l)
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
