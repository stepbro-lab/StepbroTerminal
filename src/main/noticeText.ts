import type { Session } from '@shared/types'

export interface Notice {
  title: string
  body: string
  /** Stays on screen until dismissed (a question the user has to answer). */
  sticky: boolean
}

/**
 * Words for a session notification. An agent that stops to ask something is named first, "Claude
 * Code needs an answer", so the user knows who is waiting even with several sessions open; the
 * session and what was asked, when known, go in the body. Finished and failed sessions are
 * announced by the session's own title.
 */
export function noticeFor(s: Session, agent: string | null): Notice | null {
  const session = s.title || 'Session'
  const asked = s.agent.lastMessage
  switch (s.status) {
    case 'attention':
      return {
        title: `${agent ?? session} needs an answer`,
        body: agent ? (asked ? `${session} · ${asked}` : session) : (asked ?? 'Waiting for your reply'),
        sticky: true
      }
    case 'done':
      return { title: session, body: asked ?? 'Finished', sticky: false }
    case 'error':
      return { title: session, body: s.error ?? 'Something went wrong', sticky: false }
    default:
      return null
  }
}
