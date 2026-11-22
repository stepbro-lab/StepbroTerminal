import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import * as nodePty from 'node-pty'
import { Terminal as HeadlessTerminal } from '@xterm/headless'
import { SerializeAddon } from '@xterm/addon-serialize'
import type { CreateSessionOpts, HostStats, LiveClaude, Session, SessionStats } from '@shared/types'
import { TitleCapture, detectAgentFromCommand, startsOver, titleFromLine } from './titleCapture'
import { OscTitleParser, isBoringTitle, isOwnNameTitle, namesOf, stripTitleGlyph, withoutFolder } from './oscTitle'
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
import { CpuMeter, processChildren, readProcesses, subtree } from './procStats'
import { mapLimit, sampled } from '@shared/async'
import { busyMarkerFor, busyOnScreen, waitingForApproval } from './screenPrompts'
import { conptyReply, dropOwedReplies, hasQuery, isControlOnly, probeQueries, stripStaleReplies, type Owed } from './conptyReply'
import { agentOf } from './handoff'
import { pacePieces } from './pace'
import { isOwnEndpoint, previewUrlIn } from './previewUrl'
import { SessionLog, altScreenBefore, readLogTail } from './SessionLog'
import { claudeConversationExists, conversationFromTranscript, latestClaudeConversation, resumesByFolder, startsResumed } from './resumeChoice'
import { TranscriptTitles } from './claudeTitle'
import { codexHome, codexThreadsSince, justWritten, latestSince } from './codexThreads'
import { OutputPressure } from './OutputPressure'
import { modesSerializeMisses } from './screenModes'

export interface SessionManagerOpts {
  stateFile: string
  logDir: string
  hooksDir: string
  hookUrl: (sessionId: string) => string
  binDir: string
  mcpUrl: (sessionId: string) => string
  opencodePlugin?: string
  scrollback: number
  baseEnv: NodeJS.ProcessEnv
  viewed?: (id: string) => boolean
}

const REPLY_WINDOW_MS = 2000
const OWED_MS = 2000

interface Live {
  s: Session
  pty?: nodePty.IPty
  screen: HeadlessTerminal
  serializer: SerializeAddon
  drained: Promise<void>
  lines: TitleCapture
  osc: OscTitleParser
  quietTimer?: NodeJS.Timeout
  altSeen?: boolean
  busyLookAt?: number
  busyLooking?: boolean
  burstStart: number
  lastOutputAt: number
  log?: SessionLog
  flow: OutputPressure
  screenBytes: number
  restorePending?: boolean
  readAt?: number
  ptyCols?: number
  ptyRows?: number
  restoring?: Promise<void>
  generation: number
  runOnStart?: string
  probing: boolean
  owed?: Owed & { until: number }
  probeParsing: number
  askedAt?: number
  transcript?: string
  kept?: string
}

const TITLE_LOOKS_MS = [3000, 10_000, 30_000]

const HELD_QUIET_MS = 1000
const HELD_MAX_WAIT_MS = 60000
const HELD_POLL_MS = 250
const PIECE_BYTES = 900
const PIECE_GAP_MS = 150
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export type HandoffOutcome = 'typed' | 'held' | 'drafting' | 'lost'

interface HeldHandoff {
  from: string
  text: string
  submit: boolean
  suffix?: string
  titled?: boolean
}

const QUIET_MS = 1500
const REST_AFTER_MS = 10 * 60 * 1000
const BUSY_AFTER_MS = 400
const BUSY_LOOK_MS = 700
const LOG_KEEP = 2 * 1024 * 1024
const ALT_SCREEN = '\x1b[?1049h'

export class SessionManager extends EventEmitter {
  private live = new Map<string, Live>()
  private titles = new TranscriptTitles()
  private heldHandoffs = new Map<string, HeldHandoff[]>()
  private heldTimers = new Map<string, NodeJS.Timeout>()
  private typing = new Set<string>()
  private persistTimer?: NodeJS.Timeout
  private registryBusy = false
  private registryDirty: LiveClaude[] | null = null
  private closingLogs = new Set<Promise<void>>()

