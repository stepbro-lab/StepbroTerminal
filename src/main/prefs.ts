import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import type { Prefs, WorkspaceState } from '@shared/types'

export const defaultPrefs: Prefs = {
  theme: 'system',
  accent: 'graphite',
  fontFamily: 'Geist Mono',
  fontSize: 13,
  lineHeight: 1.2,
  ligatures: false,
  cursorStyle: 'bar',
  cursorBlink: true,
  scrollback: 5000,
  notifications: true,
  sound: true,
  soundVolume: 80,
  sidebarWidth: 240,
  sidebarCollapsed: false,
  collapsedProjects: [],
  addedProjects: [],
  hiddenProjects: [],
  customPresets: [],
  presetUsage: {},
  flagHints: true,
  gpuRendering: true,
  resumeOnLaunch: true
}

function file(): string {
  return path.join(app.getPath('userData'), 'prefs.json')
}

export function loadPrefs(): Prefs {
  try {
    const raw = JSON.parse(fs.readFileSync(file(), 'utf8'))
    // 'JetBrains Mono' used to be the default terminal font; move those who never chose it
    // themselves onto the new default. Anyone can pick JetBrains Mono again in Settings.
    if (raw && raw.fontFamily === 'JetBrains Mono') raw.fontFamily = defaultPrefs.fontFamily
    return { ...defaultPrefs, ...raw }
  } catch {
    return { ...defaultPrefs }
  }
}

function workspaceFile(): string {
  return path.join(app.getPath('userData'), 'workspace.json')
}

export function loadWorkspace(): WorkspaceState | null {
  try {
    const w = JSON.parse(fs.readFileSync(workspaceFile(), 'utf8')) as WorkspaceState
    return Array.isArray(w?.views) ? w : null
  } catch {
    return null
  }
}

let workspaceTimer: NodeJS.Timeout | null = null
export function saveWorkspace(state: WorkspaceState): void {
  if (workspaceTimer) clearTimeout(workspaceTimer)
  workspaceTimer = setTimeout(() => {
    workspaceTimer = null
    try {
      fs.writeFileSync(workspaceFile(), JSON.stringify(state))
    } catch {
      /* non-fatal */
    }
  }, 300)
}

export function savePrefs(p: Prefs): void {
  try {
    fs.mkdirSync(path.dirname(file()), { recursive: true })
    fs.writeFileSync(file(), JSON.stringify(p, null, 2))
  } catch {
    /* non-fatal */
  }
}
