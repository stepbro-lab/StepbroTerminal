import type { Keybindings } from './keybindings'
import type { Language } from './i18n'
export type SessionStatus = 'starting' | 'working' | 'attention' | 'done' | 'idle' | 'exited' | 'error'

export type TitleSource = 'none' | 'input' | 'osc' | 'agent' | 'history' | 'user'

export interface AgentMeta {
  /** Agent-side session id (Claude Code session uuid). */
  sessionId?: string
  /** Detected agent preset id when the user typed an agent inside a shell. */
  detectedPreset?: string
  /** The last agent seen in this shell, kept after it has quit or the session has ended: what the session was. */
  lastPreset?: string
  /** Pid of a Claude Code process mapped to this session through the live registry. */
  registryPid?: number
  /** Hooks are arriving from an agent the user started inside this shell; they drive the status until it ends. */
  hooked?: boolean
  model?: string
  tool?: string
  lastMessage?: string
  permissionMode?: string
  costUsd?: number
  tokens?: number
  /** Files the agent edited in this session (from Claude Code hooks), newest last. */
  changedFiles?: string[]
}

export interface ChangedFile {
  path: string
  rel: string
  status: 'added' | 'deleted' | 'modified' | 'renamed'
  untracked: boolean
  /** Edited by this session (hook evidence) or modified after it started. */
  bySession: boolean
  mtime: number
  /** Lines added and removed, when git can count them; a binary file has neither. */
  added?: number
  removed?: number
  binary?: boolean
}

export interface GitChanges {
  root: string | null
  files: ChangedFile[]
}

/** One file's diff ready to draw: a unified diff, or the reason there is none to show. */
export interface FileDiff {
  kind: 'text' | 'binary' | 'large' | 'empty' | 'error'
  text: string
}

/** A prompt the user sent to an agent, kept for the history palette. */
export interface PromptRecord {
  ts: number
  sessionId: string
  projectPath: string
  presetId: string
  text: string
}

export interface LaunchSpec {
  command: string
  /** May contain {sessionId} and {hooksSettings} placeholders. */
  args: string[]
  resumeArgs?: string[]
  env?: Record<string, string>
  hooks: boolean
}

export interface Session {
  id: string
  projectPath: string
  presetId: string
  title: string
  titleSource: TitleSource
  pinned: boolean
  /** Place in the sidebar within its project; lower comes first. New sessions go last. */
  order: number
  createdAt: number
  updatedAt: number
  status: SessionStatus
  statusAt: number
  alive: boolean
  exitCode?: number
  error?: string
  /** Full diagnostic behind `error`, for the console and the log; not shown in the banner. */
  errorDetail?: string
  /** Set on restore when this session was still running as the host stopped; drives resume on launch. */
  leftRunning?: boolean
  /** Put away: its process is gone and its row sits dimmed under the folder, ready to be restored or deleted. */
  archived?: boolean
  cols: number
  rows: number
  pid?: number
  agent: AgentMeta
  launch: LaunchSpec
  /** Last local dev-server URL seen in the output, for the preview pane. */
  previewUrl?: string
  /** Where the process starts, when not in the project's folder: a pane split from a shell that had moved. */
  startDir?: string
  /** The directory the shell last said it is in (OSC 7 or 9;9, at each prompt); gone with the process. */
  cwd?: string
}

export interface CreateSessionOpts {
  projectPath: string
  presetId: string
  launch: LaunchSpec
  cols: number
  rows: number
  /** Where the process starts when not in the project's folder: a pane split from a shell that had moved. */
  startDir?: string
  title?: string
  agentSessionId?: string
  /** Launch with `launch.resumeArgs` (needs agentSessionId). */
  resume?: boolean
  /** From a launch configuration: typed into the pane once it first settles, line by line with Enter. */
  runOnStart?: string
}

export interface Preset {
  id: string
  name: string
  color: string
  binary: string
  args: string[]
  resumeArgs?: string[]
  hooks: boolean
  installed: boolean
  resolvedPath?: string
  custom?: boolean
}

export interface Project {
  path: string
  name: string
  sources: Array<'added' | 'history' | 'live'>
}

