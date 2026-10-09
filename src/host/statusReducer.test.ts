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

describe('Claude waiting in its registry', () => {
  // What Claude Code 2.1 writes to ~/.claude/sessions/<pid>.json while it waits.
  const waiting = (waitingFor?: string, needs?: string) => ({ kind: 'registry' as const, status: 'waiting', waitingFor, needs })

  it('calls the person over for a question: a permission, input, a sandbox request', () => {
    for (const w of ['permission prompt', 'input needed', 'sandbox request', 'goal proposal', undefined]) {
      expect(reduceStatus(base('working', false, { registryPid: 7 }), waiting(w))).toEqual({ status: 'attention' })
    }
  })

  it('does not for a menu they opened themselves, like /model or /config', () => {
    expect(reduceStatus(base('idle', false, { registryPid: 7 }), waiting('dialog open'))).toBeNull()
    expect(reduceStatus(base('done', false, { registryPid: 7 }), waiting('dialog open'))).toBeNull()
    // Closing a real question into a menu of their own clears the call.
    expect(reduceStatus(base('attention', false, { registryPid: 7 }), waiting('dialog open'))).toEqual({ status: 'idle' })
  })

  it('still does for a dialog that says what it needs', () => {
    expect(reduceStatus(base('idle', false, { registryPid: 7 }), waiting('dialog open', 'acknowledge the billing notice'))).toEqual({ status: 'attention' })
  })
})

describe('an MCP server asking the person something', () => {
  // What Claude Code 2.1 sends its hooks when a server like Supabase asks before a destructive query.
  const asked = {
    mcp_server_name: 'supabase',
    message: 'This SQL includes destructive operations (DROP, DELETE, TRUNCATE or UPDATE without WHERE).\nIt may permanently remove data.',
    mode: 'form'
  }

  it('calls the person over the moment the dialog opens, saying who asks and what', () => {
    expect(reduceStatus(base('working', false, { tool: 'mcp__supabase__apply_migration' }), hook('Elicitation', asked))).toEqual({
      status: 'attention',
      agent: { lastMessage: 'supabase: This SQL includes destructive operations (DROP, DELETE, TRUNCATE or UPDATE without WHERE). It may permanently remove data.' }
    })
    expect(reduceStatus(base('working'), hook('Elicitation', { message: 'Open the link to sign in' }))).toEqual({
      status: 'attention',
      agent: { lastMessage: 'Open the link to sign in' }
    })
    expect(reduceStatus(base('working'), hook('Elicitation', {}))).toEqual({ status: 'attention', agent: { lastMessage: undefined } })
  })

  it('goes back to the tool that asked once answered, and forgets the question', () => {
    const answered = hook('ElicitationResult', { mcp_server_name: 'supabase', action: 'accept' })
    expect(reduceStatus(base('attention', false, { tool: 'mcp__supabase__apply_migration', lastMessage: 'supabase: …' }), answered)).toEqual({
      status: 'working',
      agent: { lastMessage: undefined }
    })
    // Asked outside a turn, nothing is running once it is answered.
    expect(reduceStatus(base('attention', false, { lastMessage: 'supabase: …' }), answered)).toEqual({ status: 'idle', agent: { lastMessage: undefined } })
    expect(reduceStatus(base('working', false, { tool: 'x' }), answered)).toEqual({ agent: { lastMessage: undefined } })
  })

  it("does not let the last turn's closing words pass for a question in the next one", () => {
    const r = reduceStatus(base('done', false, { lastMessage: 'All tests pass' }), hook('UserPromptSubmit'))
    expect(r?.agent).toHaveProperty('lastMessage', undefined)
  })
})
