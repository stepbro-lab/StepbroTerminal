import { describe, expect, it } from 'vitest'
import { reduceStatus } from './statusReducer'
import type { SessionStatus } from '@shared/types'

const base = (status: SessionStatus, hooks = true, agent: Record<string, unknown> = {}) => ({
  status,
  launch: { command: 'x', args: [], hooks },
  agent
})

const hook = (name: string, payload: Record<string, unknown> = {}) => ({ kind: 'hook' as const, name, payload })

describe('reduceStatus', () => {
  it('spawned -> starting, exit -> exited', () => {
    expect(reduceStatus(base('idle'), { kind: 'spawned' })).toEqual({ status: 'starting' })
    expect(reduceStatus(base('working'), { kind: 'exit', code: 0 })).toEqual({ status: 'exited' })
  })

  it('SessionStart -> idle with model and session id', () => {
    expect(reduceStatus(base('starting'), hook('SessionStart', { model: 'claude-x', session_id: 's1' }))).toEqual({
      status: 'idle',
      agent: { model: 'claude-x', sessionId: 's1' }
    })
  })

  it('prompt and tool hooks -> working with tool name', () => {
    expect(reduceStatus(base('idle'), hook('UserPromptSubmit', { permission_mode: 'default' }))).toEqual({
      status: 'working',
      agent: { tool: undefined, permissionMode: 'default' }
    })
    expect(reduceStatus(base('working'), hook('PreToolUse', { tool_name: 'Bash' }))).toMatchObject({
      status: 'working',
      agent: { tool: 'Bash' }
    })
  })

  it('attention notifications -> attention, others ignored', () => {
    expect(reduceStatus(base('working'), hook('Notification', { notification_type: 'permission_prompt' }))).toEqual({
      status: 'attention'
    })
    expect(reduceStatus(base('working'), hook('Notification', { notification_type: 'agent_needs_input' }))).toEqual({
      status: 'attention'
    })
    expect(reduceStatus(base('working'), hook('Notification', { notification_type: 'auth_success' }))).toBeNull()
    expect(reduceStatus(base('working'), hook('Notification', { notification_type: 'idle_prompt' }))).toBeNull()
  })

  it('Stop -> done with trimmed last message', () => {
    const r = reduceStatus(base('working'), hook('Stop', { last_assistant_message: '  hello\n\nworld  ' }))
    expect(r).toEqual({ status: 'done', agent: { tool: undefined, lastMessage: 'hello world' } })
  })

  it('StopFailure -> error', () => {
    expect(reduceStatus(base('working'), hook('StopFailure', { error: 'rate_limit' }))).toEqual({
      status: 'error',
      error: 'rate_limit'
    })
  })

  it('PostModelSwitch updates model, SessionEnd -> idle', () => {
    expect(reduceStatus(base('idle'), hook('PostModelSwitch', { to_model: 'claude-y' }))).toEqual({
      agent: { model: 'claude-y' }
    })
    expect(reduceStatus(base('working'), hook('SessionEnd'))).toEqual({ status: 'idle', agent: { tool: undefined } })
  })

  it('viewed turns done into idle only', () => {
    expect(reduceStatus(base('done'), { kind: 'viewed' })).toEqual({ status: 'idle' })
    expect(reduceStatus(base('attention'), { kind: 'viewed' })).toBeNull()
  })

  it('activity drives status only for sessions without hooks or agent id', () => {
    expect(reduceStatus(base('idle', false), { kind: 'output' })).toEqual({ status: 'working' })
    expect(reduceStatus(base('working', false), { kind: 'output' })).toBeNull()
    expect(reduceStatus(base('working', false), { kind: 'quiet' })).toEqual({ status: 'idle' })
    expect(reduceStatus(base('starting', false), { kind: 'quiet' })).toEqual({ status: 'idle' })
    expect(reduceStatus(base('idle', true), { kind: 'output' })).toBeNull()
    expect(reduceStatus(base('working', true), { kind: 'quiet' })).toBeNull()
    expect(reduceStatus(base('idle', true), { kind: 'quiet' })).toBeNull()
    expect(reduceStatus(base('idle', false, { registryPid: 42 }), { kind: 'output' })).toBeNull()
    expect(reduceStatus(base('exited', false), { kind: 'output' })).toBeNull()
  })

  it('registry statuses map to working, attention and done', () => {
    expect(reduceStatus(base('idle', false), { kind: 'registry', status: 'busy' })).toEqual({ status: 'working' })
    expect(reduceStatus(base('working', false), { kind: 'registry', status: 'waiting_input' })).toEqual({
      status: 'attention'
    })
    expect(reduceStatus(base('working', false), { kind: 'registry', status: 'idle' })).toEqual({ status: 'done' })
    expect(reduceStatus(base('idle', false), { kind: 'registry', status: 'idle' })).toBeNull()
  })
})

