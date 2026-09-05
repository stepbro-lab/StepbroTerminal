import { describe, expect, it } from 'vitest'
import { AgentBus } from './AgentBus'

describe('AgentBus', () => {
  it('keeps messages in the receiver inbox until they are taken', () => {
    const bus = new AgentBus()
    bus.post('a', 'b', 'patched checkout rounding')
    bus.post('a', 'b', 'tests green')
    expect(bus.pending('b')).toBe(2)
    expect(bus.pending('a')).toBe(0)
    expect(bus.take('b').map((m) => m.text)).toEqual(['patched checkout rounding', 'tests green'])
    expect(bus.pending('b')).toBe(0)
  })

  it('wakes a waiter when a message arrives for it', async () => {
    const bus = new AgentBus()
    const woken = bus.waitFor(['b'], 5000)
    bus.post('a', 'b', 'done')
    expect(await woken).toBe(true)
  })

  it('wakes a waiter when a watched session changes', async () => {
    const bus = new AgentBus()
    const woken = bus.waitFor(['me', 'other'], 5000)
    bus.wake('other')
    expect(await woken).toBe(true)
  })

  it('gives up after the time runs out', async () => {
    const bus = new AgentBus()
    expect(await bus.waitFor(['nobody'], 20)).toBe(false)
  })

  it('remembers who handed work over, so a report can go back without a target', () => {
    const bus = new AgentBus()
    bus.noteSend('orchestrator', 'worker')
    expect(bus.replyTarget('worker')).toBe('orchestrator')
    expect(bus.replyTarget('orchestrator')).toBeUndefined()
  })
})
