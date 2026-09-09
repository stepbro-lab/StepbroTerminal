import { app, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { LogoId } from '@shared/types'

export const APP_NAME = 'stepbro terminal'
export const APP_ID = 'com.stepbro.terminal'

/** The folder with the rendered icons, next to the app when packaged and in the repo in development. */
export function iconsDir(): string {
  return app.isPackaged ? path.join(process.resourcesPath, 'icons') : path.join(app.getAppPath(), 'resources', 'icons')
}

/** Path of the logo PNG in the chosen look: shown inside notifications, on the window and on the Dock. */
export function appLogoPath(logo: LogoId = 'mono'): string {
  return path.join(iconsDir(), `app-256-${logo}.png`)
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
