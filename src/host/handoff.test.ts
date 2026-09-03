import { describe, expect, it } from 'vitest'
import type { Session } from '@shared/types'
import { pickSession } from './handoff'

const mk = (id: string, over: Partial<Session> & { detected?: string }): Session =>
  ({
    id,
    projectPath: 'C:\\p',
    presetId: 'shell',
    title: '',
    titleSource: 'none',
    pinned: false,
    createdAt: 1,
    updatedAt: 1,
    status: 'idle',
    statusAt: 1,
    alive: true,
    cols: 80,
    rows: 24,
    agent: { detectedPreset: over.detected },
    launch: { command: 'x', args: [], hooks: false },
    ...over
  }) as Session

const sessions = [
  mk('aaaa-1', { title: 'STEPBRO TERMINAL CLAUDE', presetId: 'claude', updatedAt: 5 }),
  mk('bbbb-2', { title: 'STEPBRO TERMINAL CODEX', detected: 'codex', updatedAt: 3 }),
  mk('cccc-3', { title: 'old codex', presetId: 'codex', alive: false, updatedAt: 9 }),
  mk('dddd-4', { title: 'Build', updatedAt: 2 })
]

describe('pickSession', () => {
  it('finds by agent, preferring live sessions', () => {
    expect(pickSession(sessions, 'codex')?.id).toBe('bbbb-2')
    expect(pickSession(sessions, 'Codex ')?.id).toBe('bbbb-2')
  })

  it('finds by title, by id prefix and by a word that names an agent', () => {
    expect(pickSession(sessions, 'terminal codex')?.id).toBe('bbbb-2')
    expect(pickSession(sessions, 'dddd')?.id).toBe('dddd-4')
    expect(pickSession(sessions, 'the codex session')?.id).toBe('bbbb-2')
  })

  it('never returns the caller itself and gives null for strangers', () => {
    expect(pickSession(sessions, 'claude', 'aaaa-1')).toBeNull()
    expect(pickSession(sessions, 'gemini')).toBeNull()
    expect(pickSession(sessions, '')).toBeNull()
  })
})
