import { useRef } from 'react'
import { Minus, PanelLeft, Square, X, Copy } from 'lucide-react'
import { usePrefs } from '@/stores/prefs'
import { useUi } from '@/stores/ui'
import { useData } from '@/stores/data'
import { ActivityPulse } from './ActivityPulse'
import { UpdatePill } from './UpdatePill'
import { NotesButton } from './notes/NotesButton'
import { StatusGlyph } from './sidebar/StatusGlyph'
import { defaultTitle, rowPresetId } from '@/lib/sidebarModel'

const platform = window.step.platform
/** Windows and Linux draw their own caption buttons; on Windows they show only while hovered. */
const ownControls = platform === 'win32' || platform === 'linux'

export function TitleBar() {
  const prefs = usePrefs((s) => s.prefs)
  const setPrefs = usePrefs((s) => s.set)
  const activeId = useUi((s) => s.activeId)
  const maximized = useUi((s) => s.maximized)
  const captionHover = useUi((s) => s.captionHover)
  const session = useData((s) => (activeId ? s.sessions[activeId] : undefined))
  const presets = useData((s) => s.presets)
  const collapsed = prefs?.sidebarCollapsed ?? false
  const color = session ? (presets.find((p) => p.id === rowPresetId(session))?.color ?? '#8a8a90') : '#8a8a90'

  // The drag region never reports the pointer to the page (Windows treats it as the caption), so
  // the main process watches it; the parts of the bar that are ours report through this ping.
  const lastPing = useRef(0)
  const ping = (): void => {
    const now = performance.now()
    if (now - lastPing.current < 150) return
    lastPing.current = now
    window.step.send('win:captionPing')
  }

  return (
    <header
      className="drag relative flex shrink-0 items-center"
      style={{ height: 'var(--titlebar-h)', paddingLeft: platform === 'darwin' ? 78 : 10, paddingRight: 10 }}
      onMouseMove={platform === 'win32' ? ping : undefined}
    >
      <div className="no-drag flex items-center gap-0.5">
        <button
          className="icon-btn"
          data-on={!collapsed}
          title="Toggle sidebar"
          onClick={() => void setPrefs({ sidebarCollapsed: !collapsed })}
        >
          <PanelLeft size={15} />
        </button>
        <ActivityPulse />
        <UpdatePill />
        <NotesButton />
      </div>
      {/* Just the session on screen. Views are switched from the sidebar or with the cycle shortcut. */}
      <div className="pointer-events-none absolute inset-x-0 flex items-center justify-center gap-1.5 text-[12.5px] text-muted">
        {session && (
          <>
            <StatusGlyph status={session.status} color={color} size={12} />
            <span className="max-w-[46vw] truncate">{session.title || defaultTitle(session)}</span>
          </>
        )}
      </div>
      {ownControls && (
        <div
          className={`no-drag ml-auto flex items-center gap-0.5 ${platform === 'win32' ? 'win-controls' : ''}`}
          data-show={platform === 'win32' ? captionHover : undefined}
        >
          <button className="icon-btn" onClick={() => window.step.send('win:minimize')} title="Minimize">
            <Minus size={14} />
          </button>
          <button className="icon-btn" onClick={() => window.step.send('win:maximize')} title={maximized ? 'Restore' : 'Maximize'}>
            {maximized ? <Copy size={12} /> : <Square size={12} />}
          </button>
          <button className="icon-btn win-close" onClick={() => window.step.send('win:close')} title="Close">
            <X size={14} />
          </button>
        </div>
      )}
    </header>
  )
}
