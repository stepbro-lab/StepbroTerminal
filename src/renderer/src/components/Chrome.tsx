import { useRef } from 'react'
import { Minus, PanelLeft, Square, X, Copy } from 'lucide-react'
import { usePrefs } from '@/stores/prefs'
import { useUi } from '@/stores/ui'
import { ActivityPulse } from './ActivityPulse'
import { UpdatePill } from './UpdatePill'
import { NotesButton } from './notes/NotesButton'
import { t } from '@/lib/i18n'

const platform = window.step.platform
/** Windows and Linux draw their own caption buttons; on Windows they show only while hovered. */
const ownControls = platform === 'win32' || platform === 'linux'
/** Room for the traffic lights at the left of whichever row sits at the top of a Mac window. */
const macInset = (fullscreen: boolean): number => (platform === 'darwin' && !fullscreen ? 78 : 8)
/** The row's height: tall enough for the traffic lights on a Mac, as thin as its buttons elsewhere. */
const rowHeight = platform === 'darwin' ? 'var(--titlebar-h)' : 'var(--strip-h)'

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

/** The top row of the sidebar: the window's buttons, after the traffic lights on a Mac. The window drags by it. */
export function SidebarHeader() {
  const fullscreen = useUi((s) => s.fullscreen)
  return (
    <div className="drag flex shrink-0 items-center" style={{ height: rowHeight, width: 'var(--sidebar-w)', paddingLeft: macInset(fullscreen), paddingRight: 8 }}>
      <ChromeButtons />
    </div>
  )
}

/**
 * What sits above the panes. On a Mac with the sidebar open, nothing but the cards' top margin:
 * the traffic lights live in the sidebar's header and the pane's own header is the top row, the
 * way Unpeel draws it. Windows and Linux keep a thin strip for the caption buttons and for
 * dragging the window. With the sidebar folded away the strip also carries the window's buttons,
 * so the sidebar can be unfolded again.
 */
export function TopStrip({ chrome = true }: { chrome?: boolean }) {
  const prefs = usePrefs((s) => s.prefs)
  const maximized = useUi((s) => s.maximized)
  const captionHover = useUi((s) => s.captionHover)
  const fullscreen = useUi((s) => s.fullscreen)
  const collapsed = chrome && (prefs?.sidebarCollapsed ?? false)

  // The drag region never reports the pointer to the page (Windows treats it as the caption), so
  // the main process watches it; the parts of the strip that are ours report through this ping.
  const lastPing = useRef(0)
  const ping = (): void => {
    const now = performance.now()
    if (now - lastPing.current < 150) return
    lastPing.current = now
    window.step.send('win:captionPing')
  }

  if (!ownControls && !collapsed) return <div className="h-2 shrink-0" />
  return (
    <div
      className="drag relative flex shrink-0 items-center"
      style={{ height: rowHeight, paddingLeft: collapsed ? macInset(fullscreen) : 8, paddingRight: 6 }}
      onMouseMove={platform === 'win32' ? ping : undefined}
    >
      {collapsed && <ChromeButtons />}
      {ownControls && (
        <div className={`no-drag ml-auto flex items-center gap-0.5 ${platform === 'win32' ? 'win-controls' : ''}`} data-show={platform === 'win32' ? captionHover : undefined}>
          <button className="icon-btn" onClick={() => window.step.send('win:minimize')} title={t('Minimize')}>
            <Minus size={14} />
          </button>
          <button className="icon-btn" onClick={() => window.step.send('win:maximize')} title={t(maximized ? 'Restore' : 'Maximize')}>
            {maximized ? <Copy size={12} /> : <Square size={12} />}
          </button>
          <button className="icon-btn win-close" onClick={() => window.step.send('win:close')} title={t('Close')}>
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
