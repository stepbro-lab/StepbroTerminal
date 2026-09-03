import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { useTerminalMount } from '@/terminal/useTerminalMount'
import { registry } from '@/terminal/TerminalRegistry'
import { closeSession, restartSession } from '@/lib/actions'
import { CardHeader } from './CardHeader'
import { EmptyState } from './EmptyState'
import { HostBanner } from './HostBanner'
import { PreviewPane } from './PreviewPane'
import { ChangesPane } from './ChangesPane'

/** One or two terminal cards, side by side or stacked. Clicking a card focuses its session. */
export function TerminalPane() {
  const panes = useUi((s) => s.panes)
  const focus = useUi((s) => s.focus)
  const splitDir = useUi((s) => s.splitDir)
  const side = useUi((s) => s.side)
  const hostState = useData((s) => s.hostState)
  const sessions = useData((s) => s.sessions)
  const connected = hostState.kind === 'connected'
  const live = panes.filter((id) => sessions[id])

  if (live.length === 0) {
    return (
      <main className="min-w-0 flex-1 pb-2 pr-2">
        <div className="card relative flex h-full flex-col">{connected ? <EmptyState /> : <HostBanner />}</div>
      </main>
    )
  }

  const sidePanel = side && sessions[side.sessionId] ? (side.kind === 'preview' ? <PreviewPane key={side.url} url={side.url} /> : <ChangesPane sessionId={side.sessionId} />) : null

  return (
    <main className="flex min-w-0 flex-1 gap-2 pb-2 pr-2">
      <div className="flex min-w-0 flex-1 gap-2" style={{ flexDirection: splitDir === 'row' ? 'row' : 'column' }}>
        {live.map((id, i) => (
          <PaneCard key={id} id={id} index={i} focused={live.length === 1 || i === focus} split={live.length > 1} connected={connected} />
        ))}
      </div>
      {sidePanel && <div className="flex min-w-0 flex-[0_0_44%]">{sidePanel}</div>}
    </main>
  )
}

function PaneCard({ id, index, focused, split, connected }: { id: string; index: number; focused: boolean; split: boolean; connected: boolean }) {
  const session = useData((s) => s.sessions[id])
  const mountRef = useTerminalMount(session ? session.id : null, connected)
  if (!session) return null
  const focusMe = (): void => {
    if (!focused) useUi.getState().focusPane(index)
  }
  return (
    <div
      className="card relative flex min-h-0 min-w-0 flex-1 flex-col"
      style={split && focused ? { boxShadow: '0 0 0 1px var(--accent-soft), var(--shadow-card)' } : undefined}
      onMouseDownCapture={focusMe}
    >
      <CardHeader session={session} split={split} dim={split && !focused} />
      <div className="relative min-h-0 flex-1 overflow-hidden px-3 pb-2.5 pt-2">
        {/* The mount node stays in the tree while the host reconnects, so xterm is never orphaned. */}
        <div
          ref={mountRef}
          className="relative h-full w-full"
          onMouseDown={() => {
            useUi.getState().setRenaming(null)
            registry.focus(id)
          }}
        />
        {session.status === 'error' && session.error && (
          <Bar>
            <span className="font-medium text-danger">Error</span>
            <span className="text-fg">{session.error}</span>
            <button className="text-accent hover:underline" onClick={() => restartSession(session.id)}>
              Retry
            </button>
          </Bar>
        )}
        {!session.alive && session.status === 'exited' && (
          <Bar>
            <span className="text-muted">Process exited{session.exitCode !== undefined ? ` with code ${session.exitCode}` : ''}.</span>
            <button className="text-accent hover:underline" onClick={() => restartSession(session.id)}>
              Restart
            </button>
            <button className="text-muted hover:text-fg hover:underline" onClick={() => void closeSession(session.id)}>
              Close
            </button>
          </Bar>
        )}
      </div>
      {!connected && (
        <div className="absolute inset-0 z-10" style={{ background: 'var(--bg-overlay)' }}>
          <HostBanner />
        </div>
      )}
    </div>
  )
}

function Bar({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="fade-in absolute inset-x-2 bottom-2 flex items-center gap-3 rounded-lg px-3 py-2 text-[12px]"
      style={{ background: 'var(--bg-overlay)', boxShadow: '0 0 0 1px var(--border) inset, var(--shadow-card)' }}
    >
      {children}
    </div>
  )
}
