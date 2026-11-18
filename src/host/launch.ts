import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const HOOK_EVENTS = [
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'Notification',
  'Elicitation',
  'ElicitationResult',
  'Stop',
  'StopFailure',
  'PostModelSwitch',
  'SessionEnd'
] as const

export interface LaunchVars {
  sessionId: string
  hooksSettings: string
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

export function writeMcpConfig(dir: string, sessionId: string, url: string): string {
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${sessionId}.mcp.json`)
  fs.writeFileSync(file, JSON.stringify({ mcpServers: { stepbro: { type: 'http', url } } }, null, 2))
  return file
}

export function writeOpencodeConfig(dir: string, sessionId: string, mcpUrl: string, pluginFile: string, userConfig?: string): string {
  fs.mkdirSync(dir, { recursive: true })
  let base: Record<string, unknown> = {}
  if (userConfig) {
    try {
      const parsed = JSON.parse(fs.readFileSync(userConfig, 'utf8'))
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) base = parsed
    } catch {}
  }
  const plugin = pathToFileURL(pluginFile).href
  const mcp = { ...((base['mcp'] as Record<string, unknown> | undefined) ?? {}), stepbro: { type: 'remote', url: mcpUrl, enabled: true } }
  const plugins = Array.isArray(base['plugin']) ? (base['plugin'] as unknown[]).filter((p) => p !== plugin) : []
  const file = path.join(dir, `${sessionId}.opencode.json`)
  fs.writeFileSync(file, JSON.stringify({ ...base, mcp, plugin: [...plugins, plugin] }, null, 2), { mode: 0o600 })
  return file
}

const OPENCODE_PLUGIN = `// stepbro terminal: reports what OpenCode is doing to the terminal it runs in.
const url = process.env.STEP_HOOK_URL

export const StepbroPlugin = async () => {
  if (!url) return {}
  let current = ''
  let model = ''
  const roles = new Map()
  const lastText = new Map()
  // Sessions with a turn under way: only those are "done" when they go idle. OpenCode reports
  // idle as it opens too, which is not the end of anything.
  const busy = new Set()
  const post = (name, sessionID, extra) =>
    fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(Object.assign({ hook_event_name: name, session_id: sessionID || current || '' }, extra || {}))
    }).catch(() => {})
  const mine = (sessionID) => !sessionID || !current || sessionID === current
  const errorText = (e) => (e && ((e.data && e.data.message) || e.name)) || 'OpenCode reported an error'
  const finished = async (sessionID) => {
    if (!busy.has(sessionID || current)) return
    busy.delete(sessionID || current)
    await post('Stop', sessionID, { last_assistant_message: lastText.get(sessionID) })
  }
  void post('SessionStart', '')
  return {
    'chat.message': async (input) => {
      if (input.sessionID) current = input.sessionID
      busy.add(current)
      const m = input.model && input.model.modelID
      if (m && m !== model) {
        model = m
        void post('PostModelSwitch', current, { to_model: m })
      }
      await post('UserPromptSubmit', current)
    },
    'tool.execute.before': async (input) => {
      if (!mine(input.sessionID)) return
      if (input.tool === 'question') {
        await post('Notification', input.sessionID, { notification_type: 'agent_needs_input', message: 'OpenCode has a question for you' })
        return
      }
      await post('PreToolUse', input.sessionID, { tool_name: input.tool })
    },
    'tool.execute.after': async (input) => {
      if (!mine(input.sessionID)) return
      const args = input.args || {}
      const file = args.filePath || args.file_path
      const name = input.tool === 'edit' ? 'Edit' : input.tool === 'write' ? 'Write' : input.tool
      await post('PostToolUse', input.sessionID, { tool_name: name, tool_input: file ? { file_path: file } : undefined })
    },
    event: async ({ event }) => {
      const p = (event && event.properties) || {}
      switch (event && event.type) {
        case 'session.created':
          if (p.info && !p.info.parentID && p.info.id !== current) {
            current = p.info.id
            await post('SessionStart', current)
          }
          return
        case 'session.status':
          if (!mine(p.sessionID) || !p.status) return
          if (p.status.type === 'busy') {
            busy.add(p.sessionID || current)
            await post('PostToolBatch', p.sessionID)
          } else if (p.status.type === 'idle') await finished(p.sessionID)
          return
        case 'session.idle':
          if (mine(p.sessionID)) await finished(p.sessionID)
          return
        case 'session.error':
          if (mine(p.sessionID)) await post('StopFailure', p.sessionID, { error: errorText(p.error) })
          return
        case 'permission.asked':
        case 'permission.updated':
          if (mine(p.sessionID)) await post('Notification', p.sessionID, { notification_type: 'permission_prompt', message: p.title || p.type || 'OpenCode is waiting on an approval' })
          return
        case 'permission.replied':
          if (mine(p.sessionID)) await post('PostToolBatch', p.sessionID)
          return
        case 'message.updated':
          if (p.info) roles.set(p.info.id, p.info.role)
          return
        case 'message.part.updated':
          if (p.part && p.part.type === 'text' && p.part.text && roles.get(p.part.messageID) === 'assistant') lastText.set(p.part.sessionID, p.part.text)
          return
      }
    },
    dispose: async () => {
      await post('SessionEnd', current)
    }
  }
}
`

export function writeAgentPlugins(binDir: string): string {
  const file = path.join(binDir, 'opencode', 'stepbro.js')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, OPENCODE_PLUGIN)
  return file
}

export interface AgentWrap {
  hooksSettings: string
  mcpConfig: string
  mcpUrl: string
  hookUrl?: string
  opencodeConfig?: string
  claude?: string
  codex?: string
}

export function applyAgentWrap(env: Record<string, string>, w: AgentWrap, binDir: string, platform: NodeJS.Platform = process.platform): void {
  env['STEP_HOOKS_SETTINGS'] = w.hooksSettings
  env['STEP_MCP_CONFIG'] = w.mcpConfig
  env['STEP_MCP_URL'] = w.mcpUrl
  if (w.hookUrl) env['STEP_HOOK_URL'] = w.hookUrl
  if (w.opencodeConfig) env['OPENCODE_CONFIG'] = w.opencodeConfig
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

export function shellArgsWithAgents(file: string, args: string[], w: AgentWrap, platform: NodeJS.Platform = process.platform, env?: Record<string, string>): string[] {
  const base = (file.split(/[\\/]/).pop() ?? '').toLowerCase().replace(/\.exe$/, '')
  if (base === 'powershell' || base === 'pwsh') {
    if (args.some((a) => /^-(c|command|f|file|encodedcommand)$/i.test(a))) return args
    const defs: string[] = [POWERSHELL_CWD]
    if (w.claude) defs.push('function claude { & $env:STEP_REAL_CLAUDE --settings $env:STEP_HOOKS_SETTINGS --mcp-config $env:STEP_MCP_CONFIG @args }')
    if (w.codex) defs.push('function codex { & $env:STEP_REAL_CODEX -c $env:STEP_CODEX_MCP_ARG @args }')
    return [...args, '-NoExit', '-Command', defs.join('; ')]
  }
  if (base === 'cmd' && platform === 'win32') {
    if (args.some((a) => /^\/[kc]$/i.test(a))) return args
    if (env) env['PROMPT'] = '$E]9;9;$P$E\\' + (env['PROMPT'] || '$P$G')
    const macros: string[] = []
    if (w.claude) macros.push('doskey claude="%STEP_REAL_CLAUDE%" --settings "%STEP_HOOKS_SETTINGS%" --mcp-config "%STEP_MCP_CONFIG%" $*')
    if (w.codex) macros.push('doskey codex="%STEP_REAL_CODEX%" -c %STEP_CODEX_MCP_ARG% $*')
    return macros.length ? [...args, '/k', macros.join(' & ')] : args
  }
  return args
}

const POWERSHELL_CWD =
  "$global:__stepPrompt = $function:prompt; function global:prompt { $s = & $global:__stepPrompt; $l = $executionContext.SessionState.Path.CurrentLocation; if ($l.Provider.Name -eq 'FileSystem') { [Console]::Write([char]27 + ']9;9;' + $l.ProviderPath + [char]27 + [char]92) }; $s }"

// Functions beat PATH: macOS's login zsh runs path_helper, which reorders it.
const POSIX_FUNCTIONS = `if [ -n "$STEP_REAL_CLAUDE" ]; then claude() { "$STEP_REAL_CLAUDE" --settings "$STEP_HOOKS_SETTINGS" --mcp-config "$STEP_MCP_CONFIG" "$@"; }; fi
if [ -n "$STEP_REAL_CODEX" ]; then codex() { "$STEP_REAL_CODEX" -c "mcp_servers.stepbro.url=\\"$STEP_MCP_URL\\"" "$@"; }; fi
`

const ZSH_CWD =
  '_step_report_cwd() { printf \'\\e]7;file://%s%s\\a\' "$HOST" "${PWD//\\%/%25}"; }\n' +
  'autoload -Uz add-zsh-hook 2>/dev/null && add-zsh-hook precmd _step_report_cwd\n'
const BASH_CWD =
  '_step_report_cwd() { printf \'\\e]7;file://%s%s\\a\' "$HOSTNAME" "${PWD//\\%/%25}"; }\n' +
  'PROMPT_COMMAND="_step_report_cwd${PROMPT_COMMAND:+;$PROMPT_COMMAND}"\n'
const FISH_CWD =
  'function __step_report_cwd --on-event fish_prompt\n' +
  "    printf '\\e]7;file://%s%s\\a' $hostname (string replace -a '%' '%25' -- $PWD)\n" +
  'end\n'

const ZSH_MARK = '# stepbro terminal:'

export function isStepZdotdir(dir: string): boolean {
  try {
    return fs.readFileSync(path.join(dir, '.zshenv'), 'utf8').startsWith(ZSH_MARK)
  } catch {
    return false
  }
}

function zshFile(name: string, tail = ''): string {
  return `${ZSH_MARK} your own ${name} runs first; this only adds the agent commands.
