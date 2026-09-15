import { useEffect } from 'react'
import { Copy, Minus, PanelLeft, Square, X } from 'lucide-react'
import { usePrefs } from '@/stores/prefs'
import { useUi } from '@/stores/ui'
import { ActivityPulse } from './ActivityPulse'
import { UpdatePill } from './UpdatePill'
import { NotesButton } from './notes/NotesButton'
import { t } from '@/lib/i18n'

const platform = window.step.platform
/** macOS brings its own traffic lights; Windows and Linux get caption buttons of ours, drawn their way. */
const ownButtons = platform !== 'darwin'
/** Room kept clear at the left of the top row for the window's buttons. */
export const CORNER_INSET = ownButtons ? 112 : 84
/** The band along the left edge that brings the sidebar out, and how long the pointer rests in it first. */
const EDGE_WIDTH = 100
const EDGE_DWELL_MS = 90
/**
 * How far past the sidebar's edge the pointer may wander with the sidebar staying out, and how
 * long it may be beyond that before the sidebar goes back: it goes when the pointer has clearly
 * left for the terminal, not when it strays a little.
 */
const PEEK_REACH = 160
const PEEK_LINGER_MS = 260
/** The window's top row, in pixels: the same as --chrome-h. */
const CHROME_H = 36

/** The buttons that belong to the window rather than to a pane: fold the sidebar, activity, updates, notes. */
function ChromeButtons() {
  const prefs = usePrefs((s) => s.prefs)
  const setPrefs = usePrefs((s) => s.set)
  const collapsed = prefs?.sidebarCollapsed ?? false
  return (
    <div className="no-drag flex items-center gap-0.5">
      <button className="icon-btn" data-on={!collapsed} title={t('Toggle sidebar')} onClick={() => void setPrefs({ sidebarCollapsed: !collapsed })}>
        <PanelLeft size={15} />
      </button>
      <ActivityPulse />
      <UpdatePill />
      <NotesButton />
    </div>
  )
}

/**
 * The window's buttons, in its top-left corner, out of sight until the pointer comes to them: a
 * Mac shows its traffic lights, Windows and Linux the caption buttons they know, minimize,
 * maximize and close, drawn flat the way their own title bars draw them. With the sidebar folded
 * away the window's own buttons join them here, so nothing stays on the screen but the terminal.
 * The page reports the pointer's arrival; the main process watches for it leaving, since the
 * lights and the drag region beside them take the pointer.
 */
export function WindowCorner() {
  const over = useUi((s) => s.cornerHover)
  const maximized = useUi((s) => s.maximized)
  const fullscreen = useUi((s) => s.fullscreen)
  const collapsed = usePrefs((s) => s.prefs?.sidebarCollapsed ?? false)
  const settingsOpen = useUi((s) => s.settingsOpen)
  const peek = useUi((s) => s.sidebarPeek)
  // While the sidebar is out for a look its own header carries these; two sets would overlap.
  const withButtons = collapsed && !settingsOpen && !peek
  const enter = (e: React.MouseEvent<HTMLDivElement>): void => {
    const r = e.currentTarget.getBoundingClientRect()
    window.step.send('win:cornerEnter', Math.ceil(r.right), Math.ceil(r.bottom))
  }
  return (
    <div className="corner no-drag" data-over={over} onMouseEnter={enter}>
      {ownButtons ? (
        <div className="caption">
          <button className="caption-btn" title={t('Minimize')} onClick={() => window.step.send('win:minimize')}>
            <Minus size={14} />
          </button>
          <button className="caption-btn" title={t(maximized ? 'Restore' : 'Maximize')} onClick={() => window.step.send('win:maximize')}>
            {maximized ? <Copy size={11} /> : <Square size={11} />}
          </button>
          <button className="caption-btn" data-k="close" title={t('Close')} onClick={() => window.step.send('win:close')}>
            <X size={14} />
          </button>
        </div>
      ) : (
        // The traffic lights are native and sit here on their own; this keeps their room.
        <div style={{ width: fullscreen ? 0 : 52 }} />
      )}
      {withButtons && <ChromeButtons />}
    </div>
  )
}

