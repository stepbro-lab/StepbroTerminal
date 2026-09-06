import { useCallback, useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { Session } from '@shared/types'
import { useData } from '@/stores/data'
import { activeLayout, useUi, type DropZone, type LayoutNode } from '@/stores/ui'
import { useTerminalMount } from '@/terminal/useTerminalMount'
import { registry } from '@/terminal/TerminalRegistry'
import { closeSession, restartSession, restoreSession } from '@/lib/actions'
import { leaves, zoneFor } from '@/lib/layout'
import { TopStrip } from '../Chrome'
import { CardHeader } from './CardHeader'
import { EmptyState } from './EmptyState'
import { HostBanner } from './HostBanner'
import { PreviewPane } from './PreviewPane'
import { ChangesPane } from './ChangesPane'
import { t } from '@/lib/i18n'
import { describeSessionError } from '@/lib/sessionErrors'

export const DRAG_TYPE = 'application/x-step-session'

/** Terminal cards arranged by the layout tree, plus an optional side panel. */
export function TerminalPane() {
  const layout = useUi(activeLayout)
  const side = useUi((s) => s.side)
  const hostState = useData((s) => s.hostState)
  const sessions = useData((s) => s.sessions)
  const connected = hostState.kind === 'connected'
  const live = leaves(layout).filter((id) => sessions[id])
  // The sidebar keeps the cards off the left edge; as it folds away, --pane-edge (set by the sidebar) takes over.
  const edge = { paddingLeft: 'var(--pane-edge, 0px)' }

  if (!layout || live.length === 0) {
    return (
      <main className="flex min-w-0 flex-1 flex-col" style={edge}>
        <TopStrip />
        <div className="flex min-h-0 flex-1 pb-2 pr-2">
          <DropTarget className="card relative flex h-full w-full flex-col">{connected ? <EmptyState /> : <HostBanner />}</DropTarget>
        </div>
      </main>
    )
  }

  const sidePanel = side && sessions[side.sessionId] ? (side.kind === 'preview' ? <PreviewPane key={side.url} url={side.url} /> : <ChangesPane sessionId={side.sessionId} />) : null

  return (
    <main className="flex min-w-0 flex-1 flex-col" style={edge}>
      <TopStrip />
      <div className="flex min-h-0 flex-1 gap-2 pb-2 pr-2">
        <div className="flex min-w-0 flex-1">
          <LayoutView node={layout} path={[]} connected={connected} multi={live.length > 1} />
        </div>
        {sidePanel && <div className="flex min-w-0 flex-[0_0_44%]">{sidePanel}</div>}
      </div>
    </main>
  )
}

function LayoutView({ node, path, connected, multi }: { node: LayoutNode; path: Array<'a' | 'b'>; connected: boolean; multi: boolean }) {
  if (node.kind === 'leaf') return <PaneCard id={node.id} connected={connected} multi={multi} />
  const row = node.dir === 'row'
  return (
    <div className="flex min-h-0 min-w-0 flex-1" style={{ flexDirection: row ? 'row' : 'column' }}>
      <div className="flex min-h-0 min-w-0" style={{ flex: `${node.ratio} 1 0px` }}>
        <LayoutView node={node.a} path={[...path, 'a']} connected={connected} multi={multi} />
      </div>
      <Gutter row={row} path={path} />
      <div className="flex min-h-0 min-w-0" style={{ flex: `${1 - node.ratio} 1 0px` }}>
        <LayoutView node={node.b} path={[...path, 'b']} connected={connected} multi={multi} />
      </div>
    </div>
  )
}

/** Drag to change how the two sides of a split share the space. */
function Gutter({ row, path }: { row: boolean; path: Array<'a' | 'b'> }) {
  const setRatio = useUi((s) => s.setRatio)
  const onDown = (e: React.MouseEvent): void => {
    e.preventDefault()
    const parent = (e.currentTarget as HTMLElement).parentElement!
    const rect = parent.getBoundingClientRect()
    const onMove = (ev: MouseEvent): void => {
      const ratio = row ? (ev.clientX - rect.left) / rect.width : (ev.clientY - rect.top) / rect.height
      setRatio(path, ratio)
    }
    const onUp = (): void => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
    }
    document.body.style.cursor = row ? 'col-resize' : 'row-resize'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }
  return (
    <div
      className="group relative shrink-0"
      style={{ width: row ? 8 : undefined, height: row ? undefined : 8, cursor: row ? 'col-resize' : 'row-resize' }}
      onMouseDown={onDown}
    >
      <div
        className="absolute rounded-full opacity-0 transition-opacity group-hover:opacity-100"
        style={{
          background: 'var(--border-strong)',
          left: row ? 3 : 24,
          right: row ? 3 : 24,
          top: row ? 24 : 3,
          bottom: row ? 24 : 3
        }}
      />
    </div>
  )
}

/** Accepts a session dragged from the sidebar or another card, showing where it will land. */
function useDropZone(targetId: string | null): {
  zone: DropZone | null
  handlers: { onDragOver: (e: React.DragEvent) => void; onDragLeave: (e: React.DragEvent) => void; onDrop: (e: React.DragEvent) => void }
} {
  const [zone, setZone] = useState<DropZone | null>(null)
  const ref = useRef<HTMLElement | null>(null)
  const onDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      ref.current = e.currentTarget as HTMLElement
      setZone(targetId ? zoneFor(e.clientX, e.clientY, ref.current.getBoundingClientRect()) : 'center')
    },
    [targetId]
  )
  const onDragLeave = useCallback((e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    setZone(null)
  }, [])
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setZone(null)
      const id = e.dataTransfer.getData(DRAG_TYPE)
      const ui = useUi.getState()
      ui.setDragging(null)
      if (!id) return
      if (targetId) ui.dropSession(id, targetId, zoneFor(e.clientX, e.clientY, (e.currentTarget as HTMLElement).getBoundingClientRect()))
      else ui.setActive(id)
    },
    [targetId]
  )
  return { zone, handlers: { onDragOver, onDragLeave, onDrop } }
}

