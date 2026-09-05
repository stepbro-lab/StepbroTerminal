import { displayParts, type ShortcutId } from '@shared/keybindings'
import { isMac } from '@/lib/format'
import { usePrefs } from '@/stores/prefs'
import { currentBindings } from '@/lib/shortcuts'

/** Key caps for a shortcut (by id, following the user's changes) or for a fixed chord. Nothing when it has no key. */
export function Keys({ id, chord, className = '' }: { id?: ShortcutId; chord?: string | null; className?: string }) {
  usePrefs((s) => s.prefs?.keybindings)
  const c = chord !== undefined ? chord : id ? currentBindings()[id] : null
  if (!c) return null
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {displayParts(c, isMac).map((p, i) => (
        <kbd key={i}>{p}</kbd>
      ))}
    </span>
  )
}
