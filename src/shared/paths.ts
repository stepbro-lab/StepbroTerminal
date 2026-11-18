import os from 'node:os'
import path from 'node:path'

export function stepDir(home = os.homedir()): string {
  return process.env['STEP_HOME'] || path.join(home, '.step')
}

export function hostSocketPath(platform = process.platform, user = safeUser()): string {
  if (platform === 'win32') return `\\\\.\\pipe\\step-host-${user}${pipeSuffix()}`
  return path.join(stepDir(), 'host.sock')
}

export function hostInfoPath(): string {
  return path.join(stepDir(), 'host.json')
}

export function hostLogPath(): string {
  return path.join(stepDir(), 'host.log')
}

export function claudeDir(home = os.homedir()): string {
  return process.env['CLAUDE_CONFIG_DIR'] || path.join(home, '.claude')
}

export function normalizeProjectPath(p: string, platform = process.platform): string {
  let out = platform === 'win32' ? path.win32.normalize(p) : path.posix.normalize(p)
  if (out.length > 1) out = out.replace(/[\\/]+$/, '')
  if (platform === 'win32') {
    out = out.replace(/\//g, '\\')
    if (/^[a-z]:/.test(out)) out = out[0].toUpperCase() + out.slice(1)
  }
  return out
}

export function sameProject(a: string, b: string, platform = process.platform): boolean {
  const na = normalizeProjectPath(a, platform)
  const nb = normalizeProjectPath(b, platform)
  return platform === 'win32' ? na.toLowerCase() === nb.toLowerCase() : na === nb
}

export function encodeClaudeProjectDir(p: string): string {
  return p.replace(/[:\\/]/g, '-')
}

export function projectName(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] || p
}

function pipeSuffix(): string {
  const home = process.env['STEP_HOME']
  return home ? '-' + path.basename(home).replace(/[^a-zA-Z0-9_-]/g, '_') : ''
}

function safeUser(): string {
  try {
    return os.userInfo().username.replace(/[^a-zA-Z0-9_-]/g, '_')
  } catch {
    return 'user'
  }
}
