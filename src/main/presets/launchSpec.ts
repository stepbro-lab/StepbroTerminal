import type { LaunchSpec, Preset, Prefs } from '@shared/types'
import { defaultShell } from './detect'

/** Turns a preset into the command the host will spawn. Placeholders are substituted by the host. */
export function buildLaunchSpec(preset: Preset, prefs: Prefs, env: NodeJS.ProcessEnv, platform: NodeJS.Platform = process.platform): LaunchSpec {
  if (preset.id === 'shell') {
    const sh = defaultShell(env, platform, prefs.shell)
    return { command: sh.command, args: sh.args, hooks: false }
  }
  return {
    command: preset.binary,
    args: [...preset.args],
    resumeArgs: preset.resumeArgs ? [...preset.resumeArgs] : undefined,
    hooks: preset.hooks
  }
}
