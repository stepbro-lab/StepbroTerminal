import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { Session } from '@shared/types'
import { useData } from '@/stores/data'
import { usePrefs } from '@/stores/prefs'
import { DEFAULT_SIDE_SHARE, sideShareAt } from '@/lib/sidePanel'
import { activeLayout, useUi, type DropZone, type LayoutNode } from '@/stores/ui'
import { useTerminalMount } from '@/terminal/useTerminalMount'
import { registry } from '@/terminal/TerminalRegistry'
import { closeSession, restartSession, restoreSession } from '@/lib/actions'
import { canResume, defaultTitle, rowPresetId } from '@/lib/sidebarModel'
import { AgentLogo } from '../sidebar/AgentLogo'
import { leaves, zoneFor } from '@/lib/layout'
import { movePanes, rememberPanes, shapeOf } from '@/lib/paneMotion'
import { RAIL_INSET, SESSION_RAIL, topRightLeaf } from '@/lib/rail'
import { SessionRail } from '../SessionRail'
import { CardHeader } from './CardHeader'
import { SearchBar } from './SearchBar'
import { EmptyState } from './EmptyState'
import { HostBanner } from './HostBanner'
import { PreviewPane } from './PreviewPane'
import { ChangesPane } from './ChangesPane'
import { TopitoCorner } from '../topito/Topito'
import { t } from '@/lib/i18n'
import { describeSessionError } from '@/lib/sessionErrors'

export const DRAG_TYPE = 'application/x-step-session'

/** Terminal cards arranged by the layout tree, plus an optional side panel. */
export function TerminalPane() {
  const layout = useUi(activeLayout)
  const sides = useUi((s) => s.sides)
  const activeId = useUi((s) => s.activeId)
  const hostState = useData((s) => s.hostState)
  const sessions = useData((s) => s.sessions)
  const connected = hostState.kind === 'connected'
  const live = leaves(layout).filter((id) => sessions[id])
  // A lone pane has no header: the sidebar names it (or the floating session rail, while that is
  // off, see SESSION_RAIL). Panes side by side keep theirs, so they read as the separate things they are.
  const bare = live.length <= 1

  // A side panel belongs to its session and shows only while that session is on screen: the focused
  // pane's first, else another pane's in the same view. Opened in one session, it stays out of the rest.
  const shownId = activeId && live.includes(activeId) && sides[activeId] ? activeId : live.find((id) => sides[id])
  const shown = shownId ? sides[shownId] : undefined
  // A preview stays loaded while its session is out of view, parked out of sight, so an agent there
  // can keep working the page (and the page keeps its place) while you look at another session.
  const previews = Object.values(sides).filter((p) => p.kind === 'preview' && sessions[p.sessionId])
  // How wide a side panel is: a share of the area, dragged from its edge and kept.
  const savedShare = usePrefs((s) => s.prefs?.sidePanelShare) ?? DEFAULT_SIDE_SHARE
  const setPrefs = usePrefs((s) => s.set)
  const [dragShare, setDragShare] = useState<number | null>(null)
  const share = dragShare ?? savedShare
  const frame = useRef<HTMLDivElement>(null)
  const sideStyle = { flex: `0 0 ${(share * 100).toFixed(2)}%` }
  const edge = (
    <SideGutter
      frame={frame}
      onMove={setDragShare}
      onEnd={(v) => {
        void setPrefs({ sidePanelShare: v })
        setDragShare(null)
      }}
    />
  )
  const previewPanels = previews.map((p) =>
    p.kind === 'preview' ? (
      <div key={p.sessionId} className={p.sessionId === shownId ? 'side-panel relative flex min-w-0' : 'side-panel-parked'} style={p.sessionId === shownId ? sideStyle : undefined} inert={p.sessionId !== shownId}>
        {p.sessionId === shownId && edge}
        <PreviewPane key={p.url} url={p.url} sessionId={p.sessionId} />
      </div>
    ) : null
  )

  // Panes travel when the arrangement changes shape: remembered just before React re-lays them
  // out (the store tells us first), moved right after it has. A gutter drag only changes proportions.
  useEffect(
    () =>
      useUi.subscribe((s, prev) => {
        if (shapeOf(activeLayout(s)) !== shapeOf(activeLayout(prev))) rememberPanes()
      }),
    []
  )
  useLayoutEffect(() => {
    movePanes()
  })

  if (!layout || live.length === 0) {
    return (
      <main className="pane-area relative flex min-w-0 flex-1 flex-col">
        <div ref={frame} className="pane-frame relative flex min-h-0 flex-1">
          {SESSION_RAIL && <SessionRail />}
          <DropTarget className="card relative flex h-full w-full flex-col">
            {connected ? <EmptyState /> : <HostBanner />}
          </DropTarget>
          {previewPanels}
        </div>
        <TopitoCorner />
      </main>
    )
  }

  return (
    <main className="pane-area relative flex min-w-0 flex-1 flex-col">
      <div ref={frame} className="pane-frame flex min-h-0 flex-1 gap-2">
        {/* The rail hangs over the terminals' own corner, left of any side panel. */}
        <div className="relative flex min-w-0 flex-1">
          {SESSION_RAIL && <SessionRail />}
          <LayoutView node={layout} path={[]} connected={connected} multi={live.length > 1} bare={bare} underRail={SESSION_RAIL && !bare ? topRightLeaf(layout) : null} />
        </div>
        {shown?.kind === 'changes' && sessions[shown.sessionId] && (
          <div className="side-panel relative flex min-w-0" style={sideStyle}>
            {edge}
            <ChangesPane sessionId={shown.sessionId} />
          </div>
        )}
        {previewPanels}
      </div>
      <TopitoCorner />
    </main>
  )
}

