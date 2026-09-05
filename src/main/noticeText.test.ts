import { describe, expect, it } from 'vitest'
import type { Session } from '@shared/types'
import { noticeFor } from './noticeText'

function session(over: Partial<Session> = {}, agent: Partial<Session['agent']> = {}): Session {
  return {
    id: 's1',
    title: 'Orchestrator',
    presetId: 'claude',
    cwd: 'C:/repo',
    status: 'attention',
    agent: { ...agent },
    ...over
  } as Session
}

describe('noticeFor', () => {
  it('headlines the session and says who is waiting when nothing more is known', () => {
    expect(noticeFor(session(), 'Claude Code')).toEqual({
      title: 'Orchestrator needs you',
      body: 'Claude Code is waiting for your answer — tap to answer in the terminal.',
      sticky: true
    })
  })

  it('says it is an approval when the screen showed one', () => {
    const n = noticeFor(session({}, { lastMessage: 'Waiting for your approval' }), 'Claude Code')
    expect(n?.body).toBe('Claude Code is waiting on an approval — tap to answer in the terminal.')
  })

  it('repeats what the hook reported', () => {
    const n = noticeFor(session({}, { lastMessage: 'Claude needs your permission to use Bash' }), 'Claude Code')
    expect(n?.title).toBe('Orchestrator needs you')
    expect(n?.body).toBe('Claude needs your permission to use Bash — tap to answer in the terminal.')
  })

  it('falls back to the session title for a plain shell', () => {
    const n = noticeFor(session({ presetId: 'shell' }), null)
    expect(n?.title).toBe('Orchestrator needs you')
    expect(n?.body).toBe('Orchestrator is waiting for your answer — tap to answer in the terminal.')
  })

  it('announces finished and failed sessions by their title', () => {
    expect(noticeFor(session({ status: 'done' }, { lastMessage: 'All tests pass' }), 'Claude Code')).toEqual({
      title: 'Orchestrator',
      body: 'All tests pass',
      sticky: false
    })
    expect(noticeFor(session({ status: 'error', error: 'spawn failed' }), null)?.body).toBe('spawn failed')
  })

  it('says nothing for other states', () => {
    expect(noticeFor(session({ status: 'working' }), 'Claude Code')).toBeNull()
  })
})
