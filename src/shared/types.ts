export type SessionStatus = 'starting' | 'working' | 'attention' | 'done' | 'idle' | 'exited' | 'error'

export type TitleSource = 'none' | 'input' | 'osc' | 'agent' | 'history' | 'user'

export interface AgentMeta {
  /** Agent-side session id (Claude Code session uuid). */
  sessionId?: string
  /** Detected agent preset id when the user typed an agent inside a shell. */
  detectedPreset?: string
  /** Pid of a Claude Code process mapped to this session through the live registry. */
  registryPid?: number
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
}

export interface GitChanges {
  root: string | null
  files: ChangedFile[]
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
  createdAt: number
  updatedAt: number
  status: SessionStatus
  statusAt: number
  alive: boolean
  exitCode?: number
  error?: string
  cols: number
  rows: number
  pid?: number
  agent: AgentMeta
  launch: LaunchSpec
  /** Last local dev-server URL seen in the output, for the preview pane. */
  previewUrl?: string
}

export interface CreateSessionOpts {
  projectPath: string
  presetId: string
  launch: LaunchSpec
  cols: number
  rows: number
  title?: string
  agentSessionId?: string
  /** Launch with `launch.resumeArgs` (needs agentSessionId). */
  resume?: boolean
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

export interface Prefs {
  theme: 'system' | 'light' | 'dark'
  /** Tints the accent and, very slightly, the window chrome. */
  accent: AccentId
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
  customPresets: CustomPreset[]
  claudePath?: string
  shell?: string
  presetUsage: Record<string, number>
  /** Ghost-text the permission-skipping flag when an agent is typed at a prompt. */
  flagHints: boolean
}

export type SplitDir = 'row' | 'column'
export type LayoutNode = { kind: 'leaf'; id: string } | { kind: 'split'; dir: SplitDir; ratio: number; a: LayoutNode; b: LayoutNode }

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

export type HostState =
  | { kind: 'connecting' }
  | { kind: 'connected'; info: HostInfo }
  | { kind: 'error'; message: string; logPath: string }

export interface MenuItemSpec {
  id?: string
  label?: string
  enabled?: boolean
  checked?: boolean
  separator?: boolean
  submenu?: MenuItemSpec[]
}