describe('agents that keep drawing while they wait', () => {
  it('are working while the screen shows a turn running and idle once it does not, whatever they print', () => {
    expect(reduceStatus(base('idle', false), { kind: 'busy', busy: true })).toEqual({ status: 'working' })
    expect(reduceStatus(base('working', false), { kind: 'busy', busy: true })).toBeNull()
    expect(reduceStatus(base('working', false), { kind: 'busy', busy: false })).toEqual({ status: 'idle' })
    expect(reduceStatus(base('starting', false), { kind: 'busy', busy: false })).toEqual({ status: 'idle' })
    expect(reduceStatus(base('idle', false), { kind: 'busy', busy: false })).toBeNull()
  })

  it('leave a question on screen, an exited session and hooked sessions alone', () => {
    expect(reduceStatus(base('attention', false), { kind: 'busy', busy: false })).toBeNull()
    expect(reduceStatus(base('exited', false), { kind: 'busy', busy: true })).toBeNull()
    expect(reduceStatus(base('idle', true), { kind: 'busy', busy: true })).toBeNull()
  })
})

describe('screen questions from agents without hooks', () => {
  const codex = (status: SessionStatus) => base(status, false, { detectedPreset: 'codex' })

  it('turns a permission box on screen into attention and back once it is gone', () => {
    expect(reduceStatus(codex('working'), { kind: 'screen', waiting: true })).toEqual({
      status: 'attention',
      agent: { lastMessage: 'Waiting for your approval' }
    })
    expect(reduceStatus(codex('attention'), { kind: 'screen', waiting: true })).toBeNull()
    expect(reduceStatus(codex('attention'), { kind: 'screen', waiting: false })).toEqual({ status: 'idle' })
    expect(reduceStatus(codex('idle'), { kind: 'screen', waiting: false })).toBeNull()
  })

  it('keeps attention while the box repaints', () => {
    expect(reduceStatus(codex('attention'), { kind: 'output' })).toBeNull()
    expect(reduceStatus(codex('attention'), { kind: 'quiet' })).toBeNull()
  })

  it('leaves sessions with hooks or a registry entry to their own signals', () => {
    expect(reduceStatus(base('working', true), { kind: 'screen', waiting: true })).toBeNull()
    expect(reduceStatus(base('working', false, { registryPid: 12 }), { kind: 'screen', waiting: true })).toBeNull()
  })
})

describe('agents started by hand inside a shell', () => {
  it('lets hooks run the status and ignores output while they arrive', () => {
    const hooked = base('idle', false, { hooked: true, detectedPreset: 'claude' })
    expect(reduceStatus(hooked, { kind: 'output' })).toBeNull()
    expect(reduceStatus({ ...hooked, status: 'working' }, { kind: 'quiet' })).toBeNull()
    expect(reduceStatus(hooked, hook('UserPromptSubmit'))).toEqual({ status: 'working', agent: { tool: undefined } })
    expect(reduceStatus({ ...hooked, status: 'working' }, hook('Stop', { last_assistant_message: 'done' }))).toEqual({
      status: 'done',
      agent: { tool: undefined, lastMessage: 'done' }
    })
  })
})

describe('an agent that has just started or come back', () => {
  // Claude Code never sends SessionStart to HTTP hooks, so nothing says it is ready but its screen.
  it('stops showing as starting once its screen settles, hooks or not', () => {
    expect(reduceStatus(base('starting', true), { kind: 'quiet' })).toEqual({ status: 'idle' })
    expect(reduceStatus(base('starting', false, { hooked: true, detectedPreset: 'claude' }), { kind: 'quiet' })).toEqual({ status: 'idle' })
    expect(reduceStatus(base('starting', true), { kind: 'busy', busy: false })).toEqual({ status: 'idle' })
  })

  it('still lets its hooks decide once it is past starting', () => {
    expect(reduceStatus(base('starting', true), { kind: 'busy', busy: true })).toBeNull()
    expect(reduceStatus(base('starting', true), hook('UserPromptSubmit'))).toEqual({ status: 'working', agent: { tool: undefined } })
    expect(reduceStatus(base('working', true), { kind: 'quiet' })).toBeNull()
    expect(reduceStatus(base('done', true), { kind: 'quiet' })).toBeNull()
  })
})
