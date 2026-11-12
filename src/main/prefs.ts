import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import type { Prefs, WorkspaceState } from '@shared/types'
import { writeFileAtomic } from '@shared/atomic'
import { dropRetiredPrefs } from './retiredPrefs'

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
  frameOpacity: 0,
  contentOpacity: 0.9,
  resumeOnLaunch: true,
  launchConfigs: [],
  keybindings: {},
  language: 'en'
}

function file(): string {
  return path.join(app.getPath('userData'), 'prefs.json')
}

export function loadPrefs(): Prefs {
  let text: string | null = null
  try {
    text = fs.readFileSync(file(), 'utf8')
    const raw = JSON.parse(text)
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
    // A switch for the translucent frame came before its opacity; it never shipped, but it may be on disk.
    if (raw && 'translucentFrame' in raw) delete raw.translucentFrame
    const prefs = { ...defaultPrefs, ...raw }
    // What the voice agent kept, its Gemini key above all, goes with it, and off disk straight away.
    if (raw && dropRetiredPrefs(prefs)) savePrefs(prefs)
    return prefs
  } catch {
    // There, but unreadable: kept aside before the defaults are saved over it, so it can be mended by hand.
    if (text !== null) {
      try {
        fs.writeFileSync(`${file()}.unreadable`, text)
      } catch {
        /* nothing to do about it */
      }
    }
    // No preferences yet: a first launch, with nothing that changed since a version it never ran.
    return { ...defaultPrefs, seenVersion: app.getVersion() }
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
let workspaceWaiting: WorkspaceState | null = null
export function saveWorkspace(state: WorkspaceState): void {
  workspaceWaiting = state
  if (workspaceTimer) clearTimeout(workspaceTimer)
  workspaceTimer = setTimeout(flushWorkspace, 300)
}

/** Writes the layout still waiting to be saved, now: when its moment comes, and before the app quits. */
export function flushWorkspace(): void {
  if (workspaceTimer) clearTimeout(workspaceTimer)
  workspaceTimer = null
  const state = workspaceWaiting
  workspaceWaiting = null
  if (!state) return
  try {
    writeFileAtomic(workspaceFile(), JSON.stringify(state))
  } catch {
    /* non-fatal */
  }
}

export function savePrefs(p: Prefs): void {
  try {
    // It may hold a key: the person's alone to read.
    writeFileAtomic(file(), JSON.stringify(p, null, 2), 0o600)
  } catch {
    /* non-fatal */
  }
}
