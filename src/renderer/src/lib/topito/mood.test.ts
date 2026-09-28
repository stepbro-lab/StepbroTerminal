import { describe, expect, it } from 'vitest'
import type { Session } from '@shared/types'
import { ambientClip, clipForMood, clipForTool, moments, newlyWaiting } from './mood'

function session(over: Partial<Session> & { id: string }): Session {
  return {
    title: '',
    projectPath: 'C:\\dev\\app',
    presetId: 'claude',
    status: 'idle',
    statusAt: 0,
    alive: true,
    archived: false,
    agent: {},
    ...over
  } as unknown as Session
}

const byId = (...list: Session[]): Record<string, Session> => Object.fromEntries(list.map((s) => [s.id, s]))

describe('clipForTool', () => {
  it('types when an agent edits and reads when it reads', () => {
    expect(clipForTool('Edit', 'claude')).toBe('type')
    expect(clipForTool('Write', 'claude')).toBe('type')
    expect(clipForTool('Read', 'claude')).toBe('read')
    expect(clipForTool('Grep', 'claude')).toBe('read')
  })

  it('searches the web, digs through commands, and thinks between tools', () => {
    expect(clipForTool('WebSearch', 'claude')).toBe('search')
    expect(clipForTool('Bash', 'claude')).toBe('dig')
    expect(clipForTool(undefined, 'claude')).toBe('think')
  })

  it('digs for agents that never say which tool they use', () => {
    expect(clipForTool(undefined, 'codex')).toBe('dig')
  })

  it('reads MCP tools by their own name', () => {
    expect(clipForTool('mcp__stepbro__save_note', 'claude')).toBe('note')
    expect(clipForTool('mcp__stepbro__report', 'claude')).toBe('letter')
    expect(clipForTool('mcp__stepbro__wait', 'claude')).toBe('coffee')
    expect(clipForTool('mcp__stepbro__read_screen', 'claude')).toBe('read')
  })
})

describe('ambientClip', () => {
  const quiet = { hostConnecting: false }

  it('sleeps with nothing going on', () => {
    expect(ambientClip({ ...quiet, sessions: [] })).toBe('sleep')
    expect(ambientClip({ ...quiet, sessions: [session({ id: 'a', status: 'idle' })] })).toBe('sleep')
  })

  it('shows what the most recently busy agent is doing', () => {
    const sessions = [session({ id: 'a', status: 'working', statusAt: 1, agent: { tool: 'Read' } }), session({ id: 'b', status: 'working', statusAt: 5, agent: { tool: 'Edit' } })]
    expect(ambientClip({ ...quiet, sessions })).toBe('type')
  })

  it('peeks out when someone is waiting, whatever else is going on', () => {
    const sessions = [session({ id: 'a', status: 'working', agent: { tool: 'Edit' } }), session({ id: 'b', status: 'attention' })]
    expect(ambientClip({ ...quiet, sessions })).toBe('peek')
  })

  it('leaves out archived and closed sessions', () => {
    const sessions = [session({ id: 'a', status: 'attention', archived: true }), session({ id: 'b', status: 'working', alive: false })]
    expect(ambientClip({ ...quiet, sessions })).toBe('sleep')
  })

  it('puts the connection first', () => {
    const sessions = [session({ id: 'a', status: 'attention' })]
    expect(ambientClip({ hostConnecting: true, sessions })).toBe('search')
  })
})

describe('moments', () => {
  it('says nothing on the first look, when every session arrives at once', () => {
    expect(moments({}, byId(session({ id: 'a', status: 'done' })))).toEqual([])
  })

  it('celebrates work that finishes and frets over work that fails', () => {
    const prev = byId(session({ id: 'a', status: 'working' }), session({ id: 'b', status: 'working' }))
    const next = byId(session({ id: 'a', status: 'done' }), session({ id: 'b', status: 'error' }))
    expect(moments(prev, next)).toEqual(['done', 'oops'])
  })

  it('greets a new session and waves off one that closes, is archived or goes away', () => {
    const prev = byId(session({ id: 'a' }), session({ id: 'b' }), session({ id: 'c' }))
    const next = byId(session({ id: 'a', alive: false }), session({ id: 'b', archived: true }), session({ id: 'd' }))
    expect(moments(prev, next).sort()).toEqual(['bye', 'bye', 'bye', 'hello'])
  })

  it('ignores a status that did not change', () => {
    const s = session({ id: 'a', status: 'working' })
    expect(moments(byId(s), byId({ ...s, statusAt: 9 }))).toEqual([])
  })
})

describe('newlyWaiting', () => {
  it('finds the sessions that have only just started waiting', () => {
    const prev = byId(session({ id: 'a', status: 'working' }), session({ id: 'b', status: 'attention' }))
    const next = byId(session({ id: 'a', status: 'attention' }), session({ id: 'b', status: 'attention' }))
    expect(newlyWaiting(prev, next).map((s) => s.id)).toEqual(['a'])
  })
})

describe('clipForMood', () => {
  it('has a clip for every mood an agent can ask for', () => {
    expect(clipForMood('needs_you')).toBe('peek')
    expect(clipForMood('happy')).toBe('love')
    expect(clipForMood('done')).toBe('done')
  })
})
