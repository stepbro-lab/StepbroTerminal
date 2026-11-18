import { app, BrowserWindow, nativeImage, nativeTheme, screen, shell } from 'electron'
import { appLogoPath, dockLogoPath } from './branding'
import { join } from 'node:path'
import type { Prefs } from '@shared/types'
import { canBlurBehind, isTranslucent } from '@shared/frame'

const BG = { light: '#f6f3f2', dark: '#1c1b1b' }
const CLEAR = '#00000000'
const VIBRANCY = 'fullscreen-ui' as const
const MATERIAL = 'acrylic' as const
const BAR_H = 36
const LIGHT = 14

export function isDark(prefs: Prefs): boolean {
  return prefs.theme === 'system' ? nativeTheme.shouldUseDarkColors : prefs.theme === 'dark'
}

export function applyAppIcon(win: BrowserWindow, prefs: Prefs): void {
  const logo = prefs.logo ?? 'light'
  const mac = process.platform === 'darwin'
  const image = nativeImage.createFromPath(mac ? dockLogoPath(logo) : appLogoPath(logo))
  if (image.isEmpty()) return
  if (mac) app.dock?.setIcon(image)
  else win.setIcon(image)
}

function translucent(prefs: Prefs): boolean {
  return isTranslucent(prefs, process.platform, process.getSystemVersion())
}

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

  win.webContents.on('will-navigate', (e) => e.preventDefault())
  const seen = (v: boolean) => () => {
    if (!win.isDestroyed()) win.webContents.send('win:seen', v)
  }
  win.on('minimize', seen(false))
  win.on('hide', seen(false))
  win.on('restore', seen(true))
  win.on('show', seen(true))
  win.on('maximize', () => win.webContents.send('win:maximized', true))
  win.on('unmaximize', () => win.webContents.send('win:maximized', false))
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

export function applyWindowTheme(win: BrowserWindow, prefs: Prefs): void {
  followTheme(prefs)
  const clear = translucent(prefs)
  win.setBackgroundColor(clear ? CLEAR : isDark(prefs) ? BG.dark : BG.light)
  if (materials.get(win) === clear) return
  materials.set(win, clear)
  if (process.platform === 'darwin') win.setVibrancy(clear ? VIBRANCY : null)
  else if (canBlurBehind(process.platform, process.getSystemVersion())) win.setBackgroundMaterial(clear ? MATERIAL : 'none')
}

function followTheme(prefs: Prefs): void {
  if (nativeTheme.themeSource !== prefs.theme) nativeTheme.themeSource = prefs.theme
}

const BAR_CHECK_MS = 50
const bars = new WeakMap<BrowserWindow, (height: number) => void>()

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

export function barWatch(win: BrowserWindow | null, height: number): void {
  if (win && !win.isDestroyed()) bars.get(win)?.(height * win.webContents.getZoomFactor())
}

export function windowButtons(win: BrowserWindow | null, visible: boolean): void {
  if (!win || process.platform !== 'darwin' || win.isDestroyed()) return
  win.setWindowButtonVisibility(visible)
  if (visible) win.setWindowButtonPosition(lightsAt(win.webContents.getZoomFactor()))
}

function lightsAt(zoom: number): { x: number; y: number } {
  const p = Math.round((BAR_H * zoom - LIGHT) / 2)
  return { x: p, y: p }
}

const WM_NCMOUSEMOVE = 0x00a0
const EDGE_DEPTH = 8
const EDGE_REPEAT_MS = 150

// Windows treats the resize border as frame, so the page never sees the pointer on the top edge.
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
