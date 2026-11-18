import { useState } from 'react'
import { ArchiveRestore, Search, Trash2 } from 'lucide-react'
import type { Session } from '@shared/types'
import { projectName } from '@shared/paths'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { closeSession, restoreSession } from '@/lib/actions'
import { defaultTitle, rowPresetId } from '@/lib/sidebarModel'
import { popup } from '@/lib/menus'
import { timeAgo } from '@/lib/format'
import { t } from '@/lib/i18n'

const archivedAt = (s: Session): number => s.archivedAt ?? s.updatedAt

export function ArchivedPage() {
  const sessions = useData((s) => s.sessions)
  const presets = useData((s) => s.presets)
  const [query, setQuery] = useState('')
  const agentOf = (s: Session): string => {
    const id = rowPresetId(s)
    return presets.find((p) => p.id === id)?.name ?? (id === 'shell' ? 'Shell' : id)
  }
  const all = Object.values(sessions)
    .filter((s) => s.archived)
    .sort((a, b) => archivedAt(b) - archivedAt(a))
  const words = query.trim().toLowerCase()
  const shown = words ? all.filter((s) => `${s.title || defaultTitle(s)} ${projectName(s.projectPath)} ${agentOf(s)}`.toLowerCase().includes(words)) : all

  const deleteAll = async (): Promise<void> => {
    const pick = await popup([
      { id: 'delete', label: t(all.length === 1 ? 'Delete the archived session' : 'Delete all {n} archived sessions', { n: all.length }) },
      { id: 'cancel', label: t('Cancel') }
    ])
    if (pick !== 'delete') return
    for (const s of all) await closeSession(s.id)
  }
  const restore = (id: string): void => {
    restoreSession(id)
    useUi.getState().setSettingsOpen(false)
  }

  if (all.length === 0) return <p className="py-10 text-center text-[13px] text-muted">{t('Nothing archived. A session you archive waits here, to be restored or deleted.')}</p>

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <label className="field flex h-8 flex-1 items-center gap-2 px-2.5">
          <Search size={14} className="shrink-0 text-muted" />
          <input className="min-w-0 flex-1 bg-transparent text-[13px] outline-none" placeholder={t('Search the archived…')} value={query} onChange={(e) => setQuery(e.target.value)} spellCheck={false} />
        </label>
        <button className="btn btn-secondary h-8 gap-1.5 px-3 text-[12.5px]" onClick={() => void deleteAll()}>
          <Trash2 size={13} />
          {t('Delete all')}
        </button>
      </div>
      {shown.length === 0 && <p className="py-6 text-center text-[12.5px] text-muted">{t('No archived session matches.')}</p>}
      {shown.map((s) => {
        const ago = timeAgo(archivedAt(s))
        return (
          <div key={s.id} className="flex items-center gap-3 rounded-[10px] px-4 py-3" style={{ boxShadow: '0 0 0 1px var(--border) inset' }}>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] font-medium text-fg">{s.title || defaultTitle(s)}</div>
              <div className="mt-0.5 truncate text-[12px] text-muted">
                {projectName(s.projectPath)} · {agentOf(s)} · {ago === t('now') ? t('archived just now') : t('archived {ago} ago', { ago })}
              </div>
            </div>
            <button className="btn btn-secondary h-7 shrink-0 gap-1.5 px-2.5 text-[12.5px]" onClick={() => restore(s.id)}>
              <ArchiveRestore size={13} />
              {t('Restore')}
            </button>
            <button className="icon-btn shrink-0" title={t('Delete')} style={{ color: 'var(--danger)' }} onClick={() => void closeSession(s.id)}>
              <Trash2 size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
