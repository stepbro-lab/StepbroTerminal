import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { useTerminalMount } from '@/terminal/useTerminalMount'
import { closeSession, restartSession } from '@/lib/actions'
import { CardHeader } from './CardHeader'
import { EmptyState } from './EmptyState'
import { HostBanner } from './HostBanner'

export function TerminalPane() {
  const activeId = useUi((s) => s.activeId)
  const hostState = useData((s) => s.hostState)
  const session = useData((s) => (activeId ? s.sessions[activeId] : undefined))
  const connected = hostState.kind === 'connected'
  const mountRef = useTerminalMount(session ? session.id : null, connected)

  return (
    <main className="min-w-0 flex-1 pb-2 pr-2">
      <div className="card relative flex h-full flex-col">
        {!session ? (
          connected ? (
            <EmptyState />
          ) : (
            <HostBanner />
          )
        ) : (
          <>
            <CardHeader session={session} />
            <div className="relative min-h-0 flex-1 overflow-hidden px-3 pb-2.5 pt-2">
              {/* The mount node stays in the tree while the host reconnects, so xterm is never orphaned. */}
              <div ref={mountRef} className="relative h-full w-full" onMouseDown={() => useUi.getState().setRenaming(null)} />
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
          </>
        )}
        {session && !connected && (
          <div className="absolute inset-0 z-10" style={{ background: 'var(--bg-overlay)' }}>
            <HostBanner />
          </div>
        )}
      </div>
    </main>
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
