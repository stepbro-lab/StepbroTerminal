import { useEffect, useRef, useState } from 'react'
import { Columns2, MoreHorizontal, Pin, Rows2, Search, X } from 'lucide-react'
import type { Session } from '@shared/types'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { closeSession, copyText, killSession, openFolder, pinSession, renameSession, restartSession, splitWithNewShell } from '@/lib/actions'
import { popup, sep } from '@/lib/menus'
import { defaultTitle, rowPresetId } from '@/lib/sidebarModel'
import { StatusGlyph } from '../sidebar/StatusGlyph'
import { SearchBar } from './SearchBar'

export function CardHeader({ session, split = false, dim = false }: { session: Session; split?: boolean; dim?: boolean }) {
  const presets = useData((s) => s.presets)
  const searchOpen = useUi((s) => s.searchOpen)
  const setSearchOpen = useUi((s) => s.setSearchOpen)
  const activeId = useUi((s) => s.activeId)
  const splitDir = useUi((s) => s.splitDir)
  const [editing, setEditing] = useState(false)
  const color = presets.find((p) => p.id === rowPresetId(session))?.color ?? '#8a8a90'
  const title = session.title || defaultTitle(session)
  const canResume = !!session.launch.resumeArgs && !!session.agent.sessionId
  const isActive = activeId === session.id

  const more = async (anchor: HTMLElement): Promise<void> => {
    const pick = await popup(
      [
        { id: 'rename', label: 'Rename' },
        { id: 'pin', label: session.pinned ? 'Unpin' : 'Pin' },
        sep,
        { id: 'split-right', label: 'Split right' },
        { id: 'split-down', label: 'Split down' },
        { id: 'unsplit', label: 'Close other pane', enabled: split },
        sep,
        { id: 'restart', label: canResume ? 'Restart and resume conversation' : 'Restart' },
        { id: 'kill', label: 'Kill process', enabled: session.alive },
        sep,
        { id: 'folder', label: 'Open folder' },
        { id: 'copyPath', label: 'Copy path' },
        { id: 'copyId', label: 'Copy Claude session id', enabled: !!session.agent.sessionId },
        sep,
        { id: 'close', label: 'Close session' }
      ],
      { anchor }
    )
    switch (pick) {
      case 'rename':
        setEditing(true)
        break
      case 'pin':
        pinSession(session.id, !session.pinned)
        break
      case 'split-right':
        await splitWithNewShell('row')
        break
      case 'split-down':
        await splitWithNewShell('column')
        break
      case 'unsplit':
        useUi.getState().unsplit()
        break
      case 'restart':
        restartSession(session.id)
        break
      case 'kill':
        killSession(session.id)
        break
      case 'folder':
        openFolder(session.projectPath)
        break
      case 'copyPath':
        copyText(session.projectPath, 'Path copied')
        break
      case 'copyId':
        if (session.agent.sessionId) copyText(session.agent.sessionId, 'Session id copied')
        break
      case 'close':
        await closeSession(session.id)
        break
    }
  }

  return (
    <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line pl-3 pr-1.5" style={{ opacity: dim ? 0.75 : 1 }}>
      <StatusGlyph status={session.status} color={color} size={14} />
      {editing ? (
        <TitleInput session={session} onDone={() => setEditing(false)} />
      ) : (
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium tracking-[-0.005em]" onDoubleClick={() => setEditing(true)} title={session.projectPath}>
          {title}
        </span>
      )}
      {session.pinned && <Pin size={12} className="text-muted" />}
      <div className="ml-auto flex items-center gap-0.5">
        {searchOpen && isActive ? (
          <SearchBar id={session.id} onClose={() => setSearchOpen(false)} />
        ) : (
          <button className="icon-btn" title="Find (Ctrl/Cmd+F)" onClick={() => setSearchOpen(true)}>
            <Search size={14} />
          </button>
        )}
        <button
          className="icon-btn"
          title={split && splitDir === 'row' ? 'Close other pane' : 'Split right (Ctrl/Cmd+\\)'}
          data-on={split && splitDir === 'row'}
          onClick={() => (split && splitDir === 'row' ? useUi.getState().unsplit() : void splitWithNewShell('row'))}
        >
          <Columns2 size={14} />
        </button>
        <button
          className="icon-btn"
          title={split && splitDir === 'column' ? 'Close other pane' : 'Split down (Ctrl/Cmd+Shift+\\)'}
          data-on={split && splitDir === 'column'}
          onClick={() => (split && splitDir === 'column' ? useUi.getState().unsplit() : void splitWithNewShell('column'))}
        >
          <Rows2 size={14} />
        </button>
        <button className="icon-btn" title="More" onClick={(e) => void more(e.currentTarget)}>
          <MoreHorizontal size={15} />
        </button>
        <button className="icon-btn" title="Close session" onClick={() => void closeSession(session.id)}>
          <X size={15} />
        </button>
      </div>
    </div>
  )
}

function TitleInput({ session, onDone }: { session: Session; onDone: () => void }) {
  const [value, setValue] = useState(session.titleSource === 'user' ? session.title : '')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  const commit = (): void => {
    renameSession(session.id, value)
    onDone()
  }
  return (
    <input
      ref={ref}
      className="field h-6 min-w-0 flex-1"
      value={value}
      placeholder={session.title || defaultTitle(session)}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') onDone()
      }}
    />
  )
}
