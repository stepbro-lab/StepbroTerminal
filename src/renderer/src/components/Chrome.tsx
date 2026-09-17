import { useEffect, useRef, useState } from 'react'
import { AudioLines, Copy, Minus, PanelLeft, Settings, Square, X } from 'lucide-react'
import { useUi } from '@/stores/ui'
import { usePrefs } from '@/stores/prefs'
import { ActivityPulse } from './ActivityPulse'
import { UpdatePill } from './UpdatePill'
import { NotesButton } from './notes/NotesButton'
import { useVoice } from '@/stores/voice'
import { titled } from '@/lib/shortcuts'
import { Spring, type SpringConfig } from '@/lib/spring'
import { registry } from '@/terminal/TerminalRegistry'
import { t } from '@/lib/i18n'

const platform = window.step.platform
const mac = platform === 'darwin'
/** The open bar's height, and the frame's depth at rest, in pixels: the same as --chrome-h and --frame. */
const BAR_H = 36
const FRAME = 8
/** How far the bar has opened when a Mac's traffic lights show: by then the terminal's edge is below them. */
const LIGHTS_AT = 0.55
/** How long the pointer may be off the bar before it closes, so brushing past the edge does not close it. */
const LINGER_MS = 220
/** A window event that opens the bar from elsewhere in the page; it closes as usual once nothing holds it. */
export const OPEN_BAR = 'step:open-bar'
/** Opens quickly and settles without bouncing: the terminal's edge must not wobble under the buttons. */
const OPEN: SpringConfig = { stiffness: 520, damping: 44 }
const CLOSE: SpringConfig = { stiffness: 420, damping: 42 }

/** Shows or hides the sidebar. */
function SidebarToggle() {
  const collapsed = usePrefs((s) => s.prefs?.sidebarCollapsed ?? false)
  const setPrefs = usePrefs((s) => s.set)
  return (
    <button className="icon-btn no-drag" data-on={!collapsed} title={titled(t('Toggle sidebar'), 'toggle-sidebar')} onClick={() => void setPrefs({ sidebarCollapsed: !collapsed })}>
      <PanelLeft size={15} />
    </button>
  )
}

/** The buttons that belong to the window rather than to a pane: activity, updates, voice, notes, settings. */
function ChromeButtons() {
  const voice = useVoice((s) => s.state)
  const press = useVoice((s) => s.press)
  const release = useVoice((s) => s.release)
  const settingsOpen = useUi((s) => s.settingsOpen)
  const setSettingsOpen = useUi((s) => s.setSettingsOpen)
  return (
    <div className="no-drag flex items-center gap-0.5">
      <ActivityPulse />
      <UpdatePill />
      <button
        className="icon-btn voice-btn"
        data-voice={voice}
        title={titled(t('Hold to talk'), 'voice')}
        onMouseDown={press}
        onMouseUp={release}
        onMouseLeave={release}
      >
        <AudioLines size={15} />
      </button>
      <NotesButton />
      <button className="icon-btn" data-on={settingsOpen} title={titled(t('Settings'), 'settings')} onClick={() => setSettingsOpen(!settingsOpen)}>
        <Settings size={15} />
      </button>
    </div>
  )
}

/**
 * Windows and Linux: minimize, maximize and close, drawn the way each system draws its own. On
 * Windows that is its icon font, the same glyphs its title bars use; close turns red.
 */
function CaptionButtons() {
  const maximized = useUi((s) => s.maximized)
  const win = platform === 'win32'
  return (
    <div className="caption no-drag" data-os={win ? 'win' : 'linux'}>
      <button className="caption-btn" title={t('Minimize')} onClick={() => window.step.send('win:minimize')}>
        {win ? '\uE921' : <Minus size={14} />}
      </button>
      <button className="caption-btn" title={t(maximized ? 'Restore' : 'Maximize')} onClick={() => window.step.send('win:maximize')}>
        {win ? (maximized ? '\uE923' : '\uE922') : maximized ? <Copy size={11} /> : <Square size={11} />}
      </button>
      <button className="caption-btn" data-k="close" title={t('Close')} onClick={() => window.step.send('win:close')}>
        {win ? '\uE8BB' : <X size={14} />}
      </button>
    </div>
  )
}

