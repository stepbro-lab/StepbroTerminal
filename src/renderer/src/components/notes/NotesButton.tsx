import { NotebookPen } from 'lucide-react'
import { openCount, useNotes } from '@/stores/notes'
import { useShortcutLabel } from '@/lib/shortcuts'
import { t } from '@/lib/i18n'

/** Title-bar button for the Notes panel; the flight animation lands on it. */
export function NotesButton() {
  const notesKey = useShortcutLabel('notes')
  const count = useNotes((s) => openCount(s.notes))
  const open = useNotes((s) => s.open)
  const toggle = useNotes((s) => s.toggle)
  return (
    <button
      className="icon-btn no-drag"
      data-notes-target
      data-on={open}
      style={{ width: 'auto', paddingLeft: 6, paddingRight: count ? 8 : 6 }}
      title={notesKey ? `${t('Notes')}  ·  ${notesKey}` : t('Notes')}
      onClick={toggle}
    >
      <span className="flex items-center gap-1.5">
        <NotebookPen size={15} />
        {count > 0 && (
          <span className="text-[11.5px] font-semibold tabular-nums" data-notes-count>
            {count}
          </span>
        )}
      </span>
    </button>
  )
}
