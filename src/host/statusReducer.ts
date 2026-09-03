import type { AgentMeta, Session, SessionStatus } from '@shared/types'

export type HookEvent = { kind: 'hook'; name: string; payload: Record<string, unknown> }

export type ReducerEvent =
  | HookEvent
  | { kind: 'output' }
  | { kind: 'quiet' }
  | { kind: 'exit'; code: number }
  | { kind: 'viewed' }
  | { kind: 'spawned' }
  /** Status reported by Claude Code's live session registry for a claude typed inside a shell. */
  | { kind: 'registry'; status: string }
  /** What the screen of an agent without hooks shows once output settles: a permission question or not. */
  | { kind: 'screen'; waiting: boolean }

export interface StatusPatch {
  status?: SessionStatus
  agent?: Partial<AgentMeta>
  error?: string
}

type Input = Pick<Session, 'status' | 'launch' | 'agent'>

const ATTENTION_TYPES = new Set([
  'permission_prompt',
  'agent_needs_input',
  'elicitation_dialog',
  'elicitation_url_dialog'
])

const WORKING_HOOKS = new Set(['UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolBatch', 'PostToolUseFailure'])

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length ? v : undefined
}

export function reduceStatus(s: Input, e: ReducerEvent): StatusPatch | null {
  switch (e.kind) {
    case 'spawned':
      return { status: 'starting' }
    case 'exit':
      return { status: 'exited' }
    case 'viewed':
      return s.status === 'done' ? { status: 'idle' } : null
    case 'output':
      if (s.status === 'exited') return null
      if (s.launch.hooks || s.agent.registryPid) return null
      // A question on screen stays one while the program repaints; the next quiet look decides.
      if (s.status === 'attention') return null
      return s.status === 'working' ? null : { status: 'working' }
    case 'quiet':
      if (s.launch.hooks || s.agent.registryPid) return null
      return s.status === 'working' || s.status === 'starting' ? { status: 'idle' } : null
    case 'screen':
      if (s.launch.hooks || s.agent.registryPid || s.status === 'exited') return null
      if (e.waiting) return s.status === 'attention' ? null : { status: 'attention', agent: { lastMessage: 'Waiting for your approval' } }
      return s.status === 'attention' ? { status: 'idle' } : null
    case 'registry': {
      const v = e.status.toLowerCase()
      if (v === 'busy' || v === 'working' || v === 'running') return s.status === 'working' ? null : { status: 'working' }
      if (/wait|input|permission|attention|blocked/.test(v)) return s.status === 'attention' ? null : { status: 'attention' }
      if (s.status === 'working') return { status: 'done' }
      return null
    }
    case 'hook':
      return reduceHook(s, e)
  }
}

function reduceHook(s: Input, e: HookEvent): StatusPatch | null {
  const p = e.payload
  switch (e.name) {
    case 'SessionStart': {
      const patch: StatusPatch = { status: 'idle', agent: {} }
      const model = str(p['model'])
      if (model) patch.agent!.model = model
      const sid = str(p['session_id'])
      if (sid) patch.agent!.sessionId = sid
      return patch
    }
    case 'Notification': {
      const type = str(p['notification_type']) ?? ''
      if (ATTENTION_TYPES.has(type)) return { status: 'attention' }
      return null
    }
    case 'PermissionRequest':
      return { status: 'attention' }
    case 'Stop': {
      const last = str(p['last_assistant_message'])
      return {
        status: 'done',
        agent: { tool: undefined, lastMessage: last ? last.replace(/\s+/g, ' ').trim().slice(0, 200) : undefined }
      }
    }
    case 'StopFailure': {
      const reason = str(p['error']) ?? str(p['error_type']) ?? str(p['reason']) ?? 'Turn ended with an API error'
      return { status: 'error', error: reason }
    }
    case 'PostModelSwitch': {
      const to = str(p['to_model'])
      return to ? { agent: { model: to } } : null
    }
    case 'SessionEnd':
      return { status: 'idle', agent: { tool: undefined } }
    default:
      if (WORKING_HOOKS.has(e.name)) {
        const patch: StatusPatch = { status: 'working', agent: {} }
        const tool = str(p['tool_name'])
        patch.agent!.tool = e.name === 'PreToolUse' ? tool : e.name === 'UserPromptSubmit' ? undefined : s.agent.tool
        const mode = str(p['permission_mode'])
        if (mode) patch.agent!.permissionMode = mode
        return patch
      }
      return null
  }
}
