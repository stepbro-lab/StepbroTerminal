import { useRef } from 'react'
import { Minus, PanelLeft, Square, X, Copy } from 'lucide-react'
import { usePrefs } from '@/stores/prefs'
import { useUi } from '@/stores/ui'
import { useData } from '@/stores/data'
import { ActivityPulse } from './ActivityPulse'
import { UpdatePill } from './UpdatePill'
import { NotesButton } from './notes/NotesButton'
import { StatusGlyph } from './sidebar/StatusGlyph'
import { rowPresetId } from '@/lib/sidebarModel'
import { t } from '@/lib/i18n'

const platform = window.step.platform
/** The last part of a path, on either kind of slash. */
const folderName = (p: string): string => p.split(/[\\/]/).filter(Boolean).pop() ?? p

/** Windows and Linux draw their own caption buttons; on Windows they show only while hovered. */
const ownControls = platform === 'win32' || platform === 'linux'

export function TitleBar() {
  const prefs = usePrefs((s) => s.prefs)
  const setPrefs = usePrefs((s) => s.set)
  const activeId = useUi((s) => s.activeId)
  const maximized = useUi((s) => s.maximized)
  const captionHover = useUi((s) => s.captionHover)
  const fullscreen = useUi((s) => s.fullscreen)
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
      // On a Mac the traffic lights sit at the left of this bar; the buttons start after them,
      // except in full screen, where macOS takes the lights away.
      style={{ height: 'var(--titlebar-h)', paddingLeft: platform === 'darwin' && !fullscreen ? 78 : 10, paddingRight: 10 }}
      onMouseMove={platform === 'win32' ? ping : undefined}
    >
      <div className="no-drag flex items-center gap-0.5">
        <button
          className="icon-btn"
          data-on={!collapsed}
          title={t('Toggle sidebar')}
          onClick={() => void setPrefs({ sidebarCollapsed: !collapsed })}
        >
          <PanelLeft size={15} />
        </button>
        <ActivityPulse />
        <UpdatePill />
        <NotesButton />
      </div>
      {/* The folder the session on screen lives in; its own name is on the pane. Views are switched from the sidebar or with the cycle shortcut. */}
      <div className="pointer-events-none absolute inset-x-0 flex items-center justify-center gap-1.5 text-[12.5px] text-muted">
        {session && (
          <>
            <StatusGlyph status={session.status} color={color} size={12} />
            <span className="max-w-[46vw] truncate">{folderName(session.projectPath)}</span>
          </>
        )}
      </div>
      {ownControls && (
        <div
          className={`no-drag ml-auto flex items-center gap-0.5 ${platform === 'win32' ? 'win-controls' : ''}`}
          data-show={platform === 'win32' ? captionHover : undefined}
        >
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
    </header>
  )
}
