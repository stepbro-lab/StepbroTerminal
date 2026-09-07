import { useCallback, useEffect, useMemo, useState } from 'react'
import { FileDiff as FileDiffIcon, RotateCw, X } from 'lucide-react'
import type { ChangedFile, FileDiff, GitChanges } from '@shared/types'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { popup } from '@/lib/menus'
import { defaultTitle } from '@/lib/sidebarModel'
import { t } from '@/lib/i18n'

const STATUS_COLOR: Record<ChangedFile['status'], string> = { added: 'var(--success)', deleted: 'var(--danger)', modified: 'var(--attention)', renamed: 'var(--accent)' }
const statusWord = (s: ChangedFile['status']): string => t(s === 'added' ? 'Added' : s === 'deleted' ? 'Deleted' : s === 'renamed' ? 'Renamed' : 'Modified')
/** "name" and "folder/" of a repository-relative path. */
const split = (rel: string): { name: string; dir: string } => {
  const i = rel.lastIndexOf('/')
  return i < 0 ? { name: rel, dir: '' } : { name: rel.slice(i + 1), dir: rel.slice(0, i + 1) }
}

/** What changed in the session's repository, with the agent's own edits first, a readable diff and a way back. */
export function ChangesPane({ sessionId }: { sessionId: string }) {
  const session = useData((s) => s.sessions[sessionId])
  const setSide = useUi((s) => s.setSide)
  const toast = useUi((s) => s.toast)
  const [changes, setChanges] = useState<GitChanges | null>(null)
  const [selected, setSelected] = useState<ChangedFile | null>(null)
  const [diff, setDiff] = useState<FileDiff | null>(null)
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
      setDiff(null)
      return
    }
    let alive = true
    void window.step.invoke('git:diff', changes.root, selected.rel, selected.untracked).then((d) => alive && setDiff(d))
    return () => {
      alive = false
    }
  }, [selected, changes?.root])

  if (!session) return null
  const files = changes?.files ?? []
  const mine = files.filter((f) => f.bySession)
  const others = files.filter((f) => !f.bySession)

  const revert = async (f: ChangedFile): Promise<void> => {
    const pick = await popup([{ id: 'yes', label: f.untracked ? t('Delete {file}', { file: f.rel }) : t('Discard changes to {file}', { file: f.rel }) }, { id: 'no', label: t('Keep it') }])
    if (pick !== 'yes' || !changes?.root) return
    try {
      await window.step.invoke('git:revert', changes.root, f.rel, f.untracked)
      toast(t(f.untracked ? 'File deleted' : 'Changes discarded'), 'success')
      await refresh()
    } catch (e: any) {
      toast(e?.message ?? t('Could not revert'), 'error')
    }
  }

  return (
    <div className="card relative flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line pl-3 pr-1.5">
        <FileDiffIcon size={14} className="text-muted" />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
          {t('Changes')} · {session.title || defaultTitle(session)}
        </span>
        <button className="icon-btn" title={t('Refresh')} onClick={() => void refresh()}>
          <RotateCw size={13} className={busy ? 'animate-spin' : undefined} />
        </button>
        <button className="icon-btn" title={t('Close')} onClick={() => setSide(null)}>
          <X size={15} />
        </button>
      </div>
      {changes && !changes.root ? (
        <Empty>{t('This folder is not a git repository.')}</Empty>
      ) : changes && files.length === 0 ? (
        <Empty>{t('No changes in this folder.')}</Empty>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* The panel is narrow, so the list sits above the diff and leaves it the whole width. */}
          <div className="scroll-thin max-h-[42%] shrink-0 overflow-auto border-b border-line pb-1">
            <Summary files={files} />
            {mine.length > 0 && <Group title={t('By this session')} files={mine} selected={selected} onSelect={setSelected} />}
            {others.length > 0 && <Group title={t(mine.length ? 'Elsewhere in this folder' : 'In this folder')} files={others} selected={selected} onSelect={setSelected} />}
          </div>
          {selected && <FileHeader file={selected} onRevert={revert} />}
          <div className="scroll-thin min-h-0 flex-1 overflow-auto">
            {selected ? <DiffView diff={diff} /> : <Hint>{t('Pick a file to see what changed.')}</Hint>}
          </div>
        </div>
      )}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 items-center justify-center p-6 text-center text-[13px] text-muted">{children}</div>
}

