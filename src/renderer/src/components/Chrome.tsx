import { useEffect, useState } from 'react'
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
/** The band along the left edge that brings the sidebar back, and how long the pointer rests in it first. */
const EDGE_WIDTH = 28
const EDGE_DWELL_MS = 120
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
  const withButtons = collapsed && !settingsOpen
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
 * With the sidebar folded away, the left edge of the window brings it back: bring the pointer to
 * the band along it and let it rest a moment, and the sidebar unfolds, and stays, the way it does
 * from its own button. The band is followed from the pointer's position rather than laid over
 * the terminal, so the terminal under it still takes clicks and selections; a hairline lights up
 * along the edge while the pointer is there, so the band is not a thing to hunt for. Nothing
 * happens while a button is held, which is a selection, not a visit.
 */
export function EdgeReveal() {
  const setPrefs = usePrefs((s) => s.set)
  const [near, setNear] = useState(false)
  useEffect(() => {
    let timer = 0
    let inside = false
    const leave = (): void => {
      inside = false
      setNear(false)
      window.clearTimeout(timer)
    }
    const onMove = (e: MouseEvent): void => {
      const inBand = e.clientX < EDGE_WIDTH && e.clientY >= CHROME_H && e.buttons === 0
      if (inBand && !inside) {
        inside = true
        setNear(true)
        timer = window.setTimeout(() => void setPrefs({ sidebarCollapsed: false }), EDGE_DWELL_MS)
      } else if (!inBand && inside) {
        leave()
      }
    }
    document.addEventListener('mousemove', onMove)
    document.documentElement.addEventListener('mouseleave', leave)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.documentElement.removeEventListener('mouseleave', leave)
      window.clearTimeout(timer)
    }
  }, [setPrefs])
  return <div className="edge-hint" data-near={near} aria-hidden="true" />
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
 */
export function TopStrip({ tall = false }: { tall?: boolean }) {
  return <div className="drag shrink-0" style={{ height: tall ? 'var(--chrome-h)' : 8 }} />
}
