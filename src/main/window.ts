import { app, BrowserWindow, nativeImage, nativeTheme, screen, shell } from 'electron'
import { appLogoPath, dockLogoPath } from './branding'
import { join } from 'node:path'
import type { Prefs } from '@shared/types'
import { canBlurBehind, isTranslucent } from '@shared/frame'

const BG = { light: '#f6f3f2', dark: '#1c1b1b' }
const CLEAR = '#00000000'
/**
 * What the system draws behind a translucent frame. On a Mac, the most see-through of its
 * materials in both light and dark (compared side by side on macOS 27; sidebar and under-window
 * are among the most opaque). On Windows 11, acrylic, which blurs what is behind the window.
 */
const VIBRANCY = 'fullscreen-ui' as const
const MATERIAL = 'acrylic' as const
/** The open bar along the top edge, in CSS pixels: the same as --chrome-h. */
const BAR_H = 36
/** A Mac's traffic lights are 14 DIP circles; the position they are given is their top-left corner. */
const LIGHT = 14

export function isDark(prefs: Prefs): boolean {
  return prefs.theme === 'system' ? nativeTheme.shouldUseDarkColors : prefs.theme === 'dark'
}

/**
 * The chosen logo on the window and taskbar (Windows, Linux) or the Dock (macOS). The installers
 * carry the default look; this is what lets the person pick the other one in Settings.
 */
export function applyAppIcon(win: BrowserWindow, prefs: Prefs): void {
  const logo = prefs.logo ?? 'light'
  const mac = process.platform === 'darwin'
  const image = nativeImage.createFromPath(mac ? dockLogoPath(logo) : appLogoPath(logo))
  if (image.isEmpty()) return
  if (mac) app.dock?.setIcon(image)
  else win.setIcon(image)
}

/** The window shows the blurred desktop behind it (see isTranslucent). */
function translucent(prefs: Prefs): boolean {
  return isTranslucent(prefs, process.platform, process.getSystemVersion())
}
/** Whether each window has the material behind it now, so a slider dragged through its values does not ask again on every step. */
const materials = new WeakMap<BrowserWindow, boolean>()

export function createWindow(prefs: Prefs): BrowserWindow {
  const platform = process.platform
  followTheme(prefs)
  const clear = translucent(prefs)
  const win = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 720,
    minHeight: 480,
    show: false,
    title: 'stepbro terminal',
    backgroundColor: clear ? CLEAR : isDark(prefs) ? BG.dark : BG.light,
    // No title bar on any system: the window is the terminal inside a thin frame. The window's
    // buttons show only while the pointer is at the top edge, where the frame grows into a bar for
    // them: a Mac's own traffic lights, hidden until then; on Windows and Linux buttons of ours,
    // drawn the way those systems draw theirs, since the system's own there cannot be hidden.
    ...(platform === 'darwin'
      ? { titleBarStyle: 'hidden' as const, trafficLightPosition: lightsAt(1), ...(clear ? { vibrancy: VIBRANCY } : {}) }
      : { frame: false, ...(clear ? { backgroundMaterial: MATERIAL } : {}) }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      spellcheck: false,
      backgroundThrottling: false,
      webviewTag: true
    }
  })
  materials.set(win, clear)
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
  watchBar(win)
  if (platform === 'win32') watchTopEdge(win)
  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

/**
 * Keeps the window background in step with the theme, so resizes never flash the wrong color;
 * and the material behind it or not. A translucent window has no color of its own: the system
 * draws its material behind the page, and the page lays its frame and terminal over it at the
 * opacity each is set to.
 */
export function applyWindowTheme(win: BrowserWindow, prefs: Prefs): void {
  followTheme(prefs)
  const clear = translucent(prefs)
  win.setBackgroundColor(clear ? CLEAR : isDark(prefs) ? BG.dark : BG.light)
  if (materials.get(win) === clear) return
  materials.set(win, clear)
  if (process.platform === 'darwin') win.setVibrancy(clear ? VIBRANCY : null)
  else if (canBlurBehind(process.platform, process.getSystemVersion())) win.setBackgroundMaterial(clear ? MATERIAL : 'none')
}

