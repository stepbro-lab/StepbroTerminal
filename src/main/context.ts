import type { BrowserWindow } from 'electron'
import type { EventMap, EventName } from '@shared/ipc'
import type { HostState, Preset, Prefs, Project, Session, Note } from '@shared/types'
import type { HostClient } from './host/HostClient'
import type { HistoryIndex } from './claude/history'
import type { LiveClaudeWatcher } from './claude/liveSessions'
import type { Notifier } from './notifications'
import type { StepTray } from './tray'
import type { DiscordPresence } from './discord/presence'
import type { PromptLog } from './prompts'
import type { Updates } from './updates'
import type { PreviewBridge } from './preview'

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
  presence: DiscordPresence
  prompts: PromptLog
  updates: Updates
  previews: PreviewBridge
  notes: Note[]
  pendingFolders: string[]
  pendingWorkspaces: string[]
  rendererReady: boolean
  pendingFocus: string | null
  log: (...a: unknown[]) => void
  emit: <K extends EventName>(channel: K, ...args: Parameters<EventMap[K]>) => void
  setPrefs: (partial: Partial<Prefs>) => Prefs
  refreshPresets: () => Preset[]
  projects: () => Project[]
  emitProjects: () => void
  connectHost: () => Promise<void>
  restartHost: () => Promise<void>
}