function LayoutView({ node, path, connected, multi, bare, underRail }: { node: LayoutNode; path: Array<'a' | 'b'>; connected: boolean; multi: boolean; bare: boolean; underRail: string | null }) {
  if (node.kind === 'leaf') return <PaneCard id={node.id} connected={connected} multi={multi} bare={bare} underRail={underRail === node.id} />
  const row = node.dir === 'row'
  return (
    <div className="flex min-h-0 min-w-0 flex-1" style={{ flexDirection: row ? 'row' : 'column' }}>
      <div className="flex min-h-0 min-w-0" style={{ flex: `${node.ratio} 1 0px` }}>
        <LayoutView node={node.a} path={[...path, 'a']} connected={connected} multi={multi} bare={bare} underRail={underRail} />
      </div>
      <Gutter row={row} path={path} />
      <div className="flex min-h-0 min-w-0" style={{ flex: `${1 - node.ratio} 1 0px` }}>
        <LayoutView node={node.b} path={[...path, 'b']} connected={connected} multi={multi} bare={bare} underRail={underRail} />
      </div>
    </div>
  )
}

/**
 * The edge between the terminals and a side panel: drag it to give the panel more or less room.
 * A preview is a page of its own that swallows the pointer as it passes over it, so while the edge
 * is dragged a sheet over the whole window keeps the pointer; and the terminals keep their columns
 * until it is let go, rather than reflowing at every pixel.
 */