/**
 * The system's own light or dark for this app: the material behind a translucent frame takes
 * it, and it should be the app's theme rather than the system's when the two differ.
 */
function followTheme(prefs: Prefs): void {
  if (nativeTheme.themeSource !== prefs.theme) nativeTheme.themeSource = prefs.theme
}

// ---- the bar along the top edge: open while the pointer is on it ----

const BAR_CHECK_MS = 50
const bars = new WeakMap<BrowserWindow, (height: number) => void>()

/**
 * The page opens the bar when the pointer reaches the top edge, but cannot tell when it leaves:
 * the open bar is where the window drags from, and the system keeps the pointer to itself over a
 * drag region, as it does over a Mac's traffic lights. So while the bar is open the main process
 * watches the cursor, and tells the page each time it crosses the bar's lower edge or leaves the
 * window. The page decides when to close; a zero height ends the watch.
 */
function watchBar(win: BrowserWindow): void {
  let height = 0
  let inside: boolean | null = null
  let timer: NodeJS.Timeout | undefined
  const check = (): void => {
    if (win.isDestroyed() || !height) return
    const p = screen.getCursorScreenPoint()
    const b = win.getContentBounds()
    const now = p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + height
    if (now !== inside) {
      inside = now
      win.webContents.send('win:barPointer', now)
    }
    timer = setTimeout(check, BAR_CHECK_MS)
  }
  bars.set(win, (h) => {
    if (timer) clearTimeout(timer)
    height = h
    inside = null
    check()
  })
  win.on('closed', () => {
    if (timer) clearTimeout(timer)
  })
}

/** The page opened the bar, this many CSS pixels tall, or closed it with 0. The page may be zoomed; the cursor is in DIP. */
export function barWatch(win: BrowserWindow | null, height: number): void {
  if (win && !win.isDestroyed()) bars.get(win)?.(height * win.webContents.getZoomFactor())
}

/** A Mac's traffic lights, shown while the bar is open. Nothing to do elsewhere: those buttons are the page's. */
export function windowButtons(win: BrowserWindow | null, visible: boolean): void {
  if (!win || process.platform !== 'darwin' || win.isDestroyed()) return
  win.setWindowButtonVisibility(visible)
  // The page may be zoomed, and the bar with it: the lights are placed for the bar's size now.
  // Placed after they show, since a position given while they are hidden does not hold.
  if (visible) win.setWindowButtonPosition(lightsAt(win.webContents.getZoomFactor()))
}

/** Where the traffic lights go so they sit centred in the bar, as far from its left edge as from its top. */
function lightsAt(zoom: number): { x: number; y: number } {
  const p = Math.round((BAR_H * zoom - LIGHT) / 2)
  return { x: p, y: p }
}

// ---- Windows: the top edge of a window that is not maximized ----

const WM_NCMOUSEMOVE = 0x00a0
/** As deep as the frame the page draws around the terminal. */
const EDGE_DEPTH = 8
const EDGE_REPEAT_MS = 150

/**
 * A window without a frame keeps a few pixels along each side to resize by, and Windows treats
 * them as the frame: the page never sees the pointer there, and along the top that is most of
 * the edge that opens the bar. The frame reports the pointer moving over it, and the page is told.
 */
function watchTopEdge(win: BrowserWindow): void {
  let last = 0
  win.hookWindowMessage(WM_NCMOUSEMOVE, () => {
    const p = screen.getCursorScreenPoint()
    const b = win.getContentBounds()
    if (p.y >= b.y + EDGE_DEPTH || p.x < b.x || p.x >= b.x + b.width) return
    const now = Date.now()
    if (now - last < EDGE_REPEAT_MS) return
    last = now
    if (!win.isDestroyed()) win.webContents.send('win:topEdge')
  })
}
