import { describe, expect, it, vi } from 'vitest'
import { OutputPressure } from './OutputPressure'

describe('PTY pressure', () => {
  it('resumes only once all consumers have caught up', () => {
    const pty = { pause: vi.fn(), resume: vi.fn() }
    const flow = new OutputPressure()
    flow.connect(pty)
    flow.set('screen', true)
    flow.set('log', true)
    flow.set('client', true)
    expect(pty.pause).toHaveBeenCalledTimes(1)
    flow.set('client', false)
    flow.set('log', false)
    expect(pty.resume).not.toHaveBeenCalled()
    flow.set('screen', false)
    flow.set('screen', false)
    expect(pty.resume).toHaveBeenCalledTimes(1)
  })

  it('applies outstanding pressure to a replacement PTY and holds it during shutdown', () => {
    const pty = { pause: vi.fn(), resume: vi.fn() }
    const flow = new OutputPressure()
    flow.set('log', true)
    flow.connect(pty)
    expect(pty.pause).toHaveBeenCalledTimes(1)
    flow.set('shutdown', true)
    flow.set('log', false)
    expect(pty.resume).not.toHaveBeenCalled()
    flow.connect()
    flow.set('shutdown', false)
    expect(pty.resume).not.toHaveBeenCalled()
  })
})
