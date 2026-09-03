import { useCallback, useEffect, useState } from 'react'
import { FileDiff, RotateCcw, RotateCw, X } from 'lucide-react'
import type { ChangedFile, GitChanges } from '@shared/types'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { popup } from '@/lib/menus'
import { defaultTitle } from '@/lib/sidebarModel'

/** What changed in the session's repository, with the agent's own edits first, a diff and a revert. */
export function ChangesPane({ sessionId }: { sessionId: string }) {
  const session = useData((s) => s.sessions[sessionId])
  const setSide = useUi((s) => s.setSide)
  const toast = useUi((s) => s.toast)
  const [changes, setChanges] = useState<GitChanges | null>(null)
  const [selected, setSelected] = useState<ChangedFile | null>(null)
  const [diff, setDiff] = useState<string>('')
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    if (!session) return
    setBusy(true)
    try {
      const c = await window.step.invoke('git:changes', session.projectPath, session.createdAt, session.agent.changedFiles ?? [])
      setChanges(c)
      setSelected((cur) => (cur ? (c.files.find((f) => f.path === cur.path) ?? null) : (c.files.find((f) => f.bySession) ?? c.files[0] ?? null)))
    } finally {
      setBusy(false)
    }
  }, [session?.projectPath, session?.createdAt, session?.agent.changedFiles])

  useEffect(() => {
    void refresh()
  }, [refresh, session?.status])

  useEffect(() => {
    if (!selected || !changes?.root) {
      setDiff('')
      return
    }
    let alive = true
    void window.step.invoke('git:diff', changes.root, selected.rel, selected.untracked).then((d) => alive && setDiff(d))
    return () => {
      alive = false
    }
  }, [selected, changes?.root])

  if (!session) return null
  const mine = changes?.files.filter((f) => f.bySession) ?? []
  const others = changes?.files.filter((f) => !f.bySession) ?? []

  const revert = async (f: ChangedFile): Promise<void> => {
    const pick = await popup([{ id: 'yes', label: f.untracked ? `Delete ${f.rel}` : `Discard changes to ${f.rel}` }, { id: 'no', label: 'Keep it' }])
    if (pick !== 'yes' || !changes?.root) return
    try {
      await window.step.invoke('git:revert', changes.root, f.rel, f.untracked)
      toast(f.untracked ? 'File deleted' : 'Changes discarded', 'success')
      await refresh()
    } catch (e: any) {
      toast(e?.message ?? 'Could not revert', 'error')
    }
  }

  return (
    <div className="card relative flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line pl-3 pr-1.5">
        <FileDiff size={14} className="text-muted" />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">Changes · {session.title || defaultTitle(session)}</span>
        <button className="icon-btn" title="Refresh" onClick={() => void refresh()}>
          <RotateCw size={13} className={busy ? 'animate-spin' : undefined} />
        </button>
        <button className="icon-btn" title="Close" onClick={() => setSide(null)}>
          <X size={15} />
        </button>
      </div>
      {changes && !changes.root ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-[13px] text-muted">This folder is not a git repository.</div>
      ) : changes && changes.files.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-[13px] text-muted">Working tree is clean.</div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className="scroll-thin w-[220px] shrink-0 border-r border-line py-1">
            {mine.length > 0 && <Group title="By this session" files={mine} selected={selected} onSelect={setSelected} onRevert={revert} />}
            {others.length > 0 && <Group title={mine.length ? 'Other changes' : 'Changes'} files={others} selected={selected} onSelect={setSelected} onRevert={revert} />}
          </div>
          <div className="scroll-thin min-w-0 flex-1 overflow-auto p-2">
            {selected ? <Diff text={diff} /> : <div className="p-4 text-[12px] text-muted">Pick a file</div>}
          </div>
        </div>
      )}
    </div>
  )
}

function Group({
  title,
  files,
  selected,
  onSelect,
  onRevert
}: {
  title: string
  files: ChangedFile[]
  selected: ChangedFile | null
  onSelect: (f: ChangedFile) => void
  onRevert: (f: ChangedFile) => void
}) {
  const color: Record<ChangedFile['status'], string> = { added: 'var(--success)', deleted: 'var(--danger)', modified: 'var(--attention)', renamed: 'var(--accent)' }
  const letter: Record<ChangedFile['status'], string> = { added: 'A', deleted: 'D', modified: 'M', renamed: 'R' }
  return (
    <div className="mb-1">
      <div className="px-3 pb-0.5 pt-1.5 text-[11px] font-medium text-muted">{title}</div>
      {files.map((f) => (
        <div
          key={f.path}
          className="group flex h-7 items-center gap-2 px-2 text-[12px]"
          style={{ background: selected?.path === f.path ? 'var(--bg-active)' : undefined }}
          onClick={() => onSelect(f)}
          title={f.path}
        >
          <span className="w-3 text-center font-mono text-[11px] font-semibold" style={{ color: color[f.status] }}>
            {letter[f.status]}
          </span>
          <span className="min-w-0 flex-1 truncate" style={{ direction: 'rtl', textAlign: 'left' }}>
            {f.rel}
          </span>
          <button
            className="icon-btn hidden h-5 w-5 group-hover:inline-flex"
            title={f.untracked ? 'Delete file' : 'Discard changes'}
            onClick={(e) => {
              e.stopPropagation()
              onRevert(f)
            }}
          >
            <RotateCcw size={11} />
          </button>
        </div>
      ))}
    </div>
  )
}

function Diff({ text }: { text: string }) {
  if (!text) return <div className="p-4 text-[12px] text-muted">No differences.</div>
  return (
    <pre className="m-0 whitespace-pre font-mono text-[11.5px] leading-[1.5]" style={{ userSelect: 'text' }}>
      {text.split('\n').map((line, i) => {
        const tone =
          line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff ') || line.startsWith('index ')
            ? 'var(--text-muted)'
            : line.startsWith('@@')
              ? 'var(--accent)'
              : line.startsWith('+')
                ? 'var(--success)'
                : line.startsWith('-')
                  ? 'var(--danger)'
                  : 'var(--text-secondary)'
        const bg = line.startsWith('+') && !line.startsWith('+++') ? 'rgba(74, 222, 128, 0.08)' : line.startsWith('-') && !line.startsWith('---') ? 'rgba(248, 113, 113, 0.08)' : undefined
        return (
          <div key={i} style={{ color: tone, background: bg, padding: '0 8px' }}>
            {line || ' '}
          </div>
        )
      })}
    </pre>
  )
}