function SideGutter({ frame, onMove, onEnd }: { frame: React.RefObject<HTMLDivElement | null>; onMove: (share: number) => void; onEnd: (share: number) => void }) {
  const onDown = (e: React.MouseEvent): void => {
    e.preventDefault()
    const el = frame.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    let last: number | null = null
    const sheet = document.createElement('div')
    sheet.style.cssText = 'position:fixed;inset:0;z-index:100;cursor:col-resize'
    document.body.appendChild(sheet)
    // For the whole drag, however long: the agents behind the terminals redraw once, at the end.
    registry.beginResizeDrag()
    const onMoveEv = (ev: MouseEvent): void => {
      last = sideShareAt(ev.clientX, rect.left, rect.width)
      onMove(last)
    }
    const onUp = (): void => {
      window.removeEventListener('mousemove', onMoveEv)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('blur', onUp)
      sheet.remove()
      registry.endResizeDrag()
      if (last !== null) onEnd(last)
    }
    window.addEventListener('mousemove', onMoveEv)
    window.addEventListener('mouseup', onUp)
    // A button let go outside the window never comes back as a mouseup.
    window.addEventListener('blur', onUp)
  }
  return (
    <div className="gutter group absolute inset-y-0 z-10" style={{ left: -8, width: 8, cursor: 'col-resize' }} onMouseDown={onDown}>
      <div className="gutter-line absolute rounded-full opacity-0 transition-opacity group-hover:opacity-100" style={{ background: 'var(--border-strong)', left: 3, right: 3, top: 24, bottom: 24 }} />
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
      window.removeEventListener('blur', onUp)
      document.body.style.cursor = ''
      registry.endResizeDrag()
    }
    document.body.style.cursor = row ? 'col-resize' : 'row-resize'
    // Both sides keep their size until the edge is let go, and their agents redraw once.
    registry.beginResizeDrag()
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('blur', onUp)
  }
  return (
    <div
      className="gutter group relative shrink-0"
      style={{ width: row ? 8 : undefined, height: row ? undefined : 8, cursor: row ? 'col-resize' : 'row-resize' }}
      onMouseDown={onDown}
    >
      <div
        className="gutter-line absolute rounded-full opacity-0 transition-opacity group-hover:opacity-100"
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

/**
 * `bare`: the window's only pane, drawn without a header; the sidebar names it.
 * `underRail`: the rail hangs over this pane's corner, so its header keeps its buttons out from under it.
 */
function PaneCard({ id, connected, multi, bare, underRail }: { id: string; connected: boolean; multi: boolean; bare: boolean; underRail: boolean }) {
  const session = useData((s) => s.sessions[id])
  const focused = useUi((s) => s.activeId === id)
  const searchOpen = useUi((s) => s.searchOpen)
  const setSearchOpen = useUi((s) => s.setSearchOpen)
  const mountRef = useTerminalMount(session ? session.id : null, connected)
  const { zone, handlers } = useDropZone(id)
  if (!session) return null
  const focusMe = (): void => {
    if (!focused) useUi.getState().setActive(id)
  }
  return (
    <div
      data-pane
      data-flip-id={id}
      className="card relative flex min-h-0 min-w-0 flex-1 flex-col"
      style={multi && focused ? { boxShadow: '0 0 0 1px var(--accent-soft)' } : undefined}
      onMouseDownCapture={focusMe}
      {...handlers}
    >
      {!bare && <CardHeader session={session} split={multi} dim={multi && !focused} inset={underRail ? RAIL_INSET : 0} />}
      {bare && searchOpen && focused && (
        <div className="absolute left-3 top-2 z-20 flex h-8 items-center rounded-full px-2" style={{ background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-chip)' }}>
          <SearchBar id={session.id} onClose={() => setSearchOpen(false)} />
        </div>
      )}
      <div className={`relative min-h-0 flex-1 overflow-hidden ${bare ? 'p-3.5' : 'px-3 pb-2.5 pt-2'}`}>
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
        {!session.alive && session.status === 'exited' && !session.archived && (
          <Bar>
            <span className="min-w-0 flex-1 truncate text-muted">{session.exitCode !== undefined ? t('Process exited with code {code}.', { code: session.exitCode }) : t('Process exited.')}</span>
            {/* Buttons with room around them; the words alone were a target too small to hit. */}
            <button className="btn btn-secondary h-7 px-3 text-[12.5px]" onClick={() => restartSession(session.id)}>
              {t(canResume(session) ? 'Restart and resume conversation' : 'Restart')}
            </button>
            <button className="btn btn-secondary h-7 px-3 text-[12.5px]" onClick={() => void closeSession(session.id)}>
              {t('Close')}
            </button>
          </Bar>
        )}
        {session.archived && <ArchivedView session={session} />}
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

/**
 * A session put away has no terminal to show, so its pane shows the session itself: the agent's
 * mark, the title, and the way back. Resuming brings the conversation back where an agent can
 * pick it up; deleting lets it go.
 */
function ArchivedView({ session }: { session: Session }) {
  const presets = useData((s) => s.presets)
  const presetId = rowPresetId(session)
  const color = presets.find((p) => p.id === presetId)?.color ?? 'var(--text-muted)'
  const resumes = canResume(session)
  return (
    <div className="fade-in absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 p-8 text-center" style={{ background: 'var(--card-fill, var(--bg-card))', backdropFilter: 'blur(14px)' }}>
      <span style={{ color }}>
        <AgentLogo presetId={presetId} size={40} />
      </span>
      <div>
        <div className="text-[15px] font-semibold tracking-[-0.01em]">{session.title || defaultTitle(session)}</div>
        <div className="mt-1 text-[12.5px] text-muted">{t('Archived')}</div>
      </div>
      <div className="flex items-center gap-2">
        <button className="btn btn-primary" onClick={() => restoreSession(session.id)}>
          {t(resumes ? 'Resume' : 'Restore')}
        </button>
        <button className="btn btn-secondary" onClick={() => void closeSession(session.id)}>
          {t('Delete')}
        </button>
      </div>
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
      className="fade-in absolute inset-x-2 bottom-2 z-20 rounded-xl px-3 py-2.5 text-[12.5px]"
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
      className="fade-in absolute inset-x-2 bottom-2 z-20 flex items-center gap-3 rounded-xl px-3 py-2 text-[12.5px]"
      style={{ background: 'var(--bg-overlay)', boxShadow: '0 0 0 1px var(--border) inset, var(--shadow-card)' }}
    >
      {children}
    </div>
  )
}
