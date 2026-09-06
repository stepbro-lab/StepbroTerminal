import { useEffect, useRef, useState } from 'react'
import { Check, NotebookPen, Plus, Trash2, X } from 'lucide-react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import type { Note } from '@shared/types'
import { openCount, sortNotes, useNotes } from '@/stores/notes'
import { useData } from '@/stores/data'
import { timeAgo } from '@/lib/format'
import { AgentLogo } from '../sidebar/AgentLogo'
import { t } from '@/lib/i18n'

gsap.registerPlugin(useGSAP)

/** The floating notes pad. Mounted only while open so the terminal pays nothing for it otherwise. */
export function NotesPanel() {
  const open = useNotes((s) => s.open)
  return open ? <Panel /> : null
}

function Panel() {
  const notes = useNotes((s) => s.notes)
  const setOpen = useNotes((s) => s.setOpen)
  const add = useNotes((s) => s.add)
  const [composing, setComposing] = useState(false)
  const [draft, setDraft] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const seen = useRef(new Set(notes.map((n) => n.id)))
  const sorted = sortNotes(notes)

  useGSAP(() => {
    gsap.from(root.current, { y: 10, scale: 0.985, opacity: 0, duration: 0.2, ease: 'power2.out' })
  }, { scope: root })

  // Notes that arrived while the panel is open slide in and flash.
  useGSAP(
    () => {
      const fresh = notes.filter((n) => !seen.current.has(n.id))
      fresh.forEach((n) => seen.current.add(n.id))
      if (!fresh.length || !list.current) return
      const rows = fresh.map((n) => list.current!.querySelector<HTMLElement>(`[data-note="${n.id}"]`)).filter((el): el is HTMLElement => !!el)
      rows.forEach((el) => el.classList.add('note-fresh'))
      gsap.from(rows, { x: -12, opacity: 0, duration: 0.32, ease: 'power2.out', stagger: 0.05 })
    },
    { dependencies: [notes], scope: list }
  )

  const save = (): void => {
    const t = draft.trim()
    if (t) add(t)
    setDraft('')
    setComposing(false)
  }

  return (
    <div className="absolute inset-0 z-40 flex items-start justify-center pt-[9vh]" style={{ background: 'var(--scrim)' }} onMouseDown={() => setOpen(false)}>
      <div
        ref={root}
        className="flex w-[580px] max-w-[92vw] flex-col overflow-hidden rounded-xl border border-line bg-card"
        style={{ boxShadow: 'var(--shadow-pop)', maxHeight: '74vh' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-2 px-4 pb-2 pt-3.5">
          <NotebookPen size={15} className="text-muted" />
          <span className="text-[13.5px] font-semibold">{t('Notes')}</span>
          <span className="text-[12.5px] text-muted">
            {openCount(notes)} open{notes.length > openCount(notes) ? ` · ${notes.length - openCount(notes)} done` : ''}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <button className="btn btn-secondary" style={{ height: 28, paddingLeft: 9, paddingRight: 11, fontSize: 12 }} onClick={() => setComposing(true)}>
              <Plus size={14} />{t('New note')}</button>
            <button className="icon-btn" title={t('Close')} onClick={() => setOpen(false)}>
              <X size={15} />
            </button>
          </div>
        </header>

        {composing && (
          <div className="px-4 pb-2">
            <textarea
              autoFocus
              value={draft}
              placeholder={t('Write it down…')}
              rows={Math.min(6, Math.max(2, draft.split('\n').length))}
              className="w-full resize-none rounded-[10px] px-3 py-2 text-[13px] leading-[1.45] outline-none"
              style={{ background: 'var(--bg-hover)', color: 'var(--text)' }}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  save()
                } else if (e.key === 'Escape') {
                  e.stopPropagation()
                  setDraft('')
                  setComposing(false)
                }
              }}
            />
            <div className="mt-1 px-1 text-[11.5px]" style={{ color: 'var(--text-faint)' }}>{t('Enter saves · Shift+Enter for a new line · Esc cancels')}</div>
          </div>
        )}

        <div ref={list} className="scroll-thin flex-1 overflow-y-auto px-2 pb-2">
          {sorted.map((n) => (
            <NoteRow key={n.id} note={n} />
          ))}
          {notes.length === 0 && !composing && (
            <p className="px-3 py-10 text-center text-[13px] text-muted">{t('Nothing noted yet. Tell an agent “note that…” or write one yourself.')}</p>
          )}
        </div>

        <footer className="border-t border-line px-4 py-2 text-[11.5px]" style={{ color: 'var(--text-faint)' }}>{t('Claude Code and Codex save here with their save_note tool, and can read, change or remove notes too.')}</footer>
      </div>
    </div>
  )
}

function NoteRow({ note }: { note: Note }) {
  const update = useNotes((s) => s.update)
  const remove = useNotes((s) => s.remove)
  const presets = useData((s) => s.presets)
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(note.text)
  useEffect(() => {
    if (!editing) setText(note.text)
  }, [note.text, editing])

  const agent = note.source.kind === 'agent' ? note.source : null
  const preset = agent ? presets.find((p) => p.id === agent.presetId) : undefined
  const who = agent ? (preset?.name ?? agent.presetId) : 'You'
  const commit = (): void => {
    setEditing(false)
    const t = text.trim()
    if (t && t !== note.text) update(note.id, { text: t })
    else setText(note.text)
  }

  return (
    <div data-note={note.id} className="note-row group flex items-start gap-3 rounded-[10px] px-3 py-2.5" style={{ opacity: note.done ? 0.55 : 1 }}>
      <button
        className="mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px]"
        style={{
          border: `1.5px solid ${note.done ? 'var(--accent)' : 'var(--border-strong)'}`,
          background: note.done ? 'var(--accent)' : 'transparent',
          color: 'var(--on-accent)'
        }}
        title={t(note.done ? 'Reopen' : 'Mark as done')}
        onClick={() => update(note.id, { done: !note.done })}
      >
        {note.done && <Check size={11} strokeWidth={3} />}
      </button>
      <div className="min-w-0 flex-1">
        {editing ? (
          <textarea
            autoFocus
            value={text}
            rows={Math.min(10, Math.max(1, text.split('\n').length))}
            className="w-full resize-none bg-transparent text-[13px] leading-[1.45] outline-none"
            style={{ color: 'var(--text)' }}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                commit()
              } else if (e.key === 'Escape') {
                e.stopPropagation()
                setText(note.text)
                setEditing(false)
              }
            }}
          />
        ) : (
          <div
            className="whitespace-pre-wrap break-words text-[13px] leading-[1.45]"
            style={{ textDecoration: note.done ? 'line-through' : undefined, cursor: 'text' }}
            onClick={() => setEditing(true)}
          >
            {note.text}
          </div>
        )}
        <div className="mt-1 flex items-center gap-1.5 text-[11.5px]" style={{ color: 'var(--text-faint)' }}>
          {agent && (
            <span className="flex items-center" style={{ color: preset?.color }}>
              <AgentLogo presetId={agent.presetId} size={11} />
            </span>
          )}
          <span>{who}</span>
          <span>·</span>
          <span>{timeAgo(note.createdAt)}</span>
          {agent?.title && (
            <>
              <span>·</span>
              <span className="truncate">{agent.title}</span>
            </>
          )}
        </div>
      </div>
      <button className="icon-btn h-6 w-6 opacity-0 group-hover:opacity-100" title={t('Delete')} onClick={() => remove(note.id)}>
        <Trash2 size={13} />
      </button>
    </div>
  )
}
