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
  AppStats
} from './types'

export interface CreateRequest {
  projectPath: string
  presetId: string
  cols: number
  rows: number
  /** Agent session id to resume (claude history). */
  resumeId?: string
  title?: string
  /** From a launch configuration: typed into the pane once it first settles. */
  runOnStart?: string
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
  /** What the system clipboard holds right now, so paste can be routed correctly. */
  'clipboard:kind': () => 'image' | 'text' | 'none'
  'clipboard:readText': () => string
  /** Saves the image on the clipboard as a PNG in the app's temp folder and returns its path, or null without one. */
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
  /** Folders dropped on the app icon or given on the command line before the window was ready; cleared once read. */
  'app:pendingFolders': () => string[]
  /** Workspaces asked for by step://workspace links before the window was ready; cleared once read. */
  'app:pendingWorkspaces': () => string[]
  /** The host and app logs, for reading real failures from DevTools. */
  'diag:dump': () => string
  /** Memory and CPU of the app, the host and every live session, for Settings > Advanced. */
  'stats:get': () => AppStats
  /** Where session data and the host log live on this machine. */
  'app:paths': () => { data: string; hostLog: string }
  /** Shows a file selected in Finder, Explorer or the file manager. */
  'app:revealPath': (path: string) => void
  /** macOS asks before a program may listen; answered once and remembered. True when it may. */
  'voice:askForMicrophone': () => boolean
  /** Whether the system is holding the talk-from-any-app key; false when another program has it. */
  'voice:keyHeld': () => boolean
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
  'host:archive': (id: string, archived: boolean) => void
  'host:reorder': (ids: string[]) => void
  'host:viewed': (id: string) => void
  'host:ack': (id: string, bytes: number) => void
  'win:minimize': () => void
  'win:maximize': () => void
  'win:close': () => void
  'win:setActiveSession': (id: string | null) => void
  'win:setTitle': (title: string) => void
  /** The pointer entered the window's top-left corner, this many DIP wide and tall: show the window's buttons there. */
  'win:cornerEnter': (width: number, height: number) => void
  'clipboard:write': (text: string) => void
  'workspace:set': (state: WorkspaceState) => void
  /** The preview pane beside a session has its browser view up, with this webContents id; and it is gone. */
  'preview:attached': (sessionId: string, webContentsId: number) => void
  'preview:detached': (sessionId: string) => void
  /** The state of the voice conversation, so the pill over other apps can follow it. */
  'voice:state': (state: string) => void
  /** How loud each side is, twenty times a second while a conversation is open. */
  'voice:level': (mine: number, theirs: number) => void
  'notes:add': (text: string) => void
  'notes:update': (id: string, patch: { text?: string; done?: boolean }) => void
  'notes:delete': (id: string) => void
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
  /** An agent asked for a page in the preview pane beside its session, or for that pane to go. */
  'ui:openPreview': (sessionId: string, url: string) => void
  'ui:closePreview': (sessionId: string) => void
  /** The agent in a session is doing something with its preview pane right now. */
  'ui:previewActivity': (sessionId: string, presetId: string) => void
  /** Play the notification sound; the renderer owns the audio file. */
  'ui:sound': () => void
  'ui:update': (state: UpdateState) => void
  /** The notes list changed; `added` is the note an agent just saved, for the animation. */
  'notes:update': (notes: Note[], added?: Note) => void
  'ui:handoff': (handoff: Handoff) => void
  /** The key the system holds for talking was pressed: start a turn, or end the one under way. */
  'ui:voiceToggle': () => void
  /** For the pill that shows over other apps: what the conversation is doing. */
  'voice:hud': (state: string) => void
  'voice:hudLevel': (mine: number, theirs: number) => void
  'win:maximized': (maximized: boolean) => void
  /** macOS: the window went full screen, where the traffic lights leave the bar. */
  'win:fullscreen': (fullscreen: boolean) => void
  /** Whether the pointer is in the window's top-left corner, where its buttons show while it is. */
  'win:cornerHover': (over: boolean) => void
  /** Windows: the pointer rested on the window's left edge, the part the page never sees. */
  'win:edgeRest': () => void
  /** A folder handed to the app from outside: dropped on its icon, or given on the command line. */
  'ui:openFolder': (path: string) => void
  /** A step://workspace/<name> link: open that workspace. */
  'ui:openWorkspace': (key: string) => void
  'theme:system': (dark: boolean) => void
  /** A line of host/app diagnostics, mirrored into the DevTools console. */
  'diag': (line: string) => void
}

export type EventName = keyof EventMap
