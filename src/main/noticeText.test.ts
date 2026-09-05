import { describe, expect, it } from 'vitest'
import type { Session } from '@shared/types'
import { noticeFor } from './noticeText'

function session(over: Partial<Session> = {}, agent: Partial<Session['agent']> = {}): Session {
  return {
    id: 's1',
    title: 'stepbro-terminal',
    presetId: 'claude',
    cwd: 'C:/repo',
    status: 'attention',
    agent: { ...agent },
    ...over
  } as Session
}

describe('noticeFor', () => {
  it('names the agent that is waiting and says the session it is in', () => {
    expect(noticeFor(session(), 'Claude Code')).toEqual({
      title: 'Claude Code needs an answer',
      body: 'stepbro-terminal',
      sticky: true
    })
  })

  it('adds what was asked when the hook reported it', () => {
    const n = noticeFor(session({}, { lastMessage: 'Allow Bash to run pnpm test?' }), 'Codex')
    expect(n?.title).toBe('Codex needs an answer')
    expect(n?.body).toBe('stepbro-terminal · Allow Bash to run pnpm test?')
  })

  it('falls back to the session title for a plain shell', () => {
    const n = noticeFor(session({ presetId: 'shell' }), null)
    expect(n?.title).toBe('stepbro-terminal needs an answer')
    expect(n?.body).toBe('Waiting for your reply')
  })

  it('announces finished and failed sessions by their title', () => {
    expect(noticeFor(session({ status: 'done' }, { lastMessage: 'All tests pass' }), 'Claude Code')).toEqual({
      title: 'stepbro-terminal',
      body: 'All tests pass',
      sticky: false
    })
    expect(noticeFor(session({ status: 'error', error: 'spawn failed' }), null)?.body).toBe('spawn failed')
  })

  it('says nothing for other states', () => {
    expect(noticeFor(session({ status: 'working' }), 'Claude Code')).toBeNull()
  })
})
