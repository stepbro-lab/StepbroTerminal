import { Minus, PanelLeft, Square, X, Copy } from 'lucide-react'
import { usePrefs } from '@/stores/prefs'
import { useUi } from '@/stores/ui'
import { useData } from '@/stores/data'
import { ActivityPulse } from './ActivityPulse'
import { UpdatePill } from './UpdatePill'
import { NotesButton } from './notes/NotesButton'
import { ViewSwitcher } from './ViewSwitcher'
import { StatusGlyph } from './sidebar/StatusGlyph'
import { defaultTitle, rowPresetId } from '@/lib/sidebarModel'

const platform = window.step.platform

export function TitleBar() {
  const prefs = usePrefs((s) => s.prefs)
  const setPrefs = usePrefs((s) => s.set)
  const activeId = useUi((s) => s.activeId)
  const maximized = useUi((s) => s.maximized)
  const viewCount = useUi((s) => s.views.length)
  const session = useData((s) => (activeId ? s.sessions[activeId] : undefined))
  const presets = useData((s) => s.presets)
  const collapsed = prefs?.sidebarCollapsed ?? false
  const color = session ? (presets.find((p) => p.id === rowPresetId(session))?.color ?? '#8a8a90') : '#8a8a90'

  return (
    <header
      className="drag relative flex shrink-0 items-center"
      style={{
        height: 'var(--titlebar-h)',
        paddingLeft: platform === 'darwin' ? 78 : 10,
        paddingRight: platform === 'win32' ? 146 : 10
      }}
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
      <div className="pointer-events-none absolute inset-x-0 flex items-center justify-center gap-1.5 text-[12.5px] text-muted">
        {viewCount >= 2 ? (
          <div className="pointer-events-auto">
            <ViewSwitcher />
          </div>
        ) : (
          session && (
            <>
              <StatusGlyph status={session.status} color={color} size={12} />
              <span className="max-w-[46vw] truncate">{session.title || defaultTitle(session)}</span>
            </>
          )
        )}
      </div>
      {platform === 'linux' && (
        <div className="no-drag ml-auto flex items-center gap-0.5">
          <button className="icon-btn" onClick={() => window.step.send('win:minimize')} title="Minimize">
            <Minus size={14} />
          </button>
          <button className="icon-btn" onClick={() => window.step.send('win:maximize')} title="Maximize">
            {maximized ? <Copy size={12} /> : <Square size={12} />}
          </button>
          <button className="icon-btn hover:!bg-danger hover:!text-white" onClick={() => window.step.send('win:close')} title="Close">
            <X size={14} />
          </button>
        </div>
      )}
    </header>
  )
}
