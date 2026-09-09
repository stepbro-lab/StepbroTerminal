import { app, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
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
 * Windows shortcuts carry their own icon: the Start Menu entry the installer made, the one on the
 * desktop, and any pinned to the taskbar. They are pointed at the chosen look, so the app wears
 * it closed and pinned as well; the default look is the executable's own icon. Only shortcuts
 * that launch this executable are touched.
 */
export function applyShortcutIcons(logo: LogoId): void {
  if (process.platform !== 'win32') return
  const appData = app.getPath('appData')
  const dirs = [
    path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    app.getPath('desktop'),
    path.join(appData, 'Microsoft', 'Internet Explorer', 'Quick Launch', 'User Pinned', 'TaskBar')
  ]
  const exe = process.execPath.toLowerCase()
  // The packaged executable carries the default look itself; in development Electron's own binary does not.
  const icon = logo === 'mono' && app.isPackaged ? process.execPath : path.join(iconsDir(), `app-${logo}.ico`)
  let changed = 0
  for (const dir of dirs) {
    let names: string[] = []
    try {
      names = fs.readdirSync(dir).filter((n) => n.toLowerCase().endsWith('.lnk'))
    } catch {
      continue
    }
    for (const name of names) {
      const lnk = path.join(dir, name)
      try {
        const info = shell.readShortcutLink(lnk)
        if (info.target.toLowerCase() !== exe) continue
        if ((info.icon ?? '').toLowerCase() === icon.toLowerCase()) continue
        shell.writeShortcutLink(lnk, 'update', { ...info, icon, iconIndex: 0 })
        changed++
      } catch {
        /* not a shortcut of ours, or not writable */
      }
    }
  }
  if (changed) refreshIconCache()
}

/** Explorer keeps icons in a cache; this asks it to look again (a stock tool since Windows 10). */
function refreshIconCache(): void {
  try {
    const tool = path.join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32', 'ie4uinit.exe')
    spawn(tool, ['-show'], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
  } catch {
    /* the icons catch up on the next sign-in */
  }
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
