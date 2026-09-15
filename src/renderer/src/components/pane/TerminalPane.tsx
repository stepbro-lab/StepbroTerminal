import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { Session } from '@shared/types'
import { useData } from '@/stores/data'
import { usePrefs } from '@/stores/prefs'
import { activeLayout, useUi, type DropZone, type LayoutNode } from '@/stores/ui'
import { useTerminalMount } from '@/terminal/useTerminalMount'
import { registry } from '@/terminal/TerminalRegistry'
import { closeSession, restartSession, restoreSession } from '@/lib/actions'
import { canResume, defaultTitle, rowPresetId } from '@/lib/sidebarModel'
import { AgentLogo } from '../sidebar/AgentLogo'
import { leaves, zoneFor } from '@/lib/layout'
import { movePanes, rememberPanes, shapeOf } from '@/lib/paneMotion'
import { RAIL_INSET, topRightLeaf } from '@/lib/rail'
import { SidebarPeek, TopStrip } from '../Chrome'
import { SessionRail } from '../SessionRail'
import { CardHeader } from './CardHeader'
import { SearchBar } from './SearchBar'
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
  // With the sidebar folded away the session rail takes its place in the top-right corner, and a
  // lone pane fills the window edge to edge; panes side by side keep their cards, so they read
  // as the separate things they are.
  const immersive = usePrefs((s) => s.prefs?.sidebarCollapsed ?? false)
  const bare = immersive && live.length <= 1

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
      <main className="pane-area relative flex min-w-0 flex-1 flex-col" data-immersive={immersive} data-bare={bare}>
        <TopStrip tall={immersive} />
        {immersive && <SidebarPeek />}
        <div className="pane-frame relative flex min-h-0 flex-1">
          {immersive && <SessionRail />}
          <DropTarget className="card relative flex h-full w-full flex-col">{connected ? <EmptyState /> : <HostBanner />}</DropTarget>
        </div>
      </main>
    )
  }

  const sidePanel = side && sessions[side.sessionId] ? (side.kind === 'preview' ? <PreviewPane key={side.url} url={side.url} sessionId={side.sessionId} /> : <ChangesPane sessionId={side.sessionId} />) : null

  return (
    <main className="pane-area relative flex min-w-0 flex-1 flex-col" data-immersive={immersive} data-bare={bare}>
      <TopStrip tall={immersive} />
      {immersive && <SidebarPeek />}
      <div className="pane-frame flex min-h-0 flex-1 gap-2">
        {/* The rail hangs over the terminals' own corner, left of any side panel. */}
        <div className="relative flex min-w-0 flex-1">
          {immersive && <SessionRail />}
          <LayoutView node={layout} path={[]} connected={connected} multi={live.length > 1} bare={bare} underRail={immersive && !bare ? topRightLeaf(layout) : null} />
        </div>
        {sidePanel && <div className="side-panel flex min-w-0 flex-[0_0_44%]">{sidePanel}</div>}
      </div>
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
 * `bare`: the one pane of a window with no sidebar, drawn without a header; the rail names it.
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
      style={multi && focused ? { boxShadow: '0 0 0 1px var(--accent-soft), var(--shadow-card)' } : undefined}
      onMouseDownCapture={focusMe}
      {...handlers}
    >
      {!bare && <CardHeader session={session} split={multi} dim={multi && !focused} inset={underRail ? RAIL_INSET : 0} />}
      {bare && searchOpen && focused && (
        <div className="absolute left-3 top-1 z-20 flex h-8 items-center rounded-full px-2" style={{ background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-chip)' }}>
          <SearchBar id={session.id} onClose={() => setSearchOpen(false)} />
        </div>
      )}
      <div className={`relative min-h-0 flex-1 overflow-hidden ${bare ? 'px-4 pb-3 pt-1' : 'px-3 pb-2.5 pt-2'}`}>
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
    <div className="fade-in absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 p-8 text-center" style={{ background: 'var(--bg-card)' }}>
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
      className="fade-in absolute inset-x-2 bottom-2 rounded-xl px-3 py-2.5 text-[12.5px]"
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
      className="fade-in absolute inset-x-2 bottom-2 flex items-center gap-3 rounded-xl px-3 py-2 text-[12.5px]"
      style={{ background: 'var(--bg-overlay)', boxShadow: '0 0 0 1px var(--border) inset, var(--shadow-card)' }}
    >
      {children}
    </div>
  )
}
