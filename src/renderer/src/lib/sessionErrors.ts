import { t } from './i18n'

export interface ErrorWords {
  title: string
  hint?: string
}

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
