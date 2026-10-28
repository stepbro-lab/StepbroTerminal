import { useEffect, useState } from 'react'
import { usePrefs } from '@/stores/prefs'
import { useWhatsNew } from '@/stores/whatsNew'
import { t } from '@/lib/i18n'

/** A while after launch, so the question comes once the window has settled and not over anything. */
const ASK_AFTER_MS = 4000

/**
 * Asks once whether errors may be reported, in a card in the corner that covers nothing. Until it is
 * answered nothing is sent; Settings, under Advanced, changes the answer later. Never at the same
 * time as What's new.
 */
export function ErrorReportsAsk() {
  const answer = usePrefs((s) => (s.prefs ? s.prefs.errorReports : null))
  const set = usePrefs((s) => s.set)
  const whatsNew = useWhatsNew((s) => !!s.entries)
  const [due, setDue] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setDue(true), ASK_AFTER_MS)
    return () => window.clearTimeout(timer)
  }, [])

  if (!window.step.reportsErrors || answer !== undefined || whatsNew || !due) return null
  return (
    <div
      role="dialog"
      aria-label={t('Send error reports?')}
      className="fade-in absolute bottom-4 right-4 z-40 w-[340px] max-w-[calc(100vw-32px)] rounded-[16px] border border-line bg-card p-4"
      style={{ boxShadow: 'var(--shadow-pop)' }}
    >
      <h2 className="text-[13.5px] font-semibold tracking-[-0.01em]">{t('Send error reports?')}</h2>
      <p className="mt-1.5 text-[12.5px] leading-[1.5] text-secondary">
        {t('When something in stepbro terminal fails, it can send what went wrong so it gets fixed. Never what you type, what your terminals show, or the names of your folders.')}
      </p>
      <p className="mt-1.5 text-[12px] leading-[1.45] text-muted">{t('You can change this in Settings, under Advanced.')}</p>
      <div className="mt-3.5 flex justify-end gap-2">
        <button className="btn btn-secondary h-7 px-3 text-[12.5px]" onClick={() => void set({ errorReports: false })}>
          {t('No, thanks')}
        </button>
        <button className="btn btn-primary h-7 px-3 text-[12.5px]" onClick={() => void set({ errorReports: true })}>
          {t('Send reports')}
        </button>
      </div>
    </div>
  )
}
