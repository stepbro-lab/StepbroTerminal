import { app, BrowserWindow, nativeImage, nativeTheme, screen, shell } from 'electron'
import { join } from 'node:path'
import type { Prefs } from '@shared/types'

/** Height of the title bar in DIP; the same number as --titlebar-h in the renderer. */
export const TITLEBAR_HEIGHT = 40

const BG = { light: '#f6f3f2', dark: '#1c1b1b' }

export function isDark(prefs: Prefs): boolean {
  return prefs.theme === 'system' ? nativeTheme.shouldUseDarkColors : prefs.theme === 'dark'
}

export function createWindow(prefs: Prefs): BrowserWindow {
  const platform = process.platform
  // A packaged app draws its icon from the bundle; in development set it by hand so the window,
  // the taskbar and the macOS dock show the real logo instead of Electron's default.
  const devIcon = app.isPackaged ? undefined : nativeImage.createFromPath(join(app.getAppPath(), 'build', 'icon.png'))
  if (devIcon && !devIcon.isEmpty() && platform === 'darwin' && app.dock) app.dock.setIcon(devIcon)
  const win = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 720,
    minHeight: 480,
    show: false,
    title: 'StepbroTerminal',
    backgroundColor: isDark(prefs) ? BG.dark : BG.light,
    ...(devIcon && !devIcon.isEmpty() ? { icon: devIcon } : {}),
    // macOS keeps its traffic lights in our bar, centred on its height, with the sidebar toggle and
    // the rest of the bar's buttons following them on the same line. Windows and Linux draw no
    // frame at all: the bar is ours, and the caption buttons are ours too (on Windows they show
    // only on hover).
    ...(platform === 'darwin' ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 14, y: (TITLEBAR_HEIGHT - 12) / 2 } } : { frame: false }),
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
  // A file or folder dropped where nothing handles it must never replace the app with itself.
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  win.on('maximize', () => win.webContents.send('win:maximized', true))
  win.on('unmaximize', () => win.webContents.send('win:maximized', false))
  // In macOS full screen the traffic lights go away with the menu bar, and the space kept for them
  // in our bar goes with them.
  win.on('enter-full-screen', () => win.webContents.send('win:fullscreen', true))
  win.on('leave-full-screen', () => win.webContents.send('win:fullscreen', false))
  if (platform === 'win32') watchCaptionHover(win)
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

// ---- Windows: show our caption buttons only while the pointer is over the title bar ----

const WM_NCMOUSEMOVE = 0x00a0
const HIDE_CHECK_MS = 220
const pings = new WeakMap<BrowserWindow, () => void>()

/**
 * The title bar is a drag region, which Windows treats as the native caption: the page never sees
 * the pointer over it. So the main process watches instead. WM_NCMOUSEMOVE says the pointer is on
 * the caption, the renderer pings when it is over the bar's own buttons, and a short timer keeps
 * checking that the cursor is still inside the strip before the buttons are hidden again.
 */
function watchCaptionHover(win: BrowserWindow): void {
  let shown = false
  let timer: NodeJS.Timeout | undefined
  const inStrip = (): boolean => {
    const p = screen.getCursorScreenPoint()
    const b = win.getContentBounds()
    return p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + TITLEBAR_HEIGHT
  }
  const set = (v: boolean): void => {
    if (shown === v || win.isDestroyed()) return
    shown = v
    win.webContents.send('win:captionHover', v)
  }
  const check = (): void => {
    if (win.isDestroyed()) return
    if (inStrip()) {
      set(true)
      arm()
    } else {
      set(false)
    }
  }
  const arm = (): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(check, HIDE_CHECK_MS)
  }
  const seen = (): void => {
    set(true)
    arm()
  }
  win.hookWindowMessage(WM_NCMOUSEMOVE, seen)
  win.on('closed', () => {
    if (timer) clearTimeout(timer)
  })
  pings.set(win, seen)
}

/** The renderer saw the pointer over the client part of the title bar (its buttons, the tabs). */
export function captionPing(win: BrowserWindow | null): void {
  if (win) pings.get(win)?.()
}
