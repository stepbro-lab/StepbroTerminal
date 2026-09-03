import fs from 'node:fs'
import path from 'node:path'

const HOOK_EVENTS = [
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'Notification',
  'Stop',
  'StopFailure',
  'PostModelSwitch',
  'SessionEnd'
] as const

export interface LaunchVars {
  sessionId: string
  hooksSettings: string
  /** Path of the MCP config file for Claude Code, and the bare URL for agents that take one. */
  mcpConfig?: string
  mcpUrl?: string
}

export function substituteArgs(args: string[], vars: LaunchVars): string[] {
  return args.map((a) =>
    a
      .replace(/\{sessionId\}/g, vars.sessionId)
      .replace(/\{hooksSettings\}/g, vars.hooksSettings)
      .replace(/\{mcpConfig\}/g, vars.mcpConfig ?? '')
      .replace(/\{mcpUrl\}/g, vars.mcpUrl ?? '')
  )
}

/** Writes a Claude Code settings file that only adds http hooks pointing at `url`. Returns its path. */
export function writeHooksSettings(dir: string, sessionId: string, url: string): string {
  fs.mkdirSync(dir, { recursive: true })
  const hooks: Record<string, unknown[]> = {}
  for (const ev of HOOK_EVENTS) {
    hooks[ev] = [{ hooks: [{ type: 'http', url, timeout: 5 }] }]
  }
  const file = path.join(dir, `${sessionId}.json`)
  fs.writeFileSync(file, JSON.stringify({ hooks }, null, 2))
  return file
}

/** Writes the file Claude Code takes with --mcp-config: our notes server for this session. */
export function writeMcpConfig(dir: string, sessionId: string, url: string): string {
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${sessionId}.mcp.json`)
  fs.writeFileSync(file, JSON.stringify({ mcpServers: { stepbro: { type: 'http', url } } }, null, 2))
  return file
}

/** What an agent typed inside a shell needs to find its hooks and notes. */
export interface AgentWrap {
  hooksSettings: string
  mcpConfig: string
  mcpUrl: string
  /** The real binaries on PATH, when installed. */
  claude?: string
  codex?: string
}

/** Puts the files and real binaries in the environment; on posix the shim dir goes first on PATH. */
export function applyAgentWrap(env: Record<string, string>, w: AgentWrap, binDir: string, platform: NodeJS.Platform = process.platform): void {
  env['STEP_HOOKS_SETTINGS'] = w.hooksSettings
  env['STEP_MCP_CONFIG'] = w.mcpConfig
  env['STEP_MCP_URL'] = w.mcpUrl
  if (w.claude) env['STEP_REAL_CLAUDE'] = w.claude
  if (w.codex) {
    env['STEP_REAL_CODEX'] = w.codex
    env['STEP_CODEX_MCP_ARG'] = `mcp_servers.stepbro.url=${w.mcpUrl}`
  }
  if (platform !== 'win32') {
    const key = Object.keys(env).find((k) => k.toLowerCase() === 'path') ?? 'PATH'
    env[key] = binDir + path.delimiter + (env[key] ?? '')
  }
}

/**
 * Arguments for a shell so that `claude` and `codex` typed inside it run with the session's
 * hooks and notes: PowerShell gets functions, cmd gets doskey macros, other shells find the
 * shims on PATH. Anything that is not a plain interactive shell is left alone.
 */
export function shellArgsWithAgents(file: string, args: string[], w: AgentWrap, platform: NodeJS.Platform = process.platform): string[] {
  if (!w.claude && !w.codex) return args
  const base = (file.split(/[\\/]/).pop() ?? '').toLowerCase().replace(/\.exe$/, '')
  if (base === 'powershell' || base === 'pwsh') {
    if (args.some((a) => /^-(c|command|f|file|encodedcommand)$/i.test(a))) return args
    const defs: string[] = []
    if (w.claude) defs.push('function claude { & $env:STEP_REAL_CLAUDE --settings $env:STEP_HOOKS_SETTINGS --mcp-config $env:STEP_MCP_CONFIG @args }')
    if (w.codex) defs.push('function codex { & $env:STEP_REAL_CODEX -c $env:STEP_CODEX_MCP_ARG @args }')
    return [...args, '-NoExit', '-Command', defs.join('; ')]
  }
  if (base === 'cmd' && platform === 'win32') {
    if (args.some((a) => /^\/[kc]$/i.test(a))) return args
    const macros: string[] = []
    if (w.claude) macros.push('doskey claude="%STEP_REAL_CLAUDE%" --settings "%STEP_HOOKS_SETTINGS%" --mcp-config "%STEP_MCP_CONFIG%" $*')
    if (w.codex) macros.push('doskey codex="%STEP_REAL_CODEX%" -c %STEP_CODEX_MCP_ARG% $*')
    return [...args, '/k', macros.join(' & ')]
  }
  return args
}

/** Scripts named like the agents for posix shells; each runs the real binary with the session's hooks and notes. */
export function writeShims(binDir: string): void {
  fs.mkdirSync(binDir, { recursive: true })
  const write = (name: string, body: string): void => {
    const file = path.join(binDir, name)
    fs.writeFileSync(file, body)
    fs.chmodSync(file, 0o755)
  }
  write(
    'claude',
    '#!/bin/sh\nif [ -z "$STEP_REAL_CLAUDE" ]; then echo "claude: not found" >&2; exit 127; fi\nexec "$STEP_REAL_CLAUDE" --settings "$STEP_HOOKS_SETTINGS" --mcp-config "$STEP_MCP_CONFIG" "$@"\n'
  )
  write(
    'codex',
    '#!/bin/sh\nif [ -z "$STEP_REAL_CODEX" ]; then echo "codex: not found" >&2; exit 127; fi\nexec "$STEP_REAL_CODEX" -c "mcp_servers.stepbro.url=\\"$STEP_MCP_URL\\"" "$@"\n'
  )
}

export { resolveCommand, findOnPath, type ResolvedCommand } from '@shared/resolveCommand'

/**
 * Markers a running Claude Code session puts in the environment of its children. If Step itself
 * was launched from inside Claude Code, agents started in our shells would otherwise think they
 * are nested child sessions (no registry entry, no transcript).
 */
const NESTED_AGENT_MARKERS = [
  'CLAUDECODE',
  'CLAUDE_CODE_CHILD_SESSION',
  'CLAUDE_CODE_ENTRYPOINT',
  'CLAUDE_CODE_EXECPATH',
  'CLAUDE_CODE_MESSAGING_SOCKET',
  'CLAUDE_CODE_MESSAGING_TOKEN',
  'CLAUDE_CODE_SESSION_ID',
  'CLAUDE_CODE_SSE_PORT',
  'CLAUDE_CODE_BRIDGE_SESSION_ID',
  'CLAUDE_EFFORT',
  'CLAUDE_PID'
]

export function ptyEnv(base: NodeJS.ProcessEnv, extra?: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(base)) if (typeof v === 'string') out[k] = v
  delete out['ELECTRON_RUN_AS_NODE']
  delete out['ELECTRON_NO_ATTACH_CONSOLE']
  for (const k of NESTED_AGENT_MARKERS) delete out[k]
  out['TERM'] = 'xterm-256color'
  out['COLORTERM'] = 'truecolor'
  out['TERM_PROGRAM'] = 'Step'
  if (!out['LANG'] && process.platform !== 'win32') out['LANG'] = 'en_US.UTF-8'
  if (extra) Object.assign(out, extra)
  return out
}
