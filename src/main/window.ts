import { BrowserWindow, nativeTheme, shell } from 'electron'
import { join } from 'node:path'
import type { Prefs } from '@shared/types'

export const TITLEBAR_HEIGHT = 38

const COLORS = {
  light: { bg: '#f6f3f2', symbol: '#1c1b1b' },
  dark: { bg: '#1c1b1b', symbol: '#e5e2e1' }
}

export function isDark(prefs: Prefs): boolean {
  return prefs.theme === 'system' ? nativeTheme.shouldUseDarkColors : prefs.theme === 'dark'
}

export function createWindow(prefs: Prefs): BrowserWindow {
  const dark = isDark(prefs)
  const c = dark ? COLORS.dark : COLORS.light
  const platform = process.platform
  const win = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 720,
    minHeight: 480,
    show: false,
    title: 'StepbroTerminal',
    backgroundColor: c.bg,
    ...(platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 14, y: 12 } }
      : platform === 'win32'
        ? {
            titleBarStyle: 'hidden' as const,
            titleBarOverlay: { color: c.bg, symbolColor: c.symbol, height: TITLEBAR_HEIGHT }
          }
        : { frame: false }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      spellcheck: false,
      backgroundThrottling: false,
      webviewTag: true
    }
  })
  win.once('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.on('maximize', () => win.webContents.send('win:maximized', true))
  win.on('unmaximize', () => win.webContents.send('win:maximized', false))
  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

/** Keeps the native caption buttons (Windows) and the window background in sync with the theme. */
export function applyWindowTheme(win: BrowserWindow, prefs: Prefs): void {
  const c = isDark(prefs) ? COLORS.dark : COLORS.light
  win.setBackgroundColor(c.bg)
  if (process.platform === 'win32') {
    try {
      win.setTitleBarOverlay({ color: c.bg, symbolColor: c.symbol, height: TITLEBAR_HEIGHT })
    } catch {
      /* overlay unsupported on this build */
    }
  }
}
