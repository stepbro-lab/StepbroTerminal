import { t } from './i18n'

export interface ErrorWords {
  /** What happened, in the app's language. */
  title: string
  /** What to do about it, or the raw message when nothing better is known. */
  hint?: string
}

/**
 * The host reports why a session could not start in one English line, written for the log.
 * The pane says it in words a person can act on, and keeps the original a click away.
 */
export function describeSessionError(error: string | undefined): ErrorWords {
  const raw = (error ?? '').trim()
  const missing = /^Command not found: (.+)$/i.exec(raw)
  if (missing) return { title: t('{command} is not installed, or not on the PATH', { command: missing[1] }), hint: t('Install it, or set its path in Settings > Agents.') }
  const start = /^Failed to start:\s*(.+)$/i.exec(raw)
  if (start) {
    const reason = start[1]
    if (/error code: 267/.test(reason)) return { title: t('The session could not start'), hint: t('The folder does not exist any more.') }
    if (/error code: 2\b|ENOENT/.test(reason)) return { title: t('The session could not start'), hint: t('The program was not found.') }
    if (/error code: 5\b|EACCES|EPERM/.test(reason)) return { title: t('The session could not start'), hint: t('Windows did not allow it. Check the folder permissions or your antivirus.') }
    return { title: t('The session could not start'), hint: reason }
  }
  return { title: t('Something went wrong'), hint: raw || undefined }
}