  constructor(private readonly opts: SessionManagerOpts) {
    super()
    fs.mkdirSync(opts.logDir, { recursive: true })
    fs.mkdirSync(opts.hooksDir, { recursive: true })
  }

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

  async snapshot(id: string): Promise<Uint8Array> {
    const l = this.live.get(id)
    if (!l) return new Uint8Array(0)
    l.readAt = Date.now()
    await this.restoreScreen(l)
    await l.drained
    try {
      return Buffer.from(this.serialize(l), 'utf8')
    } catch (e) {
      log('serialize failed', id, e)
      return new Uint8Array(0)
    }
  }

  private cpu = new CpuMeter()

  stats = sampled(() => this.collectStats(), 1000)

  private async collectStats(): Promise<HostStats> {
    const [procs, scrollbackBytes] = await Promise.all([readProcesses(), this.scrollbackOnDisk()])
    const children = processChildren(procs)
    const now = Date.now()
    const seen = new Set<number>([process.pid])
    const sessions: SessionStats[] = []
    for (const l of this.live.values()) {
      if (!l.s.alive || !l.s.pid) continue
      const tree = subtree(procs, l.s.pid, children)
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
    return { pid: process.pid, memory: process.memoryUsage().rss, cpu, sessions, sessionsOnDisk: this.live.size, scrollbackBytes, at: now }
  }

  private async scrollbackOnDisk(): Promise<number> {
    let total = 0
    try {
      await mapLimit(await fs.promises.readdir(this.opts.logDir), 16, async (name) => {
        try {
          total += (await fs.promises.stat(path.join(this.opts.logDir, name))).size
        } catch {}
      })
    } catch {}
    return total
  }

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
      if (s.status === 'error') s.status = 'exited'
      s.error = undefined
      s.errorDetail = undefined
      s.agent = s.agent ?? {}
      s.agent.registryPid = undefined
      s.leftRunning = wasAlive
      if (typeof s.order !== 'number') s.order = s.createdAt
      if (s.previewUrl && isOwnEndpoint(s.previewUrl)) s.previewUrl = undefined
      const stale =
        (s.titleSource === 'osc' && !this.nameFromOsc(s, s.title)) ||
        (s.titleSource === 'input' && !titleFromLine(s.title, s.launch.hooks || s.presetId !== 'shell'))
      if (stale) {
        s.title = ''
        s.titleSource = 'none'
      }
      const l = this.newLive(s)
      l.restorePending = true
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
      launch: opts.launch,
      startDir: opts.startDir && opts.startDir !== opts.projectPath ? opts.startDir : undefined
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
      this.hangUp(old)
    }
    l.flow.connect()
    const oldScreen = l.screen
    void l.drained.then(() => oldScreen.dispose())
    const fresh = this.newScreen(l.s)
    l.screen = fresh.screen
    l.serializer = fresh.serializer
    this.answerWhenUnseen(l, fresh.screen)
    l.drained = Promise.resolve()
    l.screenBytes = 0
    l.flow.set('screen', false)
    l.lines.reset()
    l.s.exitCode = undefined
    l.s.error = undefined
    l.s.agent.tool = undefined
    l.s.agent.registryPid = undefined
    if (l.s.titleSource === 'osc' || l.s.titleSource === 'input') {
      l.s.title = ''
      l.s.titleSource = 'none'
    }
    l.generation++
    l.restorePending = false
    this.openLog(l)
    l.log!.clear()
    this.emit('clear', id)
    if (isCodex(l.s) && !l.s.agent.sessionId) {
      const s = l.s
      const found = latestSince(codexThreadsSince(this.codexHome(s), s.createdAt), startDirOf(s), s.createdAt, this.codexTaken(s))
      if (found) s.agent.sessionId = found
    }
    const canResume = !!l.s.launch.resumeArgs && (!!l.s.agent.sessionId || !!l.s.suspended)
    this.spawn(l, canResume)
    this.emitSession(l)
  }

  kill(id: string): void {
    const l = this.live.get(id)
    if (!l?.pty) return
    this.hangUp(l.pty)
  }

  // Ends the agent to free its memory, keeping what it last showed; restart() picks the conversation back up.
  suspend(id: string): void {
    const l = this.live.get(id)
    const p = l?.pty
    if (!l || !p || !(l.s.agent.sessionId || resumesByFolder(l.s.launch))) return
    l.s.suspended = true
    this.emitSession(l)
    void l.drained.then(() => {
      if (l.pty !== p) return
      l.kept = this.serialize(l)
      this.hangUp(p)
    })
  }

  private showKept(l: Live, kept: string): void {
    const bytes = Buffer.from('\x1b[H\x1b[2J\x1b[3J' + kept, 'utf8')
    this.feedScreen(l, bytes)
    l.log?.append(bytes)
    this.emit('output', l.s.id, bytes)
  }

  // SIGHUP the subtree too: agents leave servers running that the shell's exit never reaches.
  private hangUp(p: nodePty.IPty): void {
    const end = (): void => {
      try {
        p.kill()
      } catch {}
    }

    if (process.platform === 'win32') return end()
    const root = p.pid
    void readProcesses()
      .then((procs) => {
        if (procs.get(root)?.ppid !== process.pid) return []
        return subtree(procs, root, processChildren(procs)).map((x) => x.pid).filter((pid) => pid !== root)
      })
      .catch(() => [] as number[])
      .then((under) => {
        end()
        for (const pid of under) {
          try {
            process.kill(pid, 'SIGHUP')
          } catch {}
        }
      })
  }

  archive(id: string, archived: boolean): void {
    const l = this.live.get(id)
    if (!l || !!l.s.archived === archived) return
    l.s.archived = archived
    l.s.archivedAt = archived ? Date.now() : undefined
    if (archived && l.pty) {
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
      this.hangUp(p)
    }
    if (l.quietTimer) clearTimeout(l.quietTimer)
    l.generation++
    l.flow.connect()
    this.openLog(l)
    const closing = l.log!.finish(true)
    this.closingLogs.add(closing)
    void closing.finally(() => this.closingLogs.delete(closing))
    try {
      l.screen.dispose()
    } catch {}
    this.live.delete(id)
    this.heldHandoffs.delete(id)
    this.typing.delete(id)
    const held = this.heldTimers.get(id)
    if (held) clearTimeout(held)
    this.heldTimers.delete(id)
    for (const f of [path.join(this.opts.hooksDir, `${id}.json`), this.screenPath(id)]) {
      try {
        fs.rmSync(f, { force: true })
      } catch {}
    }
    this.emit('removed', id)
    this.persist()
  }

  input(id: string, bytes: Uint8Array): void {
    const l = this.live.get(id)
    if (!l?.pty) return
    let text = Buffer.from(bytes).toString('utf8')
    const owed = l.owed
    if (owed && Date.now() < owed.until && owed.da + owed.cpr > 0) {
      const kept = dropOwedReplies(text, owed)
      if (kept !== text) {
        if (!kept) return
        text = kept
        bytes = Buffer.from(text, 'utf8')
      }
    } else if (Date.now() - (l.askedAt ?? 0) > REPLY_WINDOW_MS) {
      const kept = stripStaleReplies(text)
      if (kept !== text) {
        if (!kept) return
        text = kept
        bytes = Buffer.from(text, 'utf8')
      }
    }
    const line = l.lines.feed(bytes)
    if (line) {
      const agent = detectAgentFromCommand(line)
      const inAgent = l.s.launch.hooks || !!l.s.agent.detectedPreset || l.s.presetId !== 'shell'
      if (inAgent && startsOver(line) && (l.s.titleSource === 'input' || l.s.titleSource === 'osc' || l.s.titleSource === 'agent')) {
        l.s.title = ''
        l.s.titleSource = 'none'
        this.emitSession(l)
      }
      const title = l.s.titleSource === 'none' ? titleFromLine(line, inAgent) : null
      if (title) {
        l.s.title = title
        l.s.titleSource = 'input'
        this.emitSession(l)
      }
      if (agent && agent !== l.s.agent.detectedPreset && !l.s.launch.hooks) {
        l.s.agent.detectedPreset = agent
        l.s.agent.lastPreset = agent
        this.emitSession(l)
      }

      if (inAgent && !agent && line.length >= 2) {
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
    if (this.heldHandoffs.has(id) && !l.lines.drafting) this.flushHeld(l)
  }

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
    this.live.get(id)?.flow.set('client', true)
  }

  resume(id: string): void {
    this.live.get(id)?.flow.set('client', false)
  }

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

  handoff(from: string, to: string, text: string, submit: boolean, opts: { suffix?: string; titled?: boolean } = {}): HandoffOutcome {
    const l = this.live.get(to)
    if (!l?.pty) return 'lost'
    const item: HeldHandoff = { from, text, submit, suffix: opts.suffix, titled: opts.titled }
    if (agentOf(l.s) !== 'shell' && (this.typing.has(to) || l.lines.drafting || !(this.freeToType(l) && this.still(l)))) {
      const list = this.heldHandoffs.get(to) ?? []
      list.push(item)
      this.heldHandoffs.set(to, list)
      this.flushHeld(l)
      return l.lines.drafting ? 'drafting' : 'held'
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

  private typeHandoff(l: Live, items: HeldHandoff[]): void {
    const to = l.s.id
    if (!l.pty) return
    const body = items.map((it) => it.text.replace(/\r?\n/g, '\n') + (it.suffix ?? '')).join('\n\n')
    const pieces = agentOf(l.s) === 'shell' ? [body] : pacePieces(body, PIECE_BYTES)
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
      // Agent TUIs fold an Enter inside an input burst into the paste, so it goes after the burst.
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

  private flushHeld(l: Live): void {
    const id = l.s.id
    if (!this.heldHandoffs.get(id)?.length || this.heldTimers.has(id) || !this.freeToType(l) || l.lines.drafting) return
    const since = Date.now()
    const tick = (): void => {
      this.heldTimers.delete(id)
      const live = this.live.get(id)
      const items = this.heldHandoffs.get(id) ?? []
      // What the person has typed and not sent stays theirs; it goes in once they send or clear it.
      if (!live?.pty || !items.length || !this.freeToType(live) || live.lines.drafting || this.typing.has(id)) return
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

  async screenLines(id: string, max: number): Promise<string[]> {
    const l = this.live.get(id)
    if (!l) return []
    l.readAt = Date.now()
    await this.restoreScreen(l)
    await l.drained
    if (!this.live.has(id)) return []
    const buf = l.screen.buffer.active
    const row = (y: number): string => buf.getLine(y)?.translateToString(true) ?? ''
    let last = buf.baseY + l.screen.rows - 1
    while (last >= 0 && !row(last).trim()) last--
    const lines: string[] = []
    for (let y = Math.max(0, last - max + 1); y <= last; y++) lines.push(row(y))
    return lines
  }

  applyHook(agentSessionId: string, name: string, payload: Record<string, unknown>, stepSessionId?: string): void {
    const l = (stepSessionId && this.live.get(stepSessionId)) || [...this.live.values()].find((x) => x.s.agent.sessionId === agentSessionId)
    if (!l) return
    if (!l.s.launch.hooks) {
      l.s.agent.hooked = name !== 'SessionEnd'
    }
    if (name === 'PostToolUse') this.noteEditedFile(l, payload)
    this.apply(l, { kind: 'hook', name, payload })
    const conversation = conversationFromTranscript(payload['transcript_path'])
    if (conversation && conversation !== l.s.agent.sessionId) {
      l.s.agent.sessionId = conversation
      this.emitSession(l)
    }
    const transcript = payload['transcript_path']
    if (typeof transcript === 'string' && transcript) {
      if (l.transcript && l.transcript !== transcript) this.titles.forget(l.transcript)
      l.transcript = transcript
      void this.nameFromConversation(l)
      if (name === 'UserPromptSubmit') {
        for (const ms of TITLE_LOOKS_MS) setTimeout(() => void this.nameFromConversation(l), ms)
      }
    }
  }

  private async nameFromConversation(l: Live): Promise<void> {
    const file = l.transcript
    if (!file) return
    const t = await this.titles.read(file)
    if (l.transcript !== file || this.live.get(l.s.id) !== l) return
    const name = t.custom ?? t.ai
    if (!name || l.s.titleSource === 'user') return
    if (l.s.title === name && l.s.titleSource === 'agent') return
    l.s.title = name
    l.s.titleSource = 'agent'
    this.emitSession(l)
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

  async applyRegistry(entries: LiveClaude[]): Promise<void> {
    if (this.registryBusy) {
      this.registryDirty = entries
      return
    }
    this.registryBusy = true
    try {
      const byPid = new Map(entries.map((e) => [e.pid, e]))
      for (const l of this.live.values()) {
        const pid = l.s.agent.registryPid
        if (!pid) continue
        const e = byPid.get(pid)
        if (e) {
          if (e.status && !l.s.agent.hooked) this.apply(l, { kind: 'registry', status: e.status, waitingFor: e.waitingFor, needs: e.needs })
          byPid.delete(pid)
        } else {
          l.s.agent.registryPid = undefined
          if (l.s.alive) l.s.agent.detectedPreset = undefined
          l.s.agent.tool = undefined
          if (l.s.status === 'working' || l.s.status === 'attention' || l.s.status === 'done') l.s.status = 'idle'
          this.emitSession(l)
        }
      }

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

  private answerWhenUnseen(l: Live, screen: HeadlessTerminal): void {
    screen.onData((reply) => {
      if (screen !== l.screen || !l.pty) return
      if (this.opts.viewed?.(l.s.id) || l.probeParsing > 0) return
      l.pty.write(reply)
    })
  }

  private serialize(l: Live): string {
    return l.serializer.serialize({ scrollback: this.opts.scrollback }) + modesSerializeMisses(l.screen)
  }

  private newScreen(s: Session): { screen: HeadlessTerminal; serializer: SerializeAddon } {
    const screen = new HeadlessTerminal({
      cols: s.cols || 80,
      rows: s.rows || 24,
      scrollback: this.opts.scrollback,
      allowProposedApi: true
    })
    const serializer = new SerializeAddon()
    screen.loadAddon(serializer as any)
    return { screen, serializer }
  }

  private newLive(s: Session): Live {
    const { screen, serializer } = this.newScreen(s)
    const l: Live = {
      s,
      screen,
      serializer,
      drained: Promise.resolve(),
      lines: new TitleCapture(60),
      osc: new OscTitleParser(),
      burstStart: 0,
      lastOutputAt: 0,
      flow: new OutputPressure(),
      screenBytes: 0,
      generation: 0,
      probing: false,
      probeParsing: 0
    }
    this.answerWhenUnseen(l, screen)
    return l
  }

  private spawn(l: Live, resume: boolean): void {
    const s = l.s
    const now = Date.now()
    const waking = !!s.suspended
    s.agent.detectedPreset = undefined
    s.agent.hooked = false
    s.agent.tool = undefined
    s.status = 'starting'
    s.statusAt = now
    s.updatedAt = now
    s.error = undefined
    s.leftRunning = false
    s.suspended = undefined
    l.kept = undefined
    s.cwd = undefined
    const env = ptyEnv(this.opts.baseEnv, { ...(s.launch.env ?? {}), STEP_SESSION_ID: s.id })
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
    const saved = (id: string): boolean => claudeConversationExists(id, env['CLAUDE_CONFIG_DIR'])
    if (resume && !waking && s.launch.args.includes('--session-id') && s.agent.sessionId && !saved(s.agent.sessionId)) {
      const taken = new Set([...this.live.values()].filter((o) => o.s.id !== s.id && o.s.agent.sessionId).map((o) => o.s.agent.sessionId!))
      const found = latestClaudeConversation(startDirOf(s), s.createdAt, taken, env['CLAUDE_CONFIG_DIR'])
      if (found) {
        log('resuming the conversation last written in its folder', s.id, found)
        s.agent.sessionId = found
      }
    }
    const resumed = startsResumed(s.launch, s.agent.sessionId, resume, saved)
    if (resume && !resumed) log('starting over: no saved conversation to resume', s.id, s.agent.sessionId)
    const template = resumed ? s.launch.resumeArgs! : s.launch.args
    const sessionId = s.agent.sessionId ?? s.id
    const args = substituteArgs(template, { sessionId, hooksSettings, mcpConfig, mcpUrl })
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
      const shellArgs = process.platform === 'win32' ? shellArgsWithAgents(resolved.file, full, wrap, process.platform, env) : posixShellWithAgents(resolved.file, full, wrap, env, this.opts.binDir)
      p = nodePty.spawn(resolved.file, shellArgs, {
        name: 'xterm-256color',
        cols: s.cols,
        rows: s.rows,
        cwd: startDirOf(s),
        env,
        useConpty: true,
        // node-pty bundles ConPTY 1.23+; the one in Windows misplaces the cursor with TUI apps.
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
    l.flow.connect(p)
    s.alive = true
    s.pid = p.pid
    s.exitCode = undefined
    this.openLog(l)
    l.probing = process.platform === 'win32'
    l.owed = undefined
    l.probeParsing = 0
    l.askedAt = Date.now()
    p.onData((data) => {
      if (l.pty !== p) return
      if (hasQuery(data)) l.askedAt = Date.now()
      let probe = false
      if (l.probing) {
        // Once the prompt is up, PSReadLine would read a late reply as typed input.
        if (isControlOnly(data)) {
          probe = true
          if (this.opts.viewed?.(s.id)) {
            const q = probeQueries(data)
            l.owed = { da: (l.owed?.da ?? 0) + q.da, cpr: (l.owed?.cpr ?? 0) + q.cpr, until: Date.now() + OWED_MS }
          }
          const reply = conptyReply(data)
          if (reply) {
            p.write(reply)
            l.probing = false
          }
        } else {
          l.probing = false
        }
      }
      if (probe) l.probeParsing++
      this.onOutput(l, data)
      if (probe) {
        const generation = l.generation
        void l.drained.then(() => {
          if (generation === l.generation) l.probeParsing--
        })
      }
    })
    p.onExit(({ exitCode }) => {
      if (l.pty !== p) return
      l.pty = undefined
      l.flow.connect()
      void l.log?.flush()
      s.alive = false
      s.pid = undefined
      s.exitCode = exitCode
      l.readAt = Date.now()
      if (l.quietTimer) clearTimeout(l.quietTimer)
      this.apply(l, { kind: 'exit', code: exitCode })
      const kept = l.kept
      l.kept = undefined
      if (kept && s.suspended) this.showKept(l, kept)
      this.emit('exit', s.id, exitCode)
    })
    this.persist()
  }

  private onOutput(l: Live, data: string): void {
    const bytes = Buffer.from(data, 'utf8')
    this.feedScreen(l, data)
    l.log?.append(bytes)
    this.emit('output', l.s.id, bytes)
    for (const t of l.osc.feed(bytes)) this.onOscTitle(l, t)
    const cwd = l.osc.takeCwd()
    if (cwd && cwd !== l.s.cwd) {
      l.s.cwd = cwd
      this.emitSession(l)
    }
    this.spotPreviewUrl(l, data)
    const now = Date.now()
    l.lastOutputAt = now
    if (!l.burstStart) l.burstStart = now
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
      this.apply(l, { kind: 'screen', waiting: waitingForApproval(lines) })
      this.apply(l, { kind: 'busy', busy: busyOnScreen(agentOf(s), lines) })
    } finally {
      l.busyLooking = false
    }
  }

  private async lookAtScreen(l: Live): Promise<void> {
    const s = l.s
    if (s.launch.hooks || s.agent.registryPid || !s.alive) return
    if (!s.agent.detectedPreset && s.presetId === 'shell') return
    await l.drained
    if (!this.live.has(s.id)) return
    const buf = l.screen.buffer.active
    const lines: string[] = []
    for (let y = buf.baseY; y < buf.baseY + l.screen.rows; y++) lines.push(buf.getLine(y)?.translateToString(true) ?? '')
    this.apply(l, { kind: 'screen', waiting: waitingForApproval(lines) })
  }

  private feedScreen(l: Live, data: string | Uint8Array): void {
    const generation = l.generation
    const size = typeof data === 'string' ? Buffer.byteLength(data) : data.byteLength
    l.screenBytes += size
    if (l.screenBytes >= 1024 * 1024) l.flow.set('screen', true)
    l.drained = new Promise<void>((resolve) => {
      const done = (): void => {
        if (generation === l.generation) {
          l.screenBytes -= size
          if (l.screenBytes <= 256 * 1024) l.flow.set('screen', false)
        }
        resolve()
      }
      try {
        l.screen.write(data as any, done)
      } catch (e) {
        log('screen write failed', l.s.id, e)
        done()
      }
    })
  }

  private spotPreviewUrl(l: Live, data: string): void {
    const url = previewUrlIn(data, this.ownPort())
    if (!url || l.s.previewUrl === url) return
    l.s.previewUrl = url
    this.emitSession(l)
  }

  private ownPort(): number | undefined {
    if (this.ownPortKnown) return this.ownPortKnown
    try {
      return (this.ownPortKnown = Number(new URL(this.opts.hookUrl('x')).port) || undefined)
    } catch {
      return undefined
    }
  }
  private ownPortKnown?: number

  private nameFromOsc(s: Session, title: string): string | null {
    const folder = projectName(s.projectPath)
    const t = withoutFolder(stripTitleGlyph(title), folder)
    if (isBoringTitle(t) || isOwnNameTitle(t, namesOf(agentOf(s), s.launch.command, s.launch.args), folder)) return null
    return t
  }

  private onOscTitle(l: Live, title: string): void {
    const s = l.s
    if (s.titleSource === 'user' || s.titleSource === 'agent') return
    const t = this.nameFromOsc(s, title)
    if (!t) return
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
    const was = s.status
    if (patch.status && patch.status !== s.status) {
      s.status = patch.status
      s.statusAt = Date.now()
      changed = true
      if (isCodex(s) && was === 'working') this.catchCodexThread(l)
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

  private codexHome(s: Session): string {
    return codexHome({ ...this.opts.baseEnv, ...(s.launch.env ?? {}) })
  }

  private codexTaken(s: Session): Set<string> {
    const taken = new Set<string>()
    for (const o of this.live.values()) if (o.s.id !== s.id && isCodex(o.s) && o.s.agent.sessionId) taken.add(o.s.agent.sessionId)
    return taken
  }

  private catchCodexThread(l: Live): void {
    const s = l.s
    try {
      const now = Date.now()
      const found = justWritten(codexThreadsSince(this.codexHome(s), now - 60_000, now), startDirOf(s), this.codexTaken(s), now)
      if (found && found !== s.agent.sessionId) {
        s.agent.sessionId = found
        this.persist()
      }
    } catch (e) {
      log('codex conversation not found', s.id, e)
    }
  }

  private emitSession(l: Live): void {
    l.s.updatedAt = Date.now()
    this.emit('session', l.s)
    this.persist()
    if (this.heldHandoffs.has(l.s.id)) this.flushHeld(l)
  }

  private logPath(id: string): string {
    return path.join(this.opts.logDir, `${id}.log`)
  }

  private openLog(l: Live): void {
    l.log ??= new SessionLog(this.logPath(l.s.id), {
      pressure: (paused) => l.flow.set('log', paused),
      error: (e) => log('session log failed', l.s.id, e),
      screen: () => this.screenForLog(l)
    })
  }

  private async screenForLog(l: Live): Promise<string | undefined> {
    const generation = l.generation
    l.flow.set('rotate', true)
    try {
      await l.drained
      return generation === l.generation ? this.serialize(l) : undefined
    } catch (e) {
      log('keeping the screen failed', l.s.id, e)
      return undefined
    } finally {
      l.flow.set('rotate', false)
    }
  }

  async finishLogs(): Promise<void> {
    for (const l of this.live.values()) l.flow.set('shutdown', true)
    await new Promise<void>((resolve) => setImmediate(resolve))
    await Promise.all([...this.closingLogs, ...[...this.live.values()].map((l) => l.log?.finish())])
    await this.saveScreens()
  }

  private restoreScreen(l: Live): Promise<void> {
    if (l.restoring) return l.restoring
    if (!l.restorePending) return Promise.resolve()
    l.restorePending = false
    const generation = l.generation
    l.restoring = this.lastScreen(l.s.id).then(async (kept) => {
      if (generation !== l.generation || !this.live.has(l.s.id)) return
      if (kept.length) this.feedScreen(l, kept)
      await l.drained
    }).catch((e) => {
      if (e.code !== 'ENOENT') log('restore log failed', l.s.id, e)
    }).finally(() => { l.restoring = undefined })
    return l.restoring
  }

  private async lastScreen(id: string): Promise<Buffer> {
    const saved = this.screenPath(id)
    try {
      const kept = await fs.promises.readFile(saved)
      await fs.promises.rm(saved, { force: true })
      if (kept.length) return kept
    } catch (e: any) {
      if (e.code !== 'ENOENT') log('reading the saved screen failed', id, e)
    }
    const file = this.logPath(id)
    const tail = await readLogTail(file, LOG_KEEP)
    const cut = (await fs.promises.stat(file)).size - tail.length
    return cut > 0 && (await altScreenBefore(file, cut)) ? Buffer.concat([Buffer.from(ALT_SCREEN), tail]) : tail
  }

  async rest(now = Date.now()): Promise<number> {
    let rested = 0
    for (const l of [...this.live.values()]) {
      const id = l.s.id
      const idle = (): boolean =>
        this.live.get(id) === l && !l.s.alive && !l.pty && !l.restorePending && !l.restoring && !this.opts.viewed?.(id) && now - (l.readAt ?? now) >= REST_AFTER_MS
      if (!idle()) continue
      const generation = l.generation
      const file = this.screenPath(id)
      try {
        await l.drained
        await fs.promises.writeFile(file + '.tmp', this.serialize(l))
        await fs.promises.rename(file + '.tmp', file)
      } catch (e) {
        log('putting the screen away failed', id, e)
        continue
      }

      if (!idle() || generation !== l.generation) continue
      const old = l.screen
      const fresh = this.newScreen(l.s)
      l.screen = fresh.screen
      l.serializer = fresh.serializer
      this.answerWhenUnseen(l, fresh.screen)
      l.drained = Promise.resolve()
      l.screenBytes = 0
      l.restorePending = true
      old.dispose()
      rested++
    }
    return rested
  }

  private screenPath(id: string): string {
    return path.join(this.opts.logDir, `${id}.screen`)
  }

  private async saveScreens(): Promise<void> {
    await Promise.all(
      [...this.live.values()].map(async (l) => {
        if (l.restorePending) return
        const file = this.screenPath(l.s.id)
        try {
          await l.drained
          await fs.promises.writeFile(file + '.tmp', this.serialize(l))
          await fs.promises.rename(file + '.tmp', file)
        } catch (e) {
          log('saving the screen failed', l.s.id, e)
        }
      })
    )
  }
}

function startDirOf(s: Session): string {
  if (s.startDir) {
    try {
      if (fs.statSync(s.startDir).isDirectory()) return s.startDir
    } catch {}
  }
  return s.projectPath
}

function isCodex(s: Session): boolean {
  return s.presetId === 'codex' && !!s.launch.resumeArgs?.includes('{sessionId}')
}
