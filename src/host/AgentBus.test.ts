import { describe, expect, it, vi } from 'vitest'
import type { AgentMessage, Session } from '@shared/types'
import { AgentBus } from './AgentBus'

function session(id: string, over: Partial<Session> = {}): Session {
  return { id, title: id, presetId: 'claude', alive: true, status: 'idle', statusAt: 0, agent: {}, ...over } as Session
}

function bus(sessions: Record<string, Session>, deliver = vi.fn()) {
  const b = new AgentBus({ session: (id) => sessions[id], deliver })
  return { b, deliver }
}

describe('AgentBus', () => {
  it('keeps messages in the receiver inbox until they are taken', () => {
    const { b } = bus({})
    b.post('a', 'b', 'patched checkout rounding')
    b.post('a', 'b', 'tests green')
    expect(b.pending('b')).toBe(2)
    expect(b.pending('a')).toBe(0)
    expect(b.take('b').map((m) => m.text)).toEqual(['patched checkout rounding', 'tests green'])
    expect(b.pending('b')).toBe(0)
  })

  it('wakes a waiter when a message arrives for it', async () => {
    const { b } = bus({})
    const woken = b.waitFor(['b'], 5000)
    b.post('a', 'b', 'done')
    expect(await woken).toBe(true)
  })

  it('wakes a waiter when a watched session changes', async () => {
    const { b } = bus({})
    const woken = b.waitFor(['me', 'other'], 5000)
    b.wake('other')
    expect(await woken).toBe(true)
  })

  it('gives up after the time runs out', async () => {
    const { b } = bus({})
    expect(await b.waitFor(['nobody'], 20)).toBe(false)
  })

  it('remembers who handed work over, so a report can go back without a target', () => {
    const { b } = bus({})
    b.noteSend('orchestrator', 'worker')
    expect(b.replyTarget('worker')).toBe('orchestrator')
    expect(b.replyTarget('orchestrator')).toBeUndefined()
  })

  describe('delivery into a free agent', () => {
    it('types a message straight into an idle agent and remembers the sender as its reply target', () => {
      const { b, deliver } = bus({ claude: session('claude') })
      b.post('codex', 'claude', 'patched, 14 tests green')
      expect(deliver).toHaveBeenCalledTimes(1)
      const [to, messages] = deliver.mock.calls[0] as [string, AgentMessage[]]
      expect(to).toBe('claude')
      expect(messages.map((m) => m.text)).toEqual(['patched, 14 tests green'])
      expect(b.pending('claude')).toBe(0)
      expect(b.replyTarget('claude')).toBe('codex')
    })

    it('holds a message for a working agent and types it once the agent is free', () => {
      const sessions = { claude: session('claude', { status: 'working' }) }
      const { b, deliver } = bus(sessions)
      b.post('codex', 'claude', 'done')
      expect(deliver).not.toHaveBeenCalled()
      expect(b.pending('claude')).toBe(1)
      sessions.claude = session('claude', { status: 'idle' })
      b.tryDeliver('claude')
      expect(deliver).toHaveBeenCalledTimes(1)
      expect(b.pending('claude')).toBe(0)
    })

    it('never types into an agent that is asking a person something', () => {
      const { b, deliver } = bus({ claude: session('claude', { status: 'attention' }) })
      b.post('codex', 'claude', 'done')
      expect(deliver).not.toHaveBeenCalled()
      expect(b.pending('claude')).toBe(1)
    })

    it('leaves the inbox alone while the agent is inside wait', () => {
      const { b, deliver } = bus({ claude: session('claude') })
      b.setWaiting('claude', true)
      b.post('codex', 'claude', 'done')
      expect(deliver).not.toHaveBeenCalled()
      expect(b.take('claude')).toHaveLength(1)
    })

    it('types what is still pending when the wait ends without taking it', () => {
      const { b, deliver } = bus({ claude: session('claude') })
      b.setWaiting('claude', true)
      b.post('codex', 'claude', 'done')
      b.setWaiting('claude', false)
      expect(deliver).toHaveBeenCalledTimes(1)
    })

    it('never types into a plain shell', () => {
      const { b, deliver } = bus({ sh: session('sh', { presetId: 'shell' }) })
      b.post('claude', 'sh', 'hello')
      expect(deliver).not.toHaveBeenCalled()
      expect(b.pending('sh')).toBe(1)
    })

    it('waits a moment after work was just typed into the agent', async () => {
      vi.useFakeTimers()
      try {
        const { b, deliver } = bus({ claude: session('claude') })
        b.noteSend('orchestrator', 'claude')
        b.post('codex', 'claude', 'done')
        expect(deliver).not.toHaveBeenCalled()
        vi.advanceTimersByTime(1600)
        expect(deliver).toHaveBeenCalledTimes(1)
      } finally {
        vi.useRealTimers()
      }
    })
  })
})