_step_zdotdir="$ZDOTDIR"
ZDOTDIR="\${STEP_USER_ZDOTDIR:-$HOME}"
# Never this very file again: that would load itself until zsh gave up.
if [ "$ZDOTDIR" != "$_step_zdotdir" ] && [ -f "$ZDOTDIR/${name}" ]; then . "$ZDOTDIR/${name}"; fi
ZDOTDIR="$_step_zdotdir"
unset _step_zdotdir
${tail}`
}

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

  write('zsh/.zshenv', zshFile('.zshenv'))
  write('zsh/.zprofile', zshFile('.zprofile'))
  write('zsh/.zshrc', zshFile('.zshrc', POSIX_FUNCTIONS + ZSH_CWD))
  write('zsh/.zlogin', zshFile('.zlogin'))
  write(
    'bash/rc',
    `# stepbro terminal: what your login bash reads runs first; this only adds the agent commands.
if [ -f /etc/profile ]; then . /etc/profile; fi
for _step_f in "$HOME/.bash_profile" "$HOME/.bash_login" "$HOME/.profile"; do
  if [ -f "$_step_f" ]; then . "$_step_f"; break; fi
done
unset _step_f
${POSIX_FUNCTIONS}${BASH_CWD}`
  )

  write(
    'fish/init.fish',
    `# stepbro terminal: the agent commands for this session.
