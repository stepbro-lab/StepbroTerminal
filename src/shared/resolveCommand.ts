import fs from 'node:fs'
import path from 'node:path'

export interface ResolvedCommand {
  file: string
  argsPrefix: string[]
}

const WIN_EXTS = ['.exe', '.cmd', '.bat', '.com']

function isFile(file: string): boolean {
  try {
    return fs.statSync(file).isFile()
  } catch {
    return false
  }
}

export function findOnPath(
  command: string,
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform
): string | undefined {
  const win = platform === 'win32'
  if (/[\\/]/.test(command) || path.isAbsolute(command)) {
    if (isFile(command)) return command
    if (win) for (const ext of WIN_EXTS) if (isFile(command + ext)) return command + ext
    return undefined
  }
  const pathVar = env['PATH'] || env['Path'] || ''
  const dirs = pathVar.split(win ? ';' : ':').filter(Boolean)
  const exts = win ? (/\.[a-z0-9]+$/i.test(command) ? [''] : WIN_EXTS) : ['']
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = path.join(dir, command + ext)
      if (isFile(candidate)) return candidate
    }
  }
  return undefined
}

// ConPTY can't start .cmd/.bat shims directly, so they run through cmd.exe.
export function resolveCommand(
  command: string,
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform
): ResolvedCommand | null {
  const file = findOnPath(command, env, platform)
  if (!file) return null
  if (platform === 'win32' && /\.(cmd|bat)$/i.test(file)) {
    return { file: env['ComSpec'] || 'cmd.exe', argsPrefix: ['/d', '/s', '/c', file] }
  }
  return { file, argsPrefix: [] }
}
