import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import type { Prefs } from '@shared/types'

export const defaultPrefs: Prefs = {
  theme: 'system',
  accent: 'graphite',
  fontFamily: 'JetBrains Mono',
  fontSize: 13,
  lineHeight: 1.2,
  ligatures: false,
  cursorStyle: 'bar',
  cursorBlink: true,
  scrollback: 5000,
  notifications: true,
  sound: false,
  sidebarWidth: 240,
  sidebarCollapsed: false,
  collapsedProjects: [],
  addedProjects: [],
  hiddenProjects: [],
  customPresets: [],
  presetUsage: {}
}

function file(): string {
  return path.join(app.getPath('userData'), 'prefs.json')
}

export function loadPrefs(): Prefs {
  try {
    const raw = JSON.parse(fs.readFileSync(file(), 'utf8'))
    return { ...defaultPrefs, ...raw }
  } catch {
    return { ...defaultPrefs }
  }
}

export function savePrefs(p: Prefs): void {
  try {
    fs.mkdirSync(path.dirname(file()), { recursive: true })
    fs.writeFileSync(file(), JSON.stringify(p, null, 2))
  } catch {
    /* non-fatal */
  }
}