function Hint({ children }: { children: React.ReactNode }) {
  return <div className="p-4 text-[12.5px] text-muted">{children}</div>
}

/** How many files, and how many lines in and out, over the whole list. */
function Summary({ files }: { files: ChangedFile[] }) {
  let added = 0
  let removed = 0
  for (const f of files) {
    added += f.added ?? 0
    removed += f.removed ?? 0
  }
  return (
    <div className="flex items-center gap-2 px-3 pb-1 pt-2 text-[11.5px] text-muted">
      <span>{t(files.length === 1 ? '{n} file changed' : '{n} files changed', { n: files.length })}</span>
      <Counts added={added} removed={removed} />
    </div>
  )
}

/** "+12 −4", each in its own color; nothing when the file is binary or nothing was counted. */
function Counts({ added, removed, binary }: { added?: number; removed?: number; binary?: boolean }) {
  if (binary) return <span className="shrink-0 text-[11px] text-muted">{t('binary')}</span>
  if (added === undefined && removed === undefined) return null
  return (
    <span className="flex shrink-0 gap-1.5 font-mono text-[11px] tabular-nums">
      {(added ?? 0) > 0 && <span style={{ color: 'var(--success)' }}>+{added}</span>}
      {(removed ?? 0) > 0 && <span style={{ color: 'var(--danger)' }}>−{removed}</span>}
      {!added && !removed && <span className="text-muted">0</span>}
    </span>
  )
}

function Group({ title, files, selected, onSelect }: { title: string; files: ChangedFile[]; selected: ChangedFile | null; onSelect: (f: ChangedFile) => void }) {
  return (
    <div className="mb-1">
      <div className="px-3 pb-0.5 pt-2 text-[11.5px] font-medium text-muted">{title}</div>
      {files.map((f) => {
        const { name, dir } = split(f.rel)
        const on = selected?.path === f.path
        return (
          <div
            key={f.path}
            className="flex h-7 cursor-default items-center gap-2 px-3 text-[12.5px]"
            style={{ background: on ? 'var(--bg-active)' : undefined }}
            onClick={() => onSelect(f)}
            title={`${statusWord(f.status)} · ${f.rel}`}
          >
            <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: STATUS_COLOR[f.status] }} />
            <span className="min-w-0 flex-1 truncate">
              <span className={on ? 'text-fg' : 'text-secondary'}>{name}</span>
              {dir && <span className="text-muted"> {dir}</span>}
            </span>
            <Counts added={f.added} removed={f.removed} binary={f.binary} />
          </div>
        )
      })}
    </div>
  )
}

/** The chosen file above its diff: what happened to it, in words, and the button that undoes it. */
function FileHeader({ file, onRevert }: { file: ChangedFile; onRevert: (f: ChangedFile) => void }) {
  const { name, dir } = split(file.rel)
  return (
    <div className="flex h-9 shrink-0 items-center gap-2.5 border-b border-line pl-3 pr-2">
      <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: STATUS_COLOR[file.status] }} />
      <span className="min-w-0 flex-1 truncate text-[12.5px]" title={file.path}>
        <span className="font-medium text-fg">{name}</span>
        {dir && <span className="text-muted"> {dir}</span>}
      </span>
      <span className="shrink-0 text-[11.5px] text-muted">{statusWord(file.status)}</span>
      <Counts added={file.added} removed={file.removed} binary={file.binary} />
      <button className="btn btn-secondary ml-1 h-6 shrink-0 px-2.5 text-[11.5px]" onClick={() => onRevert(file)}>
        {t(file.untracked ? 'Delete file' : 'Discard changes')}
      </button>
    </div>
  )
}

type Row = { kind: 'hunk'; line: number; text: string } | { kind: 'note'; text: string } | { kind: 'ctx' | 'add' | 'del'; old?: number; new?: number; text: string }

