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

export function substituteArgs(args: string[], vars: { sessionId: string; hooksSettings: string }): string[] {
  return args.map((a) => a.replace(/\{sessionId\}/g, vars.sessionId).replace(/\{hooksSettings\}/g, vars.hooksSettings))
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

export interface ResolvedCommand {
  file: string
  argsPrefix: string[]
}

const WIN_EXTS = ['.exe', '.cmd', '.bat', '.com']

function isExecutable(file: string): boolean {
  try {
    const st = fs.statSync(file)
    return st.isFile()
  } catch {
    return false
  }
}

/**
 * Resolves a command name to an executable path using PATH. On Windows `.cmd`/`.bat`
 * shims are run through cmd.exe because ConPTY cannot start them directly.
 */
export function resolveCommand(
  command: string,
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform
): ResolvedCommand | null {
  const win = platform === 'win32'
  const wrap = (file: string): ResolvedCommand => {
    if (win && /\.(cmd|bat)$/i.test(file)) {
      return { file: env['ComSpec'] || 'cmd.exe', argsPrefix: ['/d', '/s', '/c', file] }
    }
    return { file, argsPrefix: [] }
  }

  const hasDir = /[\\/]/.test(command)
  if (hasDir || path.isAbsolute(command)) {
    if (isExecutable(command)) return wrap(command)
    if (win) for (const ext of WIN_EXTS) if (isExecutable(command + ext)) return wrap(command + ext)
    return null
  }

  const pathVar = env['PATH'] || env['Path'] || ''
  const dirs = pathVar.split(win ? ';' : ':').filter(Boolean)
  const exts = win ? (/\.[a-z0-9]+$/i.test(command) ? [''] : WIN_EXTS) : ['']
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = path.join(dir, command + ext)
      if (isExecutable(candidate)) return wrap(candidate)
    }
  }
  return null
}

export function ptyEnv(base: NodeJS.ProcessEnv, extra?: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(base)) if (typeof v === 'string') out[k] = v
  delete out['ELECTRON_RUN_AS_NODE']
  delete out['ELECTRON_NO_ATTACH_CONSOLE']
  out['TERM'] = 'xterm-256color'
  out['COLORTERM'] = 'truecolor'
  out['TERM_PROGRAM'] = 'Step'
  if (!out['LANG'] && process.platform !== 'win32') out['LANG'] = 'en_US.UTF-8'
  if (extra) Object.assign(out, extra)
  return out
}
