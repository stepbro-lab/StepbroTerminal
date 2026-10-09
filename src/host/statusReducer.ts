import type { AgentMeta, Session, SessionStatus } from '@shared/types'

export type HookEvent = { kind: 'hook'; name: string; payload: Record<string, unknown> }

export type ReducerEvent =
  | HookEvent
  | { kind: 'output' }
  | { kind: 'quiet' }
  | { kind: 'exit'; code: number }
  | { kind: 'viewed' }
  | { kind: 'spawned' }
  /** Status reported by Claude Code's live session registry for a claude typed inside a shell, and while waiting, what for. */
  | { kind: 'registry'; status: string; waitingFor?: string; needs?: string }
  /** What the screen of an agent without hooks shows once output settles: a permission question or not. */
  | { kind: 'screen'; waiting: boolean }
  /** For an agent that keeps drawing while it waits, whether its screen shows a turn running. */
  | { kind: 'busy'; busy: boolean }

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

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 200)
}

/** Sessions whose status comes from hooks or the Claude registry ignore what the output looks like. */
function managed(s: Input): boolean {
  return s.launch.hooks || !!s.agent.hooked || !!s.agent.registryPid
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
      if (managed(s)) return null
      // A question on screen stays one while the program repaints; the next quiet look decides.
      if (s.status === 'attention') return null
      return s.status === 'working' ? null : { status: 'working' }
    case 'quiet':
      // Claude Code sends SessionStart to command hooks only, never to HTTP ones like these, so an
      // agent that has just started, or come back after an update, says nothing until its first
      // prompt. Once its screen settles it is waiting for that prompt, hooks or not.
      if (s.status === 'starting') return { status: 'idle' }
      if (managed(s)) return null
      return s.status === 'working' ? { status: 'idle' } : null
    case 'screen':
      if (managed(s) || s.status === 'exited') return null
      if (e.waiting) return s.status === 'attention' ? null : { status: 'attention', agent: { lastMessage: 'Waiting for your approval' } }
      return s.status === 'attention' ? { status: 'idle' } : null
    case 'busy':
      if (s.status === 'starting' && !e.busy) return { status: 'idle' }
      if (managed(s) || s.status === 'exited') return null
      // A question on screen is still one; the look for questions decides when it has gone.
      if (s.status === 'attention') return null
      if (e.busy) return s.status === 'working' ? null : { status: 'working' }
      return s.status === 'working' || s.status === 'starting' ? { status: 'idle' } : null
    case 'registry': {
      const v = e.status.toLowerCase()
      if (v === 'busy' || v === 'working' || v === 'running') return s.status === 'working' ? null : { status: 'working' }
      // A menu the person opened themselves (/model, /config…) is Claude waiting on someone who is
      // already there, not asking for them; only one that says what it needs calls them over.
      const ownMenu = e.waitingFor === 'dialog open' && !e.needs
      if (/wait|input|permission|attention|blocked/.test(v) && !ownMenu) return s.status === 'attention' ? null : { status: 'attention' }
      if (ownMenu && s.status === 'attention') return { status: 'idle' }
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
    case 'Elicitation': {
      // An MCP server asking the person something, like Supabase checking before a destructive
      // query. Claude's own notice for it comes six seconds later and only says it needs input;
      // this one comes with the dialog, and says who asks and what.
      const server = str(p['mcp_server_name'])
      const message = str(p['message'])
      return { status: 'attention', agent: { lastMessage: message ? oneLine(server ? `${server}: ${message}` : message) : undefined } }
    }
    case 'ElicitationResult':
      // Answered: the tool that asked carries on. Asked outside a tool, there is nothing running.
      if (s.status !== 'attention') return { agent: { lastMessage: undefined } }
      return { status: s.agent.tool ? 'working' : 'idle', agent: { lastMessage: undefined } }
    case 'Stop': {
      const last = str(p['last_assistant_message'])
      return {
        status: 'done',
        agent: { tool: undefined, lastMessage: last ? oneLine(last) : undefined }
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
        // The last turn's closing words would read as the question in a notice during this one.
        if (e.name === 'UserPromptSubmit') patch.agent!.lastMessage = undefined
        const mode = str(p['permission_mode'])
        if (mode) patch.agent!.permissionMode = mode
        return patch
      }
      return null
  }
}
