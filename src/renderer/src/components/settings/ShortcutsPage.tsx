import { useEffect, useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { SHORTCUTS, SHORTCUT_GROUPS, chordFromEvent, defaultChord, displayChord, formatChord, parseChord, resolveBindings, shortcutDef, validateChord, type Keybindings, type ShortcutId } from '@shared/keybindings'
import { usePrefs } from '@/stores/prefs'
import { isMac } from '@/lib/format'
import { setShortcutCapture } from '@/lib/shortcuts'
import { Keys } from '../Keys'
import { Row, Section, SmallButton } from './controls'
import { t } from '@/lib/i18n'

interface Note {
  id: ShortcutId
  text: string
  tone: 'error' | 'info'
}

/**
 * Every shortcut with its keys, each one a click away from being changed: click the keys, press
 * the new chord, done. A chord already used elsewhere moves here and leaves the other shortcut
 * without a key, which the page says. Backspace clears a shortcut; Esc keeps what was there.
 */
export function ShortcutsPage() {
  const overrides = usePrefs((s) => s.prefs?.keybindings) ?? {}
  const set = usePrefs((s) => s.set)
  const bindings = resolveBindings(overrides, isMac)
  const [recording, setRecording] = useState<ShortcutId | null>(null)
  const [note, setNote] = useState<Note | null>(null)
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const changed = SHORTCUTS.some((s) => overrides[s.id] !== undefined)

  const say = (id: ShortcutId, text: string, tone: Note['tone'] = 'error'): void => {
    setNote({ id, text, tone })
    if (noteTimer.current) clearTimeout(noteTimer.current)
    noteTimer.current = setTimeout(() => setNote(null), 3000)
  }
  const save = (next: Keybindings): void => void set({ keybindings: next })

  useEffect(() => {
    if (!recording) return
    const id = recording
    const onKey = (ev: KeyboardEvent): void => {
      ev.preventDefault()
      if (ev.key === 'Escape') {
        setRecording(null)
        return
      }
      const plain = !ev.ctrlKey && !ev.altKey && !ev.metaKey && !ev.shiftKey
      if (plain && (ev.key === 'Backspace' || ev.key === 'Delete')) {
        save({ ...overrides, [id]: null })
        setRecording(null)
        return
      }
      let chord = chordFromEvent(ev, isMac)
      if (!chord) return // a modifier on its own: keep waiting for the key
      if (id === 'jump') {
        const c = parseChord(chord)
        if (!/^[1-9]$/.test(c.key)) {
          say(id, t('Press the modifier with any digit, 1 to 9'))
          return
        }
        chord = formatChord({ mods: c.mods, key: 'Digit' })
      }
      const problem = validateChord(chord, isMac, id)
      if (problem) {
        say(id, t(problem))
        return
      }
      const taken = SHORTCUTS.find((s) => s.id !== id && bindings[s.id] === chord)
      const next: Keybindings = { ...overrides, [id]: chord === defaultChord(shortcutDef(id), isMac) ? undefined : chord }
      if (next[id] === undefined) delete next[id]
      if (taken) next[taken.id] = null
      save(next)
      setRecording(null)
      if (taken) say(id, t('Taken from “{label}”, which has no key now', { label: t(taken.label) }), 'info')
    }
    setShortcutCapture(onKey)
    return () => setShortcutCapture(null)
  }, [recording, overrides, bindings, set])

  useEffect(() => () => setShortcutCapture(null), [])

  const reset = (id: ShortcutId): void => {
    const next = { ...overrides }
    delete next[id]
    save(next)
  }

  return (
    <>
      <div className="mb-6 flex items-start gap-4">
        <p className="max-w-[560px] text-[12.5px] leading-[1.5] text-muted">{t('Click a shortcut to change it, then press the new keys. Esc keeps the old one, Backspace removes it. A combination that is already in use moves to the shortcut you are editing.')}</p>
        {changed && (
          <span className="ml-auto shrink-0">
            <SmallButton onClick={() => save({})}>{t('Reset all')}</SmallButton>
          </span>
        )}
      </div>
      {SHORTCUT_GROUPS.map((group) => (
        <Section key={group} title={t(group)}>
          <div className="flex flex-col">
            {SHORTCUTS.filter((s) => s.group === group).map((s) => {
              const chord = bindings[s.id]
              const custom = overrides[s.id] !== undefined
              const active = recording === s.id
              return (
                <div key={s.id} className="setting-row !min-h-[36px] !py-1">
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] text-fg">{t(s.label)}</div>
                    {note?.id === s.id && (
                      <div className="fade-in text-[11.5px]" style={{ color: note.tone === 'error' ? 'var(--danger)' : 'var(--text-muted)' }}>
                        {note.text}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {custom && !active && (
                      <button className="icon-btn h-6 w-6" title={t('Back to {chord}', { chord: displayChord(defaultChord(s, isMac), isMac) })} onClick={() => reset(s.id)}>
                        <RotateCcw size={12} />
                      </button>
                    )}
                    <button
                      className="key-cap-btn"
                      data-recording={active}
                      title={t(active ? 'Press the new keys' : 'Click to change')}
                      onClick={() => setRecording(active ? null : s.id)}
                    >
                      {active ? (
                        <span className="px-1 text-[11.5px] font-medium" style={{ color: 'var(--accent)' }}>{t('Press keys…')}</span>
                      ) : chord ? (
                        <Keys chord={chord} />
                      ) : (
                        <span className="px-1 text-[11.5px] text-muted">{t('No key')}</span>
                      )}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </Section>
      ))}
      <Section title={t('Mouse and clipboard')} description={t('These come with the terminal and cannot be changed.')}>
        <Row label={t('Copy selection')}>
          <Keys chord={isMac ? 'Mod+C' : 'Mod+Shift+C'} />
          {!isMac && (
            <span className="text-[12.5px] text-muted">
              {t('or')} <Keys chord="Mod+C" /> {t('with a selection')}</span>
          )}
        </Row>
        <Row label={t('Paste text, or hand an image to the agent')}>
          <Keys chord="Mod+V" />
        </Row>
        <Row label={t('Arrange panes')}>
          <span className="max-w-[340px] text-right text-[12.5px] text-muted">{t('Drag a session from the sidebar, or a card title, onto an edge of a pane.')}</span>
        </Row>
        <Row label={t('Drop files onto the terminal')}>
          <span className="text-[12.5px] text-muted">{t('Inserts their paths.')}</span>
        </Row>
      </Section>
    </>
  )
}
