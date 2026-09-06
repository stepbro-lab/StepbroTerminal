import { app, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

export const APP_NAME = 'stepbro terminal'
export const APP_ID = 'com.stepbro.terminal'

/** Path of the app logo PNG used inside notifications. */
export function appLogoPath(): string {
  const base = app.isPackaged ? path.join(process.resourcesPath, 'icons') : path.join(app.getAppPath(), 'resources', 'icons')
  return path.join(base, 'app-256.png')
}

/**
 * Windows only shows an app's name and icon in toasts when a Start Menu shortcut carries its
 * AppUserModelId. The installer creates one; in development we write it ourselves.
 */
export function ensureWindowsShortcut(): void {
  if (process.platform !== 'win32' || app.isPackaged) return
  try {
    const dir = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs')
    const link = path.join(dir, `${APP_NAME} (dev).lnk`)
    const icon = path.join(app.getAppPath(), 'build', 'icon.ico')
    shell.writeShortcutLink(link, 'create', {
      target: process.execPath,
      args: `"${app.getAppPath()}"`,
      cwd: app.getAppPath(),
      appUserModelId: APP_ID,
      icon: fs.existsSync(icon) ? icon : process.execPath,
      iconIndex: 0,
      description: `${APP_NAME} (development)`
    })
  } catch {
    /* shortcut is a nicety; notifications still work without it */
  }
}

/** Carries preferences over from the folder the app used before it was renamed. */
export function migrateUserData(): void {
  const current = app.getPath('userData')
  const previous = path.join(path.dirname(current), 'Step')
  if (current === previous || !fs.existsSync(previous)) return
  for (const file of ['prefs.json', 'prompts.jsonl']) {
    const from = path.join(previous, file)
    const to = path.join(current, file)
    if (fs.existsSync(from) && !fs.existsSync(to)) {
      try {
        fs.mkdirSync(current, { recursive: true })
        fs.copyFileSync(from, to)
      } catch {
        /* start fresh */
      }
    }
  }
}
