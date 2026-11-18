import type {
  FileDiff,
  GitChanges,
  HistorySession,
  PromptRecord,
  HostState,
  LiveClaude,
  MenuItemSpec,
  Preset,
  Prefs,
  Project,
  Session,
  TranscriptDetails,
  WorkspaceState,
  UpdateState,
  Note,
  Handoff,
  AppStats,
  TopitoSay
} from './types'

export interface CreateRequest {
  projectPath: string
  presetId: string
  cols: number
  rows: number
  resumeId?: string
  title?: string
  runOnStart?: string
  startDir?: string
}

export interface InvokeMap {
  'host:state': () => HostState
  'host:list': () => Session[]
  'host:create': (req: CreateRequest) => Session
  'host:restartHost': () => void
  'projects:list': () => Project[]
  'projects:pickFolder': () => string | null
  'projects:add': (path: string) => Project[]
  'projects:hide': (path: string) => Project[]
  'projects:reorder': (paths: string[]) => Project[]
  'projects:openFolder': (path: string) => void
  'history:list': () => HistorySession[]
  'history:details': (projectPath: string, sessionId: string) => TranscriptDetails
  'history:live': () => LiveClaude[]
  'presets:list': () => Preset[]
  'presets:refresh': () => Preset[]
  'prefs:get': () => Prefs
  'prefs:set': (partial: Partial<Prefs>) => Prefs
  'win:isMaximized': () => boolean
  'menu:popup': (items: MenuItemSpec[]) => string | null
  'app:openExternal': (url: string) => void
  'app:openPath': (path: string) => void
  'clipboard:kind': () => 'image' | 'text' | 'none'
  'clipboard:readText': () => string
  'clipboard:saveImage': () => string | null
  'prompts:list': () => PromptRecord[]
  'git:changes': (projectPath: string, since: number, touched: string[]) => GitChanges
  'git:diff': (root: string, rel: string, untracked: boolean) => FileDiff
  'git:revert': (root: string, rel: string, untracked: boolean) => void
  'workspace:get': () => WorkspaceState | null
  'updates:state': () => UpdateState
  'updates:check': () => UpdateState
  'updates:install': () => void
  'notes:list': () => Note[]
  'app:pendingFolders': () => string[]
  'app:pendingWorkspaces': () => string[]
  'diag:dump': () => string
  'stats:get': () => AppStats
  'app:paths': () => { data: string; hostLog: string }
  'app:revealPath': (path: string) => void
}

export interface SendMap {
  'host:attach': (id: string) => void
  'host:detach': (id: string) => void
  'host:input': (id: string, data: Uint8Array) => void
  'host:resize': (id: string, cols: number, rows: number) => void
  'host:kill': (id: string) => void
  'host:close': (id: string) => void
  'host:restart': (id: string) => void
  'host:rename': (id: string, title: string) => void
  'host:pin': (id: string, pinned: boolean) => void
  'host:archive': (id: string, archived: boolean) => void
  'host:reorder': (ids: string[]) => void
  'host:viewed': (id: string) => void
  'host:ack': (id: string, bytes: number) => void
  'win:minimize': () => void
  'win:maximize': () => void
  'win:close': () => void
  'win:bar': (height: number) => void
  'win:buttons': (visible: boolean) => void
  'win:setActiveSession': (id: string | null) => void
  'win:setTitle': (title: string) => void
  'clipboard:write': (text: string) => void
  'workspace:set': (state: WorkspaceState) => void
  'preview:attached': (sessionId: string, webContentsId: number) => void
  'preview:detached': (sessionId: string) => void
  'notes:add': (text: string) => void
  'notes:update': (id: string, patch: { text?: string; done?: boolean }) => void
  'notes:delete': (id: string) => void
}

export interface EventMap {
  'host:state': (state: HostState) => void
  'host:sessions': (sessions: Session[]) => void
  'host:session': (session: Session) => void
  'host:removed': (id: string) => void
  'host:exit': (id: string, code: number) => void
  'host:clear': (id: string) => void
  'host:output': (id: string, bytes: Uint8Array, replay: boolean) => void
  'history:update': (sessions: HistorySession[]) => void
  'live:update': (live: LiveClaude[]) => void
  'prefs:update': (prefs: Prefs) => void
  'presets:update': (presets: Preset[]) => void
  'projects:update': (projects: Project[]) => void
  'ui:focusSession': (id: string) => void
  'ui:command': (name: string) => void
  'ui:openPreview': (sessionId: string, url: string) => void
  'ui:closePreview': (sessionId: string) => void
  'ui:previewActivity': (sessionId: string, presetId: string) => void
  'ui:sound': () => void
  'ui:update': (state: UpdateState) => void
  'notes:update': (notes: Note[], added?: Note) => void
  'ui:handoff': (handoff: Handoff) => void
  'ui:topito': (say: TopitoSay) => void
  'win:maximized': (maximized: boolean) => void
  'win:seen': (seen: boolean) => void
  'win:fullscreen': (fullscreen: boolean) => void
  'win:barPointer': (inside: boolean) => void
  'win:topEdge': () => void
  'ui:openFolder': (path: string) => void
  'ui:openWorkspace': (key: string) => void
  'theme:system': (dark: boolean) => void
  'diag': (line: string) => void
}

export type EventName = keyof EventMap