function DropTarget({ className, children }: { className: string; children: React.ReactNode }) {
  const { zone, handlers } = useDropZone(null)
  return (
    <div className={className} {...handlers}>
      {children}
      {zone && <DropHighlight zone="center" />}
    </div>
  )
}

function DropHighlight({ zone }: { zone: DropZone }) {
  const inset =
    zone === 'left' ? '0 50% 0 0' : zone === 'right' ? '0 0 0 50%' : zone === 'top' ? '0 0 50% 0' : zone === 'bottom' ? '50% 0 0 0' : '0'
  return (
    <div
      className="pointer-events-none absolute z-20 rounded-[8px] transition-all duration-100"
      style={{ inset, margin: 6, background: 'var(--accent-soft)', boxShadow: '0 0 0 2px var(--accent) inset' }}
    />
  )
}

function PaneCard({ id, connected, multi }: { id: string; connected: boolean; multi: boolean }) {
  const session = useData((s) => s.sessions[id])
  const focused = useUi((s) => s.activeId === id)
  const mountRef = useTerminalMount(session ? session.id : null, connected)
  const { zone, handlers } = useDropZone(id)
  if (!session) return null
  const focusMe = (): void => {
    if (!focused) useUi.getState().setActive(id)
  }
  return (
    <div
      className="card relative flex min-h-0 min-w-0 flex-1 flex-col"
      style={multi && focused ? { boxShadow: '0 0 0 1px var(--accent-soft), var(--shadow-card)' } : undefined}
      onMouseDownCapture={focusMe}
      {...handlers}
    >
      <CardHeader session={session} split={multi} dim={multi && !focused} />
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
        {session.status === 'error' && session.error && <ErrorBar session={session} />}
        {!session.alive && session.status === 'exited' && (
          <Bar>
            <span className="min-w-0 flex-1 truncate text-muted">{session.exitCode !== undefined ? t('Process exited with code {code}.', { code: session.exitCode }) : t('Process exited.')}</span>
            {/* Buttons with room around them; the words alone were a target too small to hit. */}
            {session.archived ? (
              <>
                <button className="btn btn-secondary h-7 px-3 text-[12.5px]" onClick={() => restoreSession(session.id)}>
                  {t(session.launch.resumeArgs && session.agent.sessionId ? 'Restore and resume conversation' : 'Restore')}
                </button>
                <button className="btn btn-secondary h-7 px-3 text-[12.5px]" onClick={() => void closeSession(session.id)}>
                  {t('Delete')}
                </button>
              </>
            ) : (
              <>
                <button className="btn btn-secondary h-7 px-3 text-[12.5px]" onClick={() => restartSession(session.id)}>
                  {t(session.launch.resumeArgs && session.agent.sessionId ? 'Restart and resume conversation' : 'Restart')}
                </button>
                <button className="btn btn-secondary h-7 px-3 text-[12.5px]" onClick={() => void closeSession(session.id)}>
                  {t('Close')}
                </button>
              </>
            )}
          </Bar>
        )}
      </div>
      {!connected && (
        <div className="absolute inset-0 z-10" style={{ background: 'var(--bg-overlay)' }}>
          <HostBanner />
        </div>
      )}
      {zone && <DropHighlight zone={zone} />}
    </div>
  )
}

/** What went wrong, in words a person can act on, with the host's own message a click away. */
function ErrorBar({ session }: { session: Session }) {
  const [open, setOpen] = useState(false)
  const words = describeSessionError(session.error)
  const detail = session.errorDetail || session.error
  return (
    <div
      className="fade-in absolute inset-x-2 bottom-2 rounded-lg px-3 py-2.5 text-[12.5px]"
      style={{ background: 'var(--bg-overlay)', boxShadow: '0 0 0 1px var(--border) inset, var(--shadow-card)' }}
    >
      <div className="flex items-center gap-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-danger" style={{ background: 'color-mix(in srgb, var(--danger) 14%, transparent)' }}>
          <AlertTriangle size={13} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-fg">{words.title}</div>
          {words.hint && <div className="truncate text-[11.5px] text-muted">{words.hint}</div>}
        </div>
        {detail && (
          <button className="text-[11.5px] text-muted hover:text-fg" onClick={() => setOpen(!open)}>
            {t(open ? 'Hide details' : 'Details')}
          </button>
        )}
        <button className="btn btn-secondary h-7 px-3 text-[12.5px]" onClick={() => restartSession(session.id)}>
          {t('Retry')}
        </button>
      </div>
      {open && detail && (
        <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-md p-2 font-mono text-[11.5px] text-muted" style={{ background: 'var(--bg-input)' }}>
          {detail}
        </pre>
      )}
    </div>
  )
}

function Bar({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="fade-in absolute inset-x-2 bottom-2 flex items-center gap-3 rounded-lg px-3 py-2 text-[12.5px]"
      style={{ background: 'var(--bg-overlay)', boxShadow: '0 0 0 1px var(--border) inset, var(--shadow-card)' }}
    >
      {children}
    </div>
  )
}
