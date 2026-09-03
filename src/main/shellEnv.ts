import { execFile } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'

const EXTRA_UNIX = ['/opt/homebrew/bin', '/usr/local/bin', path.join(os.homedir(), '.local/bin'), path.join(os.homedir(), '.npm-global/bin')]

/**
 * GUI apps on macOS and Linux start with a minimal PATH. Ask the login shell for its
 * environment once and merge PATH so agent CLIs installed via brew, npm or ~/.local are found.
 */
export async function shellEnv(): Promise<NodeJS.ProcessEnv> {
  const base: NodeJS.ProcessEnv = { ...process.env }
  if (process.platform === 'win32') {
    const extra = [path.join(os.homedir(), '.local', 'bin'), path.join(process.env['APPDATA'] ?? '', 'npm')].filter(Boolean)
    base['PATH'] = addToPath(base['PATH'] ?? base['Path'] ?? '', extra, ';')
    delete base['Path']
    return base
  }
  const shell = process.env['SHELL'] || '/bin/bash'
  const vars = await new Promise<Record<string, string>>((resolve) => {
    execFile(shell, ['-ilc', 'env'], { timeout: 5000, maxBuffer: 1024 * 1024 }, (err, stdout) => {
      if (err) return resolve({})
      const out: Record<string, string> = {}
      for (const line of stdout.split('\n')) {
        const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
        if (m) out[m[1]] = m[2]
      }
      resolve(out)
    })
  })
  const merged: NodeJS.ProcessEnv = { ...vars, ...base }
  merged['PATH'] = addToPath(vars['PATH'] || base['PATH'] || '', EXTRA_UNIX, ':')
  return merged
}

function addToPath(current: string, extra: string[], sep: string): string {
  const parts = current.split(sep).filter(Boolean)
  const seen = new Set(parts.map((p) => p.toLowerCase()))
  for (const e of extra) {
    if (e && !seen.has(e.toLowerCase())) {
      parts.push(e)
      seen.add(e.toLowerCase())
    }
  }
  return parts.join(sep)
}