/**
 * With the sidebar folded away, the left side of the window brings it out for a look, the way
 * Arc and Zen do it: bring the pointer into the band along the edge and the sidebar slides in
 * over the terminal, which stays exactly as it was underneath. It stays out while the pointer is
 * on it or near it, and goes back once the pointer has moved well away or clicked something
 * else. Its own button unfolds it for good. Nothing happens while a button is held, which is a
 * selection, not a visit; and once it has gone back with the pointer still in the band, the
 * pointer has to leave the band and come in again before it counts.
 */
export function SidebarPeek() {
  const setPeek = useUi((s) => s.setSidebarPeek)
  const sidebarWidth = usePrefs((s) => s.prefs?.sidebarWidth ?? 240)
  useEffect(() => {
    let dwell = 0
    let linger = 0
    let inBand = false
    let armed = false
    let lastX = Infinity
    const out = (): boolean => useUi.getState().sidebarPeek
    const onAside = (target: EventTarget | null): boolean => !!(target as Element | null)?.closest?.('aside[data-peek]')
    const goBack = (): void => {
      window.clearTimeout(linger)
      window.clearTimeout(dwell)
      inBand = false
      armed = false
      if (out()) setPeek(false)
    }
    const onMove = (e: MouseEvent): void => {
      lastX = e.clientX
      if (out()) {
        // Well away from the sidebar for more than a moment, and it goes back.
        const near = e.clientX < sidebarWidth + PEEK_REACH
        if (near) {
          window.clearTimeout(linger)
          linger = 0
        } else if (!linger) {
          linger = window.setTimeout(goBack, PEEK_LINGER_MS)
        }
        return
      }
      const here = e.clientX < EDGE_WIDTH && e.clientY >= CHROME_H && e.buttons === 0
      if (!here) armed = true
      if (here && armed && !inBand) {
        inBand = true
        dwell = window.setTimeout(() => setPeek(true), EDGE_DWELL_MS)
      } else if (!here && inBand) {
        inBand = false
        window.clearTimeout(dwell)
      }
    }
    const onDown = (e: MouseEvent): void => {
      if (out() && !onAside(e.target)) goBack()
    }
    // The pointer "leaving" is also what the page sees when it crosses a drag region, the top row
    // or the sidebar's own header: the system takes the pointer there. So leaving only counts as
    // going away when the pointer was last seen well away; near the sidebar it is merely resting
    // on a drag region, or has left the window by the side the sidebar is on, and the sidebar stays.
    const onLeave = (): void => {
      window.clearTimeout(dwell)
      inBand = false
      if (out() && lastX >= sidebarWidth + PEEK_REACH) goBack()
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mousedown', onDown, true)
    document.documentElement.addEventListener('mouseleave', onLeave)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mousedown', onDown, true)
      document.documentElement.removeEventListener('mouseleave', onLeave)
      window.clearTimeout(dwell)
      window.clearTimeout(linger)
      setPeek(false)
    }
  }, [setPeek, sidebarWidth])
  return null
}

/** The top row of the sidebar: the window's buttons, after the room kept for the window's own. The window drags by it. */
export function SidebarHeader() {
  return (
    <div className="drag flex shrink-0 items-center" style={{ height: 'var(--chrome-h)', width: 'var(--sidebar-w)', paddingLeft: CORNER_INSET, paddingRight: 8 }}>
      <ChromeButtons />
    </div>
  )
}

/**
 * What sits above the panes: a drag strip and nothing else. Thin beside an open sidebar, whose
 * header carries the window's buttons; tall where the cards fill the window, so the corner and
 * the session rail have a row to sit in and the terminal starts a little below the top edge.
 *
 * While the sidebar is out for a look it lies over this strip, and the system adds up drag
 * regions without regard to what is drawn on top: the strip, coming later in the page, would
 * make the buttons in the sidebar's header a place to drag the window by instead of buttons. So
 * for as long as the sidebar is out, the part of the strip under it is cut out of the drag region.
 */
export function TopStrip({ tall = false }: { tall?: boolean }) {
  const peek = useUi((s) => s.sidebarPeek)
  return (
    <div className="drag flex shrink-0" style={{ height: tall ? 'var(--chrome-h)' : 8 }}>
      {peek && <div className="no-drag h-full shrink-0" style={{ width: 'var(--sidebar-w)' }} />}
    </div>
  )
}
