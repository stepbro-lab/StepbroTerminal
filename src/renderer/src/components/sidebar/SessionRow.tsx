import { useEffect, useRef, useState } from 'react'
import { Pin } from 'lucide-react'
import type { SidebarSession } from '@/lib/sidebarModel'
import { useUi } from '@/stores/ui'
import { useData } from '@/stores/data'
import { closeSession, renameSession, sessionMenu } from '@/lib/actions'
import { StatusGlyph } from './StatusGlyph'
import { AgentLogo } from './AgentLogo'

interface Props {
  row: SidebarSession
}

export function SessionRow({ row }: Props) {
  const activeId = useUi((s) => s.activeId)
  const inPane = useUi((s) => s.panes.includes(row.id))
  const renamingId = useUi((s) => s.renamingId)
  const setRenaming = useUi((s) => s.setRenaming)
  const setActive = useUi((s) => s.setActive)
  const setActiveProject = useUi((s) => s.setActiveProject)
  const presets = useData((s) => s.presets)
  const color = presets.find((p) => p.id === row.presetId)?.color ?? '#8a8a90'
  const active = activeId === row.id
  const renaming = renamingId === row.id
  const busy = row.status === 'working' || row.status === 'starting' || row.status === 'attention' || row.status === 'done'
  const exited = row.status === 'exited'

  // Text: active is bright, busy is one step down, idle is muted, exited is faint.
  const titleColor = active ? 'var(--text)' : busy ? 'var(--text-secondary)' : exited ? 'var(--text-faint)' : 'var(--text-muted)'
  const logoColor = active ? 'var(--text)' : busy ? 'var(--text-secondary)' : 'var(--text-faint)'

  return (
    <div
      className="row grid-cols-[16px_minmax(0,1fr)_auto_16px] gap-2 pl-[22px]"
      data-active={active}
      data-pane={inPane && !active}
      title={row.session.projectPath}
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
      style={{ color: titleColor, fontWeight: active || row.status === 'attention' ? 550 : undefined }}
    >
      <StatusGlyph status={row.status} color={color} />
      {renaming ? (
        <RenameInput id={row.id} initial={row.session.titleSource === 'user' ? row.title : ''} placeholder={row.title} />
      ) : (
        <span className="row-title">{row.title}</span>
      )}
      {row.pinned && <Pin size={11} strokeWidth={1.8} style={{ color: 'var(--text-muted)' }} />}
      <span className="flex items-center justify-center" style={{ color: logoColor }}>
        <AgentLogo presetId={row.presetId} size={13} />
      </span>
    </div>
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
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') setRenaming(null)
      }}
    />
  )
}
