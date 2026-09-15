import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import type { Prefs, WorkspaceState } from '@shared/types'

export const defaultPrefs: Prefs = {
  theme: 'system',
  accent: 'graphite',
  fontFamily: 'JetBrains Mono',
  fontSize: 13,
  lineHeight: 1,
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
  resumeOnLaunch: true,
  launchConfigs: [],
  keybindings: {},
  language: 'en'
}

function file(): string {
  return path.join(app.getPath('userData'), 'prefs.json')
}

export function loadPrefs(): Prefs {
  try {
    const raw = JSON.parse(fs.readFileSync(file(), 'utf8'))
    // 'Geist Mono' at line height 1.2 used to be the default terminal text; those who never
    // chose it themselves move onto the new default. Anyone can pick Geist Mono again in Settings.
    if (raw && raw.fontFamily === 'Geist Mono') {
      raw.fontFamily = defaultPrefs.fontFamily
      if (raw.lineHeight === 1.2) raw.lineHeight = defaultPrefs.lineHeight
    }
    // A short-lived default of 1.1 sat between the two; it moves on as well.
    if (raw && raw.fontFamily === 'JetBrains Mono' && raw.lineHeight === 1.1) raw.lineHeight = defaultPrefs.lineHeight
    // The logo's looks were "mono" and "color" before they became the light and dark tiles.
    if (raw && raw.logo !== undefined) {
      const legacy: Record<string, string> = { mono: 'light', color: 'dark' }
      const logo = String(raw.logo)
      if (logo in legacy) raw.logo = legacy[logo]
      else if (logo !== 'light' && logo !== 'dark') delete raw.logo
    }
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