if set -q STEP_REAL_CLAUDE
    function claude; "$STEP_REAL_CLAUDE" --settings "$STEP_HOOKS_SETTINGS" --mcp-config "$STEP_MCP_CONFIG" $argv; end
end
if set -q STEP_REAL_CODEX
    function codex; "$STEP_REAL_CODEX" -c "mcp_servers.stepbro.url=\\"$STEP_MCP_URL\\"" $argv; end
end
${FISH_CWD}`
  )
}

export function posixShellWithAgents(file: string, args: string[], _w: AgentWrap, env: Record<string, string>, binDir: string): string[] {
  const base = (file.split(/[\\/]/).pop() ?? '').replace(/\.exe$/i, '')
  if (args.some((a) => a === '-c' || a === '--command' || a === '-C')) return args
  if (base === 'zsh') {
    // Launched from another stepbro shell, ZDOTDIR points at our files instead of the user's.
    const inherited = env['ZDOTDIR']
    if (inherited && !isStepZdotdir(inherited)) env['STEP_USER_ZDOTDIR'] = inherited
    else if (env['STEP_USER_ZDOTDIR'] && isStepZdotdir(env['STEP_USER_ZDOTDIR'])) delete env['STEP_USER_ZDOTDIR']
    env['ZDOTDIR'] = path.join(binDir, 'zsh')
    return args
  }
  if (base === 'bash') {
    return ['--rcfile', path.join(binDir, 'bash', 'rc'), '-i', ...args.filter((a) => a !== '-l' && a !== '--login')]
  }
  if (base === 'fish') return [...args, '-C', `source "${path.join(binDir, 'fish', 'init.fish')}"`]
  return args
}

export { resolveCommand, findOnPath, type ResolvedCommand } from '@shared/resolveCommand'

// Inherited from a parent Claude Code, these make agents think they are nested sessions.
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
