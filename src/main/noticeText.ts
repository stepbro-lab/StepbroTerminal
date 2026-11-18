import type { Session } from '@shared/types'
import { t } from './i18n'

export interface Notice {
  title: string
  body: string
  sticky: boolean
}

export function noticeFor(s: Session, agent: string | null): Notice | null {
  const session = s.title || t('Session')
  const asked = s.agent.lastMessage
  switch (s.status) {
    case 'attention': {
      const who = agent ?? session
      const generic = !asked || asked === 'Waiting for your approval'
      const body = generic
        ? t(asked ? '{agent} is waiting on an approval — tap to answer in the terminal.' : '{agent} is waiting for your answer — tap to answer in the terminal.', { agent: who })
        : t('{message} — tap to answer in the terminal.', { message: asked })
      return { title: t('{session} needs you', { session }), body, sticky: true }
    }
    case 'done':
      return { title: session, body: asked ?? t('Finished'), sticky: false }
    case 'error':
      return { title: session, body: s.error ?? t('Something went wrong'), sticky: false }
    default:
      return null
  }
}