export interface HistorySession {
  sessionId: string
  projectPath: string
  title: string
  firstAt: number
  lastAt: number
  prompts: number
}

export interface TranscriptDetails {
  costUsd?: number
  model?: string
  inputTokens?: number
  outputTokens?: number
}

export interface LiveClaude {
  pid: number
  sessionId: string
  cwd: string
  name?: string
  status?: string
  updatedAt?: number
}

export interface CustomPreset {
  id: string
  name: string
  command: string
  args: string[]
  color: string
}

export type AccentId = 'graphite' | 'blue' | 'orange' | 'yellow' | 'green' | 'teal' | 'purple' | 'pink'
/** The two looks of the logo: the black spark on a white tile, and the white spark on black. */
export type LogoId = 'light' | 'dark'

export interface Prefs {
  theme: 'system' | 'light' | 'dark'
  /** Tints the accent and, very slightly, the window chrome. */
  accent: AccentId
  /** Which of the two logos the app shows: the light tile (the default) or the dark one. */
  logo?: LogoId
  fontFamily: string
  fontSize: number
  lineHeight: number
  ligatures: boolean
  cursorStyle: 'bar' | 'block' | 'underline'
  cursorBlink: boolean
  scrollback: number
  notifications: boolean
  sound: boolean
  /** Notification sound level, 0 to 100. */
  soundVolume: number
  sidebarWidth: number
  sidebarCollapsed: boolean
  collapsedProjects: string[]
  addedProjects: string[]
  hiddenProjects: string[]
  /** Folder paths in the order the sidebar shows them; folders not listed follow, in the order they appeared. */
  projectOrder?: string[]
  customPresets: CustomPreset[]
  claudePath?: string
  /** DeepSeek serves an Anthropic-shaped API; with a key, Claude Code runs on its models as the DeepSeek preset. */
  deepseekApiKey?: string
  /**
   * The bar at the top edge tucks itself away and comes back when the pointer reaches the
   * edge. Off, it stays open and the terminal sits below it. On unless turned off.
   */
  barHides?: boolean
  /**
   * Windows: closing the window leaves the app running in the tray, still telling you when a
   * session needs you, until it is quit from there. On unless turned off.
   */
  closeToTray?: boolean
  /** Whether the app has said once that it went on running in the tray when its window closed. */
  trayHintShown?: boolean
  /** Topito, the mole between the buttons at the foot of the sidebar. Off until turned on. */
  topito?: boolean
  /** The newest version whose changes have been shown; what came after it opens once after an update. */
  seenVersion?: string
  /** V4 Pro, V4 Flash, or whatever model id is in deepseekModelId. */
  deepseekModel?: 'pro' | 'flash' | 'custom'
  deepseekModelId?: string
  /** How many archived sessions a folder shows in the sidebar before "more"; 5 when unset. */
  archivedShown?: number
  shell?: string
  presetUsage: Record<string, number>
  /** Ghost-text the permission-skipping flag when an agent is typed at a prompt. */
  flagHints: boolean
  /** Draw terminals with WebGL. Off uses the DOM renderer, for displays that react badly to GPU windows. */
  gpuRendering: boolean
  /**
   * How opaque the frame around the terminal is, and the terminal's own surface, each 0 to 1,
   * over the desktop blurred behind the window. Below 1 only where the system can blur (see
   * shared/frame); both at 1 is a solid window, and so is every window where it cannot.
   */
  frameOpacity: number
  contentOpacity: number
  /** On launch, bring back the sessions that were still running; agents resume their conversation. */
  resumeOnLaunch: boolean
  /** Saved pane arrangements that open in one go. */
  launchConfigs: LaunchConfig[]
  /** Shortcut chords the user changed, by shortcut id; null means no key. See shared/keybindings. */
  keybindings: Keybindings
  /** The language of the app's own text. Agents and shells are not affected. */
  language: Language
}

export type SplitDir = 'row' | 'column'
export type LayoutNode = { kind: 'leaf'; id: string } | { kind: 'split'; dir: SplitDir; ratio: number; a: LayoutNode; b: LayoutNode }

