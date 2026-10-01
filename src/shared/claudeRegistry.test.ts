import { describe, expect, it } from 'vitest'
import { parseRegistryEntry } from './claudeRegistry'

describe('a Claude Code registry entry', () => {
  it('reads what the process is waiting for, and what it needs', () => {
    const e = parseRegistryEntry(JSON.stringify({ pid: 5, sessionId: 's', cwd: '/x', status: 'waiting', waitingFor: 'dialog open', needs: '' }))
    expect(e).toMatchObject({ pid: 5, status: 'waiting', waitingFor: 'dialog open' })
    expect(e?.needs).toBeUndefined()
    expect(parseRegistryEntry(JSON.stringify({ pid: 5, sessionId: 's', cwd: '/x', status: 'waiting', needs: 'choose: allow or deny' }))?.needs).toBe('choose: allow or deny')
  })

  it('leaves out what an older Claude does not write', () => {
    expect(parseRegistryEntry(JSON.stringify({ pid: 5, sessionId: 's', cwd: '/x', status: 'idle' }))).toEqual({
      pid: 5,
      sessionId: 's',
      cwd: '/x',
      name: undefined,
      status: 'idle',
      waitingFor: undefined,
      needs: undefined,
      updatedAt: undefined
    })
  })
})
