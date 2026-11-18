import { app, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import type { LogoId } from '@shared/types'

export const APP_NAME = 'stepbro terminal'
export const APP_ID = 'com.stepbro.terminal'

export function iconsDir(): string {
  return app.isPackaged ? path.join(process.resourcesPath, 'icons') : path.join(app.getAppPath(), 'resources', 'icons')
}

export function appLogoPath(logo: LogoId = 'light'): string {
  return path.join(iconsDir(), `app-256-${logo}.png`)
}

export function dockLogoPath(logo: LogoId = 'light'): string {
  return path.join(iconsDir(), `dock-${logo}.png`)
}

export function applyShortcutIcons(logo: LogoId): void {
  if (process.platform !== 'win32') return
  const appData = app.getPath('appData')
  const dirs = [
    path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    app.getPath('desktop'),
    path.join(appData, 'Microsoft', 'Internet Explorer', 'Quick Launch', 'User Pinned', 'TaskBar')
  ]
  const exe = process.execPath.toLowerCase()
  const icon = logo === 'light' && app.isPackaged ? process.execPath : path.join(iconsDir(), `app-${logo}.ico`)
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
      } catch {}
    }
  }
  if (changed) refreshIconCache()
}

function refreshIconCache(): void {
  try {
    const tool = path.join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32', 'ie4uinit.exe')
    spawn(tool, ['-show'], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
  } catch {}
}

// Windows only shows an app's name and icon in toasts if a Start Menu shortcut has its AppUserModelId.
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
  } catch {}
}

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
      } catch {}
    }
  }
}