/** One pane of a launch configuration: a folder, what runs in it, and what to type once it is ready. */
export interface LaunchPane {
  cwd: string
  /** 'shell' or an agent/launcher preset id. */
  presetId: string
  /** Typed into the pane line by line, each followed by Enter, once it first settles. */
  runOnStart?: string
}

/** A saved arrangement of panes that opens in one go, every pane in its own folder. */
export interface LaunchConfig {
  id: string
  name: string
  /** Side by side (`row`) or stacked (`column`). */
  split: SplitDir
  panes: LaunchPane[]
}

/** Pane arrangements the user built, saved between launches. */
export interface WorkspaceState {
  views: LayoutNode[]
  activeView: number
  activeId: string | null
}

/** Who wrote a note: an agent inside a session, or the user in the panel. */
export type NoteSource = { kind: 'agent'; sessionId: string; presetId: string; title: string } | { kind: 'user' }

/** A note kept by the host, shared by every session and every agent. */
export interface Note {
  id: string
  text: string
  createdAt: number
  updatedAt: number
  done: boolean
  source: NoteSource
}

/** Text one agent handed to another session, for the flight between panes. */
export interface Handoff {
  from: string
  to: string
  text: string
}

/** How Topito should look while he passes an agent's words on. */
export type TopitoMood = 'done' | 'needs_you' | 'happy' | 'thinking' | 'oops' | 'hello' | 'surprised' | 'coffee'

export const TOPITO_MOODS: TopitoMood[] = ['done', 'needs_you', 'happy', 'thinking', 'oops', 'hello', 'surprised', 'coffee']

/** A few words an agent asked Topito to say to the person, through the stepbro MCP server. */
export interface TopitoSay {
  sessionId: string
  message: string
  mood: TopitoMood
  at: number
}

/** A message one agent left for another through the MCP server; it waits in the receiver's inbox. */
export interface AgentMessage {
  id: string
  ts: number
  from: string
  to: string
  text: string
}

/** Where the app stands with respect to a newer release. */
export type UpdateState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  /** A newer version exists; `direct` means this build can install it by itself. */
  | { kind: 'available'; version: string; direct: boolean }
  | { kind: 'downloading'; version: string; percent: number }
  /** Downloaded; the next restart installs it. */
  | { kind: 'ready'; version: string }
  | { kind: 'error'; message: string }

export interface HostInfo {
  pid: number
  socketPath: string
  hookPort: number
  hookToken: string
  version: string
}

/** What one live session's processes use, the shell and everything under it. */
export interface SessionStats {
  id: string
  pid: number
  processes: number
  /** Percent of one core since the previous look. */
  cpu: number
  /** Resident memory in bytes. */
  memory: number
}

/** The host's own use and every live session's, as of `at`. */
export interface HostStats {
  pid: number
  memory: number
  cpu: number
  sessions: SessionStats[]
  /** Sessions the host keeps, running or not. */
  sessionsOnDisk: number
  /** Bytes of scrollback logs on disk. */
  scrollbackBytes: number
  at: number
}

/** Memory of the app's own processes plus what the host reports, or null while it is away. */
export interface AppStats {
  app: number
  host: HostStats | null
}

export type HostState =
  | { kind: 'connecting' }
  | { kind: 'connected'; info: HostInfo }
  | { kind: 'error'; message: string; logPath: string }

/** What an agent can do with the preview pane beside its session, through the stepbro MCP server. */
export type BrowserOp =
  | { kind: 'open'; url: string }
  | { kind: 'close' }
  | { kind: 'screenshot' }
  | { kind: 'read'; what: 'text' | 'outline' | 'html'; target?: string }
  | { kind: 'scroll'; to: 'top' | 'bottom' | 'up' | 'down' | number; target?: string }
  | { kind: 'click'; target: string }
  | { kind: 'type'; target: string; text: string; submit?: boolean }
  | { kind: 'eval'; js: string }
  | { kind: 'console'; clear?: boolean }

export interface BrowserResult {
  url: string
  title: string
  /** What the operation produced: page text, an outline, a value, console lines. */
  text?: string
  /** A PNG of the pane, base64. */
  png?: string
}

export interface MenuItemSpec {
  id?: string
  label?: string
  enabled?: boolean
  checked?: boolean
  separator?: boolean
  submenu?: MenuItemSpec[]
}
