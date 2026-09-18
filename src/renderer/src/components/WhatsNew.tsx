import { useEffect, useRef } from 'react'
import { Check, X } from 'lucide-react'
import { CHANGELOG, unseenChanges, type ChangeKind, type ChangelogEntry } from '@shared/changelog'
import { usePrefs } from '@/stores/prefs'
import { useWhatsNew } from '@/stores/whatsNew'
import { currentLanguage, t } from '@/lib/i18n'
import { TopitoCanvas } from './topito/TopitoCanvas'
import { useTopitoElsewhere } from './topito/Topito'

/** A moment after launch, so the page opens over a window that has finished settling. */
const SHOW_AFTER_MS = 900

const GROUPS: Array<{ kind: ChangeKind; title: string }> = [
  { kind: 'new', title: 'New' },
  { kind: 'improved', title: 'Improved' },
  { kind: 'fixed', title: 'Fixed' }
]

/** Every release so far, newest first, for when someone asks to see them again. */
export function showAllChanges(): void {
  useWhatsNew.getState().show(CHANGELOG)
}

/** Topito introducing himself, waving, with room on the right for the close button. */
function Greeting() {
  useTopitoElsewhere()
  return (
    <div className="mb-6 flex items-end gap-3 pr-8">
      <TopitoCanvas clip="greet" cell={4} rows={15} />
      <div className="whats-new-bubble mb-6">{t('Hi! I’m Topito, the new mascot of stepbro terminal. I’ll be your trusty sidekick!')}</div>
    </div>
  )
}

function Entry({ entry }: { entry: ChangelogEntry }) {
  const date = new Date(`${entry.date}T12:00:00`).toLocaleDateString(currentLanguage(), { day: 'numeric', month: 'long', year: 'numeric' })
  return (
    <section className="mt-5 first:mt-0">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em]">{t('What’s new in {version}', { version: entry.version })}</h2>
        <span className="shrink-0 text-[12px] text-muted">{date}</span>
      </div>
      <p className="mt-1 text-[13px] leading-[1.5] text-secondary">{t(entry.headline)}</p>
      {GROUPS.map(({ kind, title }) => {
        const changes = entry.changes.filter((c) => c.kind === kind)
        if (!changes.length) return null
        return (
          <div key={kind} className="mt-4">
            <h3 className="text-[12.5px] font-medium text-muted">{t(title)}</h3>
            <ul className="mt-1.5 flex flex-col gap-1.5">
              {changes.map((c) => (
                <li key={c.text} className="flex gap-2.5 text-[13px] leading-[1.5]">
                  <span className="mt-[7px] h-[6px] w-[6px] shrink-0 rounded-full" style={{ background: kind === 'new' ? 'var(--accent)' : 'var(--text-faint)' }} />
                  <span>{t(c.text)}</span>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </section>
  )
}

/**
 * What changed, shown once after an update and on request from Settings. The release that
 * brought Topito opens with him saying hello, and with a way to turn him on right there.
 */
export function WhatsNew() {
  const entries = useWhatsNew((s) => s.entries)
  const show = useWhatsNew((s) => s.show)
  const close = useWhatsNew((s) => s.close)
  const prefs = usePrefs((s) => s.prefs)
  const setPrefs = usePrefs((s) => s.set)
  const checked = useRef(false)

  // Once, when the preferences arrive: anything released since the version last seen.
  useEffect(() => {
    if (!prefs || checked.current) return
    checked.current = true
    const unseen = unseenChanges(CHANGELOG, prefs.seenVersion, window.step.version)
    if (!unseen.length) return
    const timer = window.setTimeout(() => show(unseen), SHOW_AFTER_MS)
    return () => window.clearTimeout(timer)
  }, [prefs, show])

  useEffect(() => {
    if (!entries) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [entries, close])

  if (!entries) return null
  const topito = entries.some((e) => e.topito)
  const topitoOn = prefs?.topito === true

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center p-6" style={{ background: 'var(--scrim)' }} onMouseDown={close}>
      <div
        role="dialog"
        aria-label={t('What’s new')}
        className="fade-in relative flex max-h-[84vh] w-[540px] max-w-[92vw] flex-col overflow-hidden rounded-[18px] border border-line bg-card"
        style={{ boxShadow: 'var(--shadow-pop)' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button className="icon-btn absolute right-3 top-3 z-10" title={t('Close')} onClick={close}>
          <X size={15} />
        </button>
        <div className="whats-new-scroll min-h-0 flex-1 overflow-y-auto px-6 pb-7 pt-6">
          {topito && <Greeting />}
          {entries.map((entry) => (
            <Entry key={entry.version} entry={entry} />
          ))}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-line px-6 py-3.5">
          {topito ? (
            topitoOn ? (
              <span className="flex items-center gap-1.5 text-[12.5px] text-muted">
                <Check size={14} />
                {t('Topito is on')}
              </span>
            ) : (
              <button className="btn btn-secondary" onClick={() => void setPrefs({ topito: true })}>
                {t('Turn on Topito')}
              </button>
            )
          ) : (
            <span />
          )}
          <button className="btn btn-primary" onClick={close}>
            {t('Got it')}
          </button>
        </div>
      </div>
    </div>
  )
}
