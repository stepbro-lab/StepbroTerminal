import type { BrowserWindow } from 'electron'
import type { EventMap, EventName } from '@shared/ipc'
import type { HostState, Preset, Prefs, Project, Session, Note } from '@shared/types'
import type { HostClient } from './host/HostClient'
import type { HistoryIndex } from './claude/history'
import type { LiveClaudeWatcher } from './claude/liveSessions'
import type { Notifier } from './notifications'
import type { StepTray } from './tray'
import type { PromptLog } from './prompts'
import type { Updates } from './updates'

/** Everything the main process keeps in memory, shared between index.ts and ipc.ts. */
export interface Ctx {
  version: string
  prefs: Prefs
  env: NodeJS.ProcessEnv
  presets: Preset[]
  history: HistoryIndex
  live: LiveClaudeWatcher
  client: HostClient
  hostState: HostState
  sessions: Map<string, Session>
  win: BrowserWindow | null
  activeId: string | null
  notifier: Notifier
  tray: StepTray
  prompts: PromptLog
  updates: Updates
  /** Latest list from the host, so the renderer can ask for it on boot. */
  notes: Note[]
  /** Folders dropped on the app icon or named on the command line, waiting for the renderer. */
  pendingFolders: string[]
  /** True once the renderer has asked for pending folders; after that they are sent live. */
  rendererReady: boolean
  log: (...a: unknown[]) => void
  emit: <K extends EventName>(channel: K, ...args: Parameters<EventMap[K]>) => void
  setPrefs: (partial: Partial<Prefs>) => Prefs
  refreshPresets: () => Preset[]
  projects: () => Project[]
  emitProjects: () => void
  connectHost: () => Promise<void>
  restartHost: () => Promise<void>
}
