/**
 * The pill that floats while you are talking to the terminal. It is up for the whole turn, over
 * whatever is in front — another program, or the terminal itself — because the window draws
 * nothing of the conversation and a key held down has to show somewhere that it was heard.
 *
 * It never takes the focus: you keep typing wherever you were. It can be dragged out of the way,
 * and where you leave it is where it comes back.
 */
import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'

/** Room for the pill and for its shadow: open, and folded down to a bead. */
const OPEN = { width: 322, height: 84 }
const FOLDED = { width: 112, height: 84 }
/** How far above the bottom of the screen it sits when it has never been moved. */
const LIFT = 96

/** The states worth showing. Idle, over and never started all mean the pill has no business being up. */
const SHOWN = new Set(['connecting', 'talking', 'answering'])

let hud: BrowserWindow | null = null
let ready = false
/** The state that arrived before the page had loaded, sent as soon as it has. */
let pending: string | null = null
let state = 'off'

interface Place {
  x: number
  y: number
}

let saved: Place | undefined
let onMoved: (p: Place) => void = () => {}
/** Folded down to a bead. It is a matter of room on screen: the conversation carries on regardless. */
let folded = false
/** Set while we are the ones moving it, so our own resize is not mistaken for a drag. */
let moving = false

const size = (): { width: number; height: number } => (folded ? FOLDED : OPEN)

/** Where it was left last time, how it was left, and where to remember it when it is dragged. */
export function rememberVoiceHud(o: { at: Place | undefined; folded: boolean; moved: (p: Place) => void }): void {
  saved = o.at
  folded = o.folded
  onMoved = o.moved
}

/**
 * Folded or opened again. It grows and shrinks about its own middle rather than its left edge, so
 * the bead is left where the pill was rather than jumping to one side of it.
 */
export function foldVoiceHud(next: boolean): void {
  if (folded === next) return
  const was = size()
  folded = next
  const now = size()
  if (!hud || hud.isDestroyed()) return
  const [x, y] = hud.getPosition()
  moving = true
  hud.setBounds({ x: Math.round(x + (was.width - now.width) / 2), y, ...now })
  moving = false
}

function build(): BrowserWindow {
  const win = new BrowserWindow({
    ...size(),
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    // Never takes the focus from the program you are working in, which is the whole point of it.
    focusable: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      spellcheck: false,
      backgroundThrottling: false
    }
  })
  // Above full-screen apps and other always-on-top windows, and on every desktop, so it is there
  // whichever space you happen to be working in.
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.webContents.on('did-finish-load', () => {
    ready = true
    if (pending) {
      win.webContents.send('voice:hud', pending)
      pending = null
    }
  })
  // Dragged somewhere better: that is where it belongs from now on.
  win.on('moved', () => {
    if (win.isDestroyed() || moving) return
    const [x, y] = win.getPosition()
    saved = { x, y }
    onMoved(saved)
  })
  win.on('closed', () => {
    hud = null
    ready = false
  })
  const url = process.env['ELECTRON_RENDERER_URL']
  if (url) void win.loadURL(`${url}#voice`)
  else void win.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'voice' })
  return win
}

function within(p: Place, area: Electron.Rectangle): boolean {
  const { width, height } = size()
  return p.x + width / 2 >= area.x && p.x + width / 2 <= area.x + area.width && p.y >= area.y && p.y + height / 2 <= area.y + area.height
}

/**
 * Where it was left, if that is still somewhere it can be seen; otherwise the bottom centre of
 * the screen the pointer is on, which is the screen the person is looking at. A monitor that has
 * been unplugged since must not take the pill off the desk with it.
 */
function place(win: BrowserWindow): void {
  const { width, height } = size()
  const at = saved && screen.getAllDisplays().some((d) => within(saved!, d.workArea)) ? saved : null
  moving = true
  if (at) {
    win.setBounds({ x: at.x, y: at.y, width, height })
  } else {
    const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
    win.setBounds({
      x: Math.round(area.x + (area.width - width) / 2),
      y: Math.round(area.y + area.height - LIFT),
      width,
      height
    })
  }
  moving = false
}

/** The conversation moved on: connecting, talking, answering, or over. */
export function voiceState(next: string): void {
  state = next
  if (!SHOWN.has(state)) {
    hud?.hide()
    return
  }
  if (!hud || hud.isDestroyed()) {
    hud = build()
    ready = false
  }
  if (ready) hud.webContents.send('voice:hud', state)
  else pending = state
  if (!hud.isVisible()) {
    place(hud)
    // Shown without being activated, so the program you are typing in keeps the keyboard.
    hud.showInactive()
  }
}

/** How loud each side is, on its way to the wave. Dropped when there is nothing on screen to move. */
export function voiceLevel(mine: number, theirs: number): void {
  if (!hud || hud.isDestroyed() || !ready || !hud.isVisible()) return
  hud.webContents.send('voice:hudLevel', mine, theirs)
}

export function destroyVoiceHud(): void {
  if (hud && !hud.isDestroyed()) hud.destroy()
  hud = null
}
