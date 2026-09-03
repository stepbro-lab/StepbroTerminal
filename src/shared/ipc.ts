import type {
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
  UpdateState
} from './types'

export interface CreateRequest {
  projectPath: string
  presetId: string
  cols: number
  rows: number
  /** Agent session id to resume (claude history). */
  resumeId?: string
  title?: string
}

/** Renderer -> main request/response channels. */
export interface InvokeMap {
  'host:state': () => HostState
  'host:list': () => Session[]
  'host:create': (req: CreateRequest) => Session
  'host:restartHost': () => void
  'projects:list': () => Project[]
  'projects:pickFolder': () => string | null
  'projects:add': (path: string) => Project[]
  'projects:hide': (path: string) => Project[]
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
  /** What the system clipboard holds right now, so paste can be routed correctly. */
  'clipboard:kind': () => 'image' | 'text' | 'none'
  'clipboard:readText': () => string
  'prompts:list': () => PromptRecord[]
  'git:changes': (projectPath: string, since: number, touched: string[]) => GitChanges
  'git:diff': (root: string, rel: string, untracked: boolean) => string
  'git:revert': (root: string, rel: string, untracked: boolean) => void
  'workspace:get': () => WorkspaceState | null
  'updates:state': () => UpdateState
  'updates:check': () => UpdateState
  'updates:install': () => void
}

/** Renderer -> main fire-and-forget channels. */
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
  'host:viewed': (id: string) => void
  'host:ack': (id: string, bytes: number) => void
  'win:minimize': () => void
  'win:maximize': () => void
  'win:close': () => void
  'win:setActiveSession': (id: string | null) => void
  'win:setTitle': (title: string) => void
  /** Windows only: keep the native caption buttons on the same color as our title bar. */
  'win:setOverlay': (color: string, symbolColor: string) => void
  'clipboard:write': (text: string) => void
  'workspace:set': (state: WorkspaceState) => void
}

/** Main -> renderer events. */
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
  /** Play the notification sound; the renderer owns the audio file. */
  'ui:sound': () => void
  'ui:update': (state: UpdateState) => void
  'win:maximized': (maximized: boolean) => void
  'theme:system': (dark: boolean) => void
}

export type EventName = keyof EventMap
