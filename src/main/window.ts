import { app, BrowserWindow, nativeImage, nativeTheme, screen, shell } from 'electron'
import { appLogoPath, dockLogoPath } from './branding'
import { join } from 'node:path'
import type { Prefs } from '@shared/types'

const BG = { light: '#f6f3f2', dark: '#1c1b1b' }

export function isDark(prefs: Prefs): boolean {
  return prefs.theme === 'system' ? nativeTheme.shouldUseDarkColors : prefs.theme === 'dark'
}

/**
 * The chosen logo on the window and taskbar (Windows, Linux) or the Dock (macOS). The installers
 * carry the default look; this is what lets the person pick the other one in Settings.
 */
export function applyAppIcon(win: BrowserWindow, prefs: Prefs): void {
  const logo = prefs.logo ?? 'mono'
  const mac = process.platform === 'darwin'
  const image = nativeImage.createFromPath(mac ? dockLogoPath(logo) : appLogoPath(logo))
  if (image.isEmpty()) return
  if (mac) app.dock?.setIcon(image)
  else win.setIcon(image)
}

export function createWindow(prefs: Prefs): BrowserWindow {
  const platform = process.platform
  const win = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 720,
    minHeight: 480,
    show: false,
    title: 'stepbro terminal',
    backgroundColor: isDark(prefs) ? BG.dark : BG.light,
    // No frame on any system: the terminal takes the whole window. The window's buttons live in
    // its top-left corner and show only while the pointer is there: macOS's own traffic lights,
    // kept hidden until then; on Windows and Linux three lights of ours drawn the same way.
    ...(platform === 'darwin' ? { titleBarStyle: 'hidden' as const, trafficLightPosition: { x: 12, y: 12 } } : { frame: false }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      spellcheck: false,
      backgroundThrottling: false,
      webviewTag: true
    }
  })
  applyAppIcon(win, prefs)
  if (platform === 'darwin') win.setWindowButtonVisibility(false)
  win.once('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  // A file or folder dropped where nothing handles it must never replace the app with itself.
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  win.on('maximize', () => win.webContents.send('win:maximized', true))
  win.on('unmaximize', () => win.webContents.send('win:maximized', false))
  // In macOS full screen the traffic lights go away with the menu bar.
  win.on('enter-full-screen', () => win.webContents.send('win:fullscreen', true))
  win.on('leave-full-screen', () => win.webContents.send('win:fullscreen', false))
  watchCorner(win)
  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

/** Keeps the window background in step with the theme, so resizes never flash the wrong color. */
export function applyWindowTheme(win: BrowserWindow, prefs: Prefs): void {
  win.setBackgroundColor(isDark(prefs) ? BG.dark : BG.light)
}

// ---- the window's buttons: shown while the pointer is in the top-left corner ----

const CORNER_CHECK_MS = 160
const corners = new WeakMap<BrowserWindow, (width: number, height: number) => void>()

/**
 * The corner is part of the page, so the page sees the pointer arrive and says so. It cannot see
 * it leave: on a Mac the traffic lights are native buttons that take the pointer for themselves
 * once shown, and on every system a drag region sits right beside the corner and swallows what
 * happens over it. So from then on the main process keeps looking at where the cursor is, and
 * hides the buttons again once it has left the corner.
 */
function watchCorner(win: BrowserWindow): void {
  let shown = false
  let zone = { width: 0, height: 0 }
  let timer: NodeJS.Timeout | undefined
  const inside = (): boolean => {
    const p = screen.getCursorScreenPoint()
    const b = win.getContentBounds()
    return p.x >= b.x && p.x < b.x + zone.width && p.y >= b.y && p.y < b.y + zone.height
  }
  const set = (v: boolean): void => {
    if (shown === v || win.isDestroyed()) return
    shown = v
    if (process.platform === 'darwin') win.setWindowButtonVisibility(v)
    win.webContents.send('win:cornerHover', v)
  }
  const check = (): void => {
    if (win.isDestroyed()) return
    if (inside()) {
      set(true)
      timer = setTimeout(check, CORNER_CHECK_MS)
    } else {
      set(false)
    }
  }
  corners.set(win, (width, height) => {
    zone = { width, height }
    if (timer) clearTimeout(timer)
    // Full screen on a Mac has no traffic lights to show; the corner's own buttons still show.
    check()
  })
  win.on('closed', () => {
    if (timer) clearTimeout(timer)
  })
}

/** The renderer saw the pointer enter the corner, which is this big. */
export function cornerEnter(win: BrowserWindow | null, width: number, height: number): void {
  if (win) corners.get(win)?.(width, height)
}
