import { findOnPath } from '@shared/resolveCommand'
import type { Preset, Prefs } from '@shared/types'
import { builtinPresets } from './registry'

export interface ShellSpec {
  command: string
  args: string[]
}

export function defaultShell(env: NodeJS.ProcessEnv, platform: NodeJS.Platform = process.platform, override?: string): ShellSpec {
  if (override && override.trim()) {
    const cmd = override.trim()
    const base = cmd.split(/[\\/]/).pop()!.toLowerCase()
    if (base === 'pwsh.exe' || base === 'pwsh' || base === 'powershell.exe' || base === 'powershell') return { command: cmd, args: ['-NoLogo'] }
    if (platform !== 'win32' && !base.startsWith('cmd')) return { command: cmd, args: ['-l'] }
    return { command: cmd, args: [] }
  }
  if (platform === 'win32') {
    if (findOnPath('pwsh', env, platform)) return { command: 'pwsh', args: ['-NoLogo'] }
    if (findOnPath('powershell', env, platform)) return { command: 'powershell', args: ['-NoLogo'] }
    return { command: env['ComSpec'] || 'cmd.exe', args: [] }
  }
  const sh = env['SHELL'] || (platform === 'darwin' ? '/bin/zsh' : '/bin/bash')
  return { command: sh, args: ['-l'] }
}

/** Scans PATH for every builtin agent CLI and appends custom presets. Installed first, sorted by usage. */
export function detectPresets(env: NodeJS.ProcessEnv, prefs: Prefs, platform: NodeJS.Platform = process.platform): Preset[] {
  const out: Preset[] = []
  for (const b of builtinPresets) {
    const { binaries, ...rest } = b
    if (b.id === 'shell') {
      const sh = defaultShell(env, platform, prefs.shell)
      out.push({ ...rest, binary: sh.command, installed: true, resolvedPath: findOnPath(sh.command, env, platform) })
      continue
    }
    if (b.id === 'claude' && prefs.claudePath) {
      const resolved = findOnPath(prefs.claudePath, env, platform)
      out.push({ ...rest, binary: prefs.claudePath, installed: !!resolved, resolvedPath: resolved })
      continue
    }
    if (b.id === 'deepseek') {
      // Claude Code again, pointed at DeepSeek: it counts as installed once there is a key to point it with.
      const binary = prefs.claudePath || b.binary
      const resolved = findOnPath(binary, env, platform)
      out.push({ ...rest, binary, installed: !!resolved && !!prefs.deepseekApiKey, resolvedPath: resolved })
      continue
    }
    let resolved: string | undefined
    let binary = b.binary
    for (const name of binaries) {
      resolved = findOnPath(name, env, platform)
      if (resolved) {
        binary = name
        break
      }
    }
    out.push({ ...rest, binary, installed: !!resolved, resolvedPath: resolved })
  }
  for (const c of prefs.customPresets) {
    out.push({
      id: c.id,
      name: c.name,
      color: c.color,
      binary: c.command,
      args: c.args,
      hooks: false,
      installed: !!findOnPath(c.command, env, platform),
      resolvedPath: findOnPath(c.command, env, platform),
      custom: true
    })
  }
  const usage = prefs.presetUsage ?? {}
  const order = new Map(out.map((p, i) => [p.id, i]))
  return out.sort((a, b) => {
    if (a.id === 'shell') return -1
    if (b.id === 'shell') return 1
    if (a.installed !== b.installed) return a.installed ? -1 : 1
    const ua = usage[a.id] ?? 0
    const ub = usage[b.id] ?? 0
    if (ua !== ub) return ub - ua
    return (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)
  })
}