/** Git's unified diff as rows to draw: the file headers go, hunks become a line marker, every line gets its numbers. */
function parseDiff(text: string): Row[] {
  const rows: Row[] = []
  const lines = text.split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  let oldNo = 0
  let newNo = 0
  let inHunk = false
  for (const line of lines) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@ ?(.*)$/.exec(line)
    if (hunk) {
      oldNo = Number(hunk[1])
      newNo = Number(hunk[2])
      rows.push({ kind: 'hunk', line: newNo, text: hunk[3] })
      inHunk = true
      continue
    }
    if (!inHunk) {
      if (/^(diff --git|index |--- |\+\+\+ |new file mode|deleted file mode|old mode|new mode|similarity index|rename from|rename to)/.test(line)) continue
      // A new file arrives without headers: it starts at line 1.
      inHunk = true
      oldNo = 1
      newNo = 1
    }
    if (line.startsWith('\\')) rows.push({ kind: 'note', text: t('No newline at end of file') })
    else if (line.startsWith('+')) rows.push({ kind: 'add', new: newNo++, text: line.slice(1) })
    else if (line.startsWith('-')) rows.push({ kind: 'del', old: oldNo++, text: line.slice(1) })
    else rows.push({ kind: 'ctx', old: oldNo++, new: newNo++, text: line.slice(1) })
  }
  return rows
}

const MAX_ROWS = 2500

function DiffView({ diff }: { diff: FileDiff | null }) {
  const rows = useMemo(() => (diff?.kind === 'text' ? parseDiff(diff.text) : []), [diff])
  if (!diff) return null
  if (diff.kind === 'binary') return <Hint>{t('A binary file: there is no text to compare.')}</Hint>
  if (diff.kind === 'large') return <Hint>{t('Too large to show here.')}</Hint>
  if (diff.kind === 'error') return <Hint>{diff.text}</Hint>
  if (rows.length === 0) return <Hint>{t('No differences.')}</Hint>
  let last = 0
  for (const r of rows) if (r.kind !== 'hunk' && r.kind !== 'note') last = Math.max(last, r.old ?? 0, r.new ?? 0)
  const gutter = `${String(last).length + 1}ch`
  return (
    <div className="py-1 font-mono text-[12px] leading-[1.55]" style={{ userSelect: 'text' }}>
      {rows.slice(0, MAX_ROWS).map((r, i) => {
        if (r.kind === 'hunk')
          return (
            <div key={i} className="my-1.5 flex select-none items-center gap-2 px-3 text-[11px] text-muted">
              <span className="h-px w-4 shrink-0" style={{ background: 'var(--border-strong)' }} />
              <span className="truncate">
                {t('Line {n}', { n: r.line })}
                {r.text ? ` · ${r.text}` : ''}
              </span>
              <span className="h-px flex-1" style={{ background: 'var(--border-strong)' }} />
            </div>
          )
        if (r.kind === 'note')
          return (
            <div key={i} className="select-none px-3 text-[11px] italic text-muted" style={{ paddingLeft: `calc(${gutter} * 2 + 2ch + 12px)` }}>
              {r.text}
            </div>
          )
        const tint = r.kind === 'add' ? 'var(--success)' : r.kind === 'del' ? 'var(--danger)' : null
        return (
          <div key={i} className="flex" style={{ background: tint ? `color-mix(in srgb, ${tint} 11%, transparent)` : undefined, color: tint ? 'var(--text)' : 'var(--text-secondary)' }}>
            <span className="shrink-0 select-none pl-2 text-right text-muted opacity-70" style={{ width: gutter, paddingLeft: 8 }}>
              {r.old ?? ''}
            </span>
            <span className="shrink-0 select-none pr-1 text-right text-muted opacity-70" style={{ width: gutter }}>
              {r.new ?? ''}
            </span>
            <span className="w-[2ch] shrink-0 select-none text-center font-semibold" style={{ color: tint ?? 'transparent' }}>
              {r.kind === 'add' ? '+' : r.kind === 'del' ? '−' : ''}
            </span>
            <span className="min-w-0 flex-1 whitespace-pre-wrap break-words pr-3">{r.text || ' '}</span>
          </div>
        )
      })}
      {rows.length > MAX_ROWS && <Hint>{t('Showing the first {n} lines.', { n: MAX_ROWS })}</Hint>}
    </div>
  )
}
