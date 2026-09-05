import { useEffect, useRef, useState } from 'react'
import { Columns2, FileDiff, Globe, MoreHorizontal, Pin, Rows2, Search, Ungroup, X } from 'lucide-react'
import type { Session } from '@shared/types'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { closeSession, copyText, killSession, openFolder, pinSession, renameSession, restartSession, splitWithNewShell, redrawSession } from '@/lib/actions'
import { popup, sep } from '@/lib/menus'
import { defaultTitle, rowPresetId } from '@/lib/sidebarModel'
import { StatusGlyph } from '../sidebar/StatusGlyph'
import { DRAG_TYPE } from './TerminalPane'
import { SearchBar } from './SearchBar'
import { titled } from '@/lib/shortcuts'
import { usePrefs } from '@/stores/prefs'
import { t } from '@/lib/i18n'

export function CardHeader({ session, split = false, dim = false }: { session: Session; split?: boolean; dim?: boolean }) {
  usePrefs((s) => s.prefs?.keybindings) // tooltips follow the user's shortcut choices
  const presets = useData((s) => s.presets)
  const searchOpen = useUi((s) => s.searchOpen)
  const setSearchOpen = useUi((s) => s.setSearchOpen)
  const activeId = useUi((s) => s.activeId)
  const side = useUi((s) => s.side)
  const setSide = useUi((s) => s.setSide)
  const previewOpen = side?.kind === 'preview' && side.sessionId === session.id
  const changesOpen = side?.kind === 'changes' && side.sessionId === session.id
  const changedCount = session.agent.changedFiles?.length ?? 0
  const [editing, setEditing] = useState(false)
  const color = presets.find((p) => p.id === rowPresetId(session))?.color ?? '#8a8a90'
  const title = session.title || defaultTitle(session)
  const canResume = !!session.launch.resumeArgs && !!session.agent.sessionId
  const isActive = activeId === session.id

  const more = async (anchor: HTMLElement): Promise<void> => {
    const pick = await popup(
      [
        { id: 'rename', label: t('Rename') },
        { id: 'pin', label: t(session.pinned ? 'Unpin' : 'Pin') },
        sep,
        { id: 'split-right', label: t('Split right') },
        { id: 'split-down', label: t('Split down') },
        { id: 'detach', label: t('Move to its own view'), enabled: split },
        { id: 'unsplit', label: t('Keep only this pane'), enabled: split },
        sep,
        { id: 'redraw', label: t('Redraw screen') },
        { id: 'restart', label: t(canResume ? 'Restart and resume conversation' : 'Restart') },
        { id: 'kill', label: t('Kill process'), enabled: session.alive },
        sep,
        { id: 'folder', label: t('Open folder') },
        { id: 'copyPath', label: t('Copy path') },
        { id: 'copyId', label: t('Copy Claude session id'), enabled: !!session.agent.sessionId },
        sep,
        { id: 'close', label: t('Close session') }
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
      case 'detach':
        useUi.getState().detach(session.id)
        break
      case 'unsplit':
        useUi.getState().unsplit()
        break
      case 'redraw':
        redrawSession(session.id)
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
        copyText(session.projectPath, t('Path copied'))
        break
      case 'copyId':
        if (session.agent.sessionId) copyText(session.agent.sessionId, t('Session id copied'))
        break
      case 'close':
        await closeSession(session.id)
        break
    }
  }

  return (
    <div
      className="flex h-9 shrink-0 items-center gap-2 border-b border-line pl-3 pr-1.5"
      style={{ opacity: dim ? 0.75 : 1 }}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, session.id)
        e.dataTransfer.effectAllowed = 'move'
        useUi.getState().setDragging(session.id)
      }}
      onDragEnd={() => useUi.getState().setDragging(null)}
      title={t('Drag to move this pane')}
    >
      <StatusGlyph status={session.status} color={color} size={14} />
      {editing ? (
        <TitleInput session={session} onDone={() => setEditing(false)} />
      ) : (
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium tracking-[-0.005em]" onDoubleClick={() => setEditing(true)} title={session.projectPath}>
          {title}
        </span>
      )}
      {session.pinned && <Pin size={12} className="text-muted" />}
      {session.previewUrl && (
        <button
          className="ml-1 flex h-6 items-center gap-1.5 rounded-full px-2 text-[11.5px] font-medium transition hover:brightness-110"
          style={{ background: previewOpen ? 'var(--accent)' : 'var(--accent-soft)', color: previewOpen ? 'var(--on-accent)' : 'var(--accent)' }}
          title={`Preview ${session.previewUrl} beside the terminal`}
          onClick={() => setSide(previewOpen ? null : { kind: 'preview', url: session.previewUrl!, sessionId: session.id })}
        >
          <Globe size={12} />
          {session.previewUrl.replace(/^https?:\/\//, '')}
        </button>
      )}
      <div className="ml-auto flex items-center gap-0.5">
        <button
          className="icon-btn relative"
          title={t('Changes in this folder')}
          data-on={changesOpen}
          onClick={() => setSide(changesOpen ? null : { kind: 'changes', sessionId: session.id })}
        >
          <FileDiff size={14} />
          {changedCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 min-w-[14px] rounded-full px-1 text-center text-[9px] font-semibold leading-[14px]" style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}>
              {changedCount}
            </span>
          )}
        </button>
        {searchOpen && isActive ? (
          <SearchBar id={session.id} onClose={() => setSearchOpen(false)} />
        ) : (
          <button className="icon-btn" title={titled(t('Find'), 'find')} onClick={() => setSearchOpen(true)}>
            <Search size={14} />
          </button>
        )}
        <button className="icon-btn" title={titled(t('Split right with a new shell'), 'split-right')} onClick={() => void splitWithNewShell('row', session.id)}>
          <Columns2 size={14} />
        </button>
        <button className="icon-btn" title={titled(t('Split down with a new shell'), 'split-down')} onClick={() => void splitWithNewShell('column', session.id)}>
          <Rows2 size={14} />
        </button>
        {split && (
          <button className="icon-btn" title={titled(t('Move to its own view'), 'detach-pane')} onClick={() => useUi.getState().detach(session.id)}>
            <Ungroup size={14} />
          </button>
        )}
        <button className="icon-btn" title={t('More')} onClick={(e) => void more(e.currentTarget)}>
          <MoreHorizontal size={15} />
        </button>
        <button className="icon-btn" title={t('Close session')} onClick={() => void closeSession(session.id)}>
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
