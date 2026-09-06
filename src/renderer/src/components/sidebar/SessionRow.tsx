import { useEffect, useRef, useState } from 'react'
import { Archive, Pin, RotateCcw, X } from 'lucide-react'
import type { SidebarSession } from '@/lib/sidebarModel'
import { useUi } from '@/stores/ui'
import { DRAG_TYPE } from '../pane/TerminalPane'
import { useData } from '@/stores/data'
import { archiveSession, closeSession, renameSession, restoreSession, sessionMenu } from '@/lib/actions'
import { StatusGlyph } from './StatusGlyph'
import { AgentLogo } from './AgentLogo'
import { t } from '@/lib/i18n'

interface Props {
  row: SidebarSession
  /** A drop here would put the dragged session above or below this row. */
  insert?: 'before' | 'after'
  onDragOver?: (row: SidebarSession, e: React.DragEvent) => void
  onDrop?: (row: SidebarSession, e: React.DragEvent) => void
}

export function SessionRow({ row, insert, onDragOver, onDrop }: Props) {
  const activeId = useUi((s) => s.activeId)
  const lifted = useUi((s) => s.dragging === row.id)
  const renamingId = useUi((s) => s.renamingId)
  const setRenaming = useUi((s) => s.setRenaming)
  const setActive = useUi((s) => s.setActive)
  const setActiveProject = useUi((s) => s.setActiveProject)
  const presets = useData((s) => s.presets)
  const color = presets.find((p) => p.id === row.presetId)?.color ?? '#8a8a90'
  const active = activeId === row.id
  const renaming = renamingId === row.id
  const archived = !!row.session.archived
  const busy = row.status === 'working' || row.status === 'starting' || row.status === 'attention' || row.status === 'done'
  const exited = row.status === 'exited'

  // Text: active is bright, busy is one step down, idle is muted, exited and archived are faint.
  const titleColor = active ? 'var(--text)' : busy ? 'var(--text-secondary)' : exited || archived ? 'var(--text-faint)' : 'var(--text-muted)'
  const logoColor = active ? 'var(--text)' : busy ? 'var(--text-secondary)' : 'var(--text-faint)'
  const canResume = !!row.session.launch.resumeArgs && !!row.session.agent.sessionId

  return (
    <div
      data-session-row={row.id}
      // The pin gets a column only when it is there; otherwise the logo would slide into its place and leave the edge empty.
      className={`group row gap-2 pl-[22px] ${row.pinned ? 'grid-cols-[16px_minmax(0,1fr)_auto_16px]' : 'grid-cols-[16px_minmax(0,1fr)_16px]'}`}
      data-active={active}
      data-insert={insert}
      title={row.session.projectPath}
      draggable={!archived}
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, row.id)
        e.dataTransfer.effectAllowed = 'move'
        useUi.getState().setDragging(row.id)
      }}
      onDragEnd={() => useUi.getState().setDragging(null)}
      onDragOver={onDragOver && ((e) => onDragOver(row, e))}
      onDrop={onDrop && ((e) => onDrop(row, e))}
      onClick={() => {
        setActiveProject(row.session.projectPath)
        setActive(row.id)
      }}
      onDoubleClick={() => setRenaming(row.id)}
      onContextMenu={(e) => {
        e.preventDefault()
        void sessionMenu(row, { x: e.clientX, y: e.clientY })
      }}
      onAuxClick={(e) => {
        if (e.button === 1) void closeSession(row.id)
      }}
      style={{ color: titleColor, fontWeight: active || row.status === 'attention' ? 550 : undefined, opacity: lifted ? 0.4 : undefined }}
    >
      <StatusGlyph status={row.status} color={color} />
      {renaming ? (
        <RenameInput id={row.id} initial={row.session.titleSource === 'user' ? row.title : ''} placeholder={row.title} />
      ) : (
        <span className="row-title">{row.title}</span>
      )}
      {row.pinned && <Pin size={11} strokeWidth={1.8} style={{ color: 'var(--text-muted)' }} />}
      {/* The agent's mark keeps the edge; under the pointer the row's actions slide in beside it, fading over the end of a long title. */}
      <span className="relative flex items-center justify-center" style={{ color: logoColor }}>
        <AgentLogo presetId={row.presetId} size={13} />
        <span
          className="pointer-events-none absolute inset-y-0 right-full flex items-center gap-0.5 pl-3 pr-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100"
          style={{ background: `linear-gradient(to right, transparent, ${active ? 'var(--bg-active)' : 'var(--bg-hover)'} 12px)` }}
        >
          {archived ? (
            <>
              <RowAction title={t(canResume ? 'Restore and resume conversation' : 'Restore')} onClick={() => restoreSession(row.id)}>
                <RotateCcw size={12} />
              </RowAction>
              <RowAction title={t('Delete')} onClick={() => void closeSession(row.id)}>
                <X size={12} />
              </RowAction>
            </>
          ) : (
            <RowAction title={t('Archive')} onClick={() => void archiveSession(row.id)}>
              <Archive size={12} />
            </RowAction>
          )}
        </span>
      </span>
    </div>
  )
}

function RowAction({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      className="icon-btn h-5 w-5"
      title={title}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {children}
    </button>
  )
}

function RenameInput({ id, initial, placeholder }: { id: string; initial: string; placeholder: string }) {
  const [value, setValue] = useState(initial)
  const ref = useRef<HTMLInputElement>(null)
  const setRenaming = useUi((s) => s.setRenaming)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  const commit = (): void => {
    renameSession(id, value)
    setRenaming(null)
  }
  return (
    <input
      ref={ref}
      className="field h-[22px] w-full px-1.5"
      value={value}
      placeholder={placeholder}
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') setRenaming(null)
      }}
    />
  )
}