/**
 * The window's top edge, which grows into a bar while the pointer is on it, the way Helium does
 * it. At rest the terminal fills the window inside a thin, even frame and no button shows. Bring
 * the pointer to the top edge and the frame's top grows, pushing the terminal down to make room
 * for a bar with the window's buttons in it: a Mac's traffic lights appear once there is room for
 * them (they cannot move, so the bar opens around where they are), and on Windows and Linux ours
 * sit at the right. The terminals fit their new size once, when the bar has settled, not on
 * every frame of the way.
 *
 * The bar's progress lives in --bar on the frame, and how far it pushes the terminal down in
 * --bar-push, which the frame's top padding follows (see global.css). The push moves in whole
 * device pixels: a terminal drawn with WebGL watches its canvas's size in device pixels, and a
 * canvas nudged by a fraction of one can round to a pixel more or less, which clears it until
 * the next frame and makes the text blink.
 * The main process watches the pointer while the bar is open, since the bar is a drag region and
 * the page cannot see the pointer over it.
 */
export function TopBar() {
  const fullscreen = useUi((s) => s.fullscreen)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const openBar = useRef<() => void>(() => {})

  useEffect(() => {
    const frame = ref.current?.parentElement
    if (!frame) return
    let isOpen = false
    let inside = false
    let lights = false
    let linger = 0
    let holding = false
    const holdFits = (): void => {
      if (holding) return
      holding = true
      registry.holdFits()
    }
    const releaseFits = (): void => {
      if (!holding) return
      holding = false
      registry.releaseFits()
    }
    const showLights = (v: boolean): void => {
      if (lights === v) return
      lights = v
      window.step.send('win:buttons', v)
    }
    const spring = new Spring(0, (v) => {
      const r = Math.max(0, v)
      const dpr = window.devicePixelRatio || 1
      frame.style.setProperty('--bar', r.toFixed(4))
      frame.style.setProperty('--bar-push', `${Math.round(r * (BAR_H - FRAME) * dpr) / dpr}px`)
      if (r > 0.001) frame.setAttribute('data-bar', '')
      else frame.removeAttribute('data-bar')
      if (isOpen && r >= LIGHTS_AT) showLights(true)
    }, releaseFits)
    const close = (): void => {
      if (!isOpen) return
      isOpen = false
      setOpen(false)
      window.step.send('win:bar', 0)
      showLights(false)
      holdFits()
      spring.to(0, CLOSE)
    }
    const closeSoon = (): void => {
      window.clearTimeout(linger)
      linger = window.setTimeout(() => {
        if (inside) return
        // A list opened from one of the bar's buttons hangs below it; the bar waits for it to go.
        if (document.querySelector('[data-bar-keep]')) return closeSoon()
        close()
      }, LINGER_MS)
    }
    openBar.current = () => {
      window.clearTimeout(linger)
      if (isOpen) return
      isOpen = true
      inside = true
      setOpen(true)
      window.step.send('win:bar', BAR_H)
      holdFits()
      spring.to(1, OPEN)
    }
    const offs = [
      window.step.on('win:barPointer', (now) => {
        inside = now
        if (now) window.clearTimeout(linger)
        else if (isOpen) closeSoon()
      }),
      window.step.on('win:topEdge', () => openBar.current())
    ]
    const onOpenBar = (): void => openBar.current()
    window.addEventListener(OPEN_BAR, onOpenBar)
    return () => {
      offs.forEach((off) => off())
      window.removeEventListener(OPEN_BAR, onOpenBar)
      window.clearTimeout(linger)
      spring.stop()
      releaseFits()
      if (isOpen) window.step.send('win:bar', 0)
      showLights(false)
    }
  }, [])

  return (
    <>
      {!open && <div className="bar-edge no-drag" onMouseEnter={(e) => e.buttons === 0 && openBar.current()} />}
      <div ref={ref} className={open ? 'topbar drag' : 'topbar'} data-open={open}>
        {/* The sidebar's button stays at the left, over the sidebar, after a Mac's traffic lights. The
            rest take the end the system's own buttons leave free: the right on a Mac, the left elsewhere. */}
        {mac ? (
          <>
            <div className="topbar-buttons no-drag" style={{ paddingLeft: fullscreen ? 12 : 84 }}>
              <SidebarToggle />
            </div>
            <div className="topbar-buttons" style={{ marginLeft: 'auto', paddingRight: 10 }}>
              <ChromeButtons />
            </div>
          </>
        ) : (
          <>
            <div className="topbar-buttons gap-0.5" style={{ paddingLeft: 12 }}>
              <SidebarToggle />
              <ChromeButtons />
            </div>
            <CaptionButtons />
          </>
        )}
      </div>
    </>
  )
}
