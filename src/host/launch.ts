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

/**
 * Shell functions named like the agents, for posix shells. A function wins over anything on
 * PATH, which a shim in a directory cannot promise: macOS's login zsh runs path_helper and puts
 * /usr/local/bin ahead of everything else, and many ~/.zshrc files prepend their own
 * directories, so a `claude` from npm or Homebrew came first and ran without the session's
 * hooks and notes. The functions read the environment at call time, so one file serves every
 * session.
 */
const POSIX_FUNCTIONS = `if [ -n "$STEP_REAL_CLAUDE" ]; then claude() { "$STEP_REAL_CLAUDE" --settings "$STEP_HOOKS_SETTINGS" --mcp-config "$STEP_MCP_CONFIG" "$@"; }; fi
if [ -n "$STEP_REAL_CODEX" ]; then codex() { "$STEP_REAL_CODEX" -c "mcp_servers.stepbro.url=\\"$STEP_MCP_URL\\"" "$@"; }; fi
`

/** zsh reads its files from ZDOTDIR; each of ours runs the user's own file of the same name first. */
function zshFile(name: string, tail = ''): string {
  return `# StepbroTerminal: your own ${name} runs first; this only adds the agent commands.
_step_zdotdir="$ZDOTDIR"
ZDOTDIR="\${STEP_USER_ZDOTDIR:-$HOME}"
if [ -f "$ZDOTDIR/${name}" ]; then . "$ZDOTDIR/${name}"; fi
ZDOTDIR="$_step_zdotdir"
unset _step_zdotdir
${tail}`
}

/** Files the posix shells load: shims on PATH as a fallback, and rc files that define the functions. */
export function writeShims(binDir: string): void {
  fs.mkdirSync(binDir, { recursive: true })
  const write = (name: string, body: string, mode = 0o644): void => {
    const file = path.join(binDir, name)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, body)
    fs.chmodSync(file, mode)
  }
  write(
    'claude',
    '#!/bin/sh\nif [ -z "$STEP_REAL_CLAUDE" ]; then echo "claude: not found" >&2; exit 127; fi\nexec "$STEP_REAL_CLAUDE" --settings "$STEP_HOOKS_SETTINGS" --mcp-config "$STEP_MCP_CONFIG" "$@"\n',
    0o755
  )
  write(
    'codex',
    '#!/bin/sh\nif [ -z "$STEP_REAL_CODEX" ]; then echo "codex: not found" >&2; exit 127; fi\nexec "$STEP_REAL_CODEX" -c "mcp_servers.stepbro.url=\\"$STEP_MCP_URL\\"" "$@"\n',
    0o755
  )
  // zsh: the whole startup sequence, ours wrapping the user's.
  write('zsh/.zshenv', zshFile('.zshenv'))
  write('zsh/.zprofile', zshFile('.zprofile'))
  write('zsh/.zshrc', zshFile('.zshrc', POSIX_FUNCTIONS))
  write('zsh/.zlogin', zshFile('.zlogin'))
  // bash: what a login shell would read, then the functions.
  write(
    'bash/rc',
    `# StepbroTerminal: what your login bash reads runs first; this only adds the agent commands.
if [ -f /etc/profile ]; then . /etc/profile; fi
for _step_f in "$HOME/.bash_profile" "$HOME/.bash_login" "$HOME/.profile"; do
  if [ -f "$_step_f" ]; then . "$_step_f"; break; fi
done
unset _step_f
${POSIX_FUNCTIONS}`
  )
  // fish: its own syntax, run after the normal startup.
  write(
    'fish/init.fish',
    `# StepbroTerminal: the agent commands for this session.
if set -q STEP_REAL_CLAUDE
    function claude; "$STEP_REAL_CLAUDE" --settings "$STEP_HOOKS_SETTINGS" --mcp-config "$STEP_MCP_CONFIG" $argv; end
end
if set -q STEP_REAL_CODEX
    function codex; "$STEP_REAL_CODEX" -c "mcp_servers.stepbro.url=\\"$STEP_MCP_URL\\"" $argv; end
end
`
  )
}

/**
 * Makes a posix shell define the agent functions on startup: zsh through ZDOTDIR, bash through
 * --rcfile, fish through -C. Returns the arguments to use; the environment is changed in place.
 * Shells that already run a command, and shells we do not know, are left with the shims on PATH.
 */
export function posixShellWithAgents(file: string, args: string[], w: AgentWrap, env: Record<string, string>, binDir: string): string[] {
  if (!w.claude && !w.codex) return args
  const base = (file.split(/[\\/]/).pop() ?? '').replace(/\.exe$/i, '')
  if (args.some((a) => a === '-c' || a === '--command' || a === '-C')) return args
  if (base === 'zsh') {
    if (env['ZDOTDIR']) env['STEP_USER_ZDOTDIR'] = env['ZDOTDIR']
    env['ZDOTDIR'] = path.join(binDir, 'zsh')
    return args
  }
  if (base === 'bash') {
    // Our rc file plays the login files itself; bash reads it only for an interactive non-login shell.
    return ['--rcfile', path.join(binDir, 'bash', 'rc'), '-i', ...args.filter((a) => a !== '-l' && a !== '--login')]
  }
  if (base === 'fish') return [...args, '-C', `source "${path.join(binDir, 'fish', 'init.fish')}"`]
  return args
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
