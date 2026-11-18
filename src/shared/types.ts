import type { Keybindings } from './keybindings'
import type { Language } from './i18n'

export type SessionStatus = 'starting' | 'working' | 'attention' | 'done' | 'idle' | 'exited' | 'error'

export type TitleSource = 'none' | 'input' | 'osc' | 'agent' | 'history' | 'user'

export interface AgentMeta {
  sessionId?: string
  detectedPreset?: string
  lastPreset?: string
  registryPid?: number
  hooked?: boolean
  model?: string
  tool?: string
  lastMessage?: string
  permissionMode?: string
  costUsd?: number
  tokens?: number
  changedFiles?: string[]
}

export interface ChangedFile {
  path: string
  rel: string
  status: 'added' | 'deleted' | 'modified' | 'renamed'
  untracked: boolean
  bySession: boolean
  mtime: number
  added?: number
  removed?: number
  binary?: boolean
}

export interface GitChanges {
  root: string | null
  files: ChangedFile[]
}

export interface FileDiff {
  kind: 'text' | 'binary' | 'large' | 'empty' | 'error'
  text: string
}

export interface PromptRecord {
  ts: number
  sessionId: string
  projectPath: string
  presetId: string
  text: string
}

export interface LaunchSpec {
  command: string
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
  order: number
  createdAt: number
  updatedAt: number
  status: SessionStatus
  statusAt: number
  alive: boolean
  exitCode?: number
  error?: string
  errorDetail?: string
  leftRunning?: boolean
  archived?: boolean
  archivedAt?: number
  cols: number
  rows: number
  pid?: number
  agent: AgentMeta
  launch: LaunchSpec
  previewUrl?: string
  startDir?: string
  cwd?: string
}

export interface CreateSessionOpts {
  projectPath: string
  presetId: string
  launch: LaunchSpec
  cols: number
  rows: number
  startDir?: string
  title?: string
  agentSessionId?: string
  resume?: boolean
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
  waitingFor?: string
  needs?: string
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
export type LogoId = 'light' | 'dark'

export interface Prefs {
  theme: 'system' | 'light' | 'dark'
  accent: AccentId
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
  soundVolume: number
  sidebarWidth: number
  sidebarCollapsed: boolean
  collapsedProjects: string[]
  addedProjects: string[]
  hiddenProjects: string[]
  projectOrder?: string[]
  customPresets: CustomPreset[]
  claudePath?: string
  deepseekApiKey?: string
  barHides?: boolean
  edgePeek?: boolean
  copyOnSelect?: boolean
  discordPresence?: boolean
  closeToTray?: boolean
  sidePanelShare?: number
  trayHintShown?: boolean
  topito?: boolean
  seenVersion?: string
  deepseekModel?: 'pro' | 'flash' | 'custom'
  deepseekModelId?: string
  archivedShown?: number
  shell?: string
  presetUsage: Record<string, number>
  flagHints: boolean
  gpuRendering: boolean
  frameOpacity: number
  contentOpacity: number
  resumeOnLaunch: boolean
  launchConfigs: LaunchConfig[]
  keybindings: Keybindings
  language: Language
}

export type SplitDir = 'row' | 'column'
export type LayoutNode = { kind: 'leaf'; id: string } | { kind: 'split'; dir: SplitDir; ratio: number; a: LayoutNode; b: LayoutNode }

export interface LaunchPane {
  cwd: string
  presetId: string
  runOnStart?: string
}

export interface LaunchConfig {
  id: string
  name: string
  split: SplitDir
  panes: LaunchPane[]
}

export interface WorkspacePaneInput {
  folder: string
  run?: string
  startCommand?: string
}

export type WorkspaceOp =
  | { kind: 'list' }
  | { kind: 'create'; base: string; name: string; split?: SplitDir; panes: WorkspacePaneInput[] }
  | {
      kind: 'update'
      base: string
      key: string
      name?: string
      split?: SplitDir
      panes?: WorkspacePaneInput[]
      change?: Array<{ pane: number } & Partial<WorkspacePaneInput>>
      remove?: number[]
      add?: WorkspacePaneInput[]
    }
  | { kind: 'delete'; key: string }
  | { kind: 'open'; key: string }

export interface WorkspaceInfo {
  id: string
  name: string
  split: SplitDir
  url: string
  panes: Array<{ cwd: string; presetId: string; presetName: string; runOnStart?: string; problem?: string }>
}

export interface WorkspaceResult {
  workspaces?: WorkspaceInfo[]
  workspace?: WorkspaceInfo
  queued?: boolean
}

export interface WorkspaceState {
  views: LayoutNode[]
  activeView: number
  activeId: string | null
}

export type NoteSource = { kind: 'agent'; sessionId: string; presetId: string; title: string } | { kind: 'user' }

export interface Note {
  id: string
  text: string
  createdAt: number
  updatedAt: number
  done: boolean
  source: NoteSource
}

export interface Handoff {
  from: string
  to: string
  text: string
}

export type TopitoMood = 'done' | 'needs_you' | 'happy' | 'thinking' | 'oops' | 'hello' | 'surprised' | 'coffee'

export const TOPITO_MOODS: TopitoMood[] = ['done', 'needs_you', 'happy', 'thinking', 'oops', 'hello', 'surprised', 'coffee']

export interface TopitoSay {
  sessionId: string
  message: string
  mood: TopitoMood
  at: number
}

export interface AgentMessage {
  id: string
  ts: number
  from: string
  to: string
  text: string
}

export type UpdateState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'available'; version: string; direct: boolean }
  | { kind: 'downloading'; version: string; percent: number }
  | { kind: 'ready'; version: string }
  | { kind: 'error'; message: string }

export interface HostInfo {
  pid: number
  socketPath: string
  hookPort: number
  hookToken: string
  version: string
}

export interface SessionStats {
  id: string
  pid: number
  processes: number
  cpu: number
  memory: number
}

export interface HostStats {
  pid: number
  memory: number
  cpu: number
  sessions: SessionStats[]
  sessionsOnDisk: number
  scrollbackBytes: number
  at: number
}

export interface AppStats {
  app: number
  host: HostStats | null
}

export type HostState =
  | { kind: 'connecting' }
  | { kind: 'connected'; info: HostInfo }
  | { kind: 'error'; message: string; logPath: string }

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
  text?: string
  png?: string
  after?: string
}

export interface MenuItemSpec {
  id?: string
  label?: string
  shortcut?: string
  enabled?: boolean
  checked?: boolean
  separator?: boolean
  submenu?: MenuItemSpec[]
}
