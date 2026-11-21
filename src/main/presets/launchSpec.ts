import type { LaunchSpec, Preset, Prefs } from '@shared/types'
import { defaultShell } from './detect'
import { FULL_ACCESS_FLAGS } from './registry'

const DEEPSEEK_URL = 'https://api.deepseek.com/anthropic'

export function deepseekMainModel(prefs: Prefs): string {
  const custom = prefs.deepseekModelId?.trim()
  if (prefs.deepseekModel === 'custom' && custom) return custom
  return prefs.deepseekModel === 'flash' ? 'deepseek-v4-flash' : 'deepseek-v4-pro'
}

export function deepseekEnv(prefs: Prefs): Record<string, string> {
  const main = deepseekMainModel(prefs)
  return {
    ANTHROPIC_BASE_URL: DEEPSEEK_URL,
    ANTHROPIC_AUTH_TOKEN: prefs.deepseekApiKey ?? '',
    ANTHROPIC_MODEL: main,
    ANTHROPIC_DEFAULT_OPUS_MODEL: main,
    ANTHROPIC_DEFAULT_SONNET_MODEL: main,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: 'deepseek-v4-flash',
    CLAUDE_CODE_SUBAGENT_MODEL: 'deepseek-v4-flash',
    CLAUDE_CODE_EFFORT_LEVEL: 'max',
    CLAUDE_CODE_AUTO_COMPACT_WINDOW: '786432'
  }
}

export function buildLaunchSpec(preset: Preset, prefs: Prefs, env: NodeJS.ProcessEnv, platform: NodeJS.Platform = process.platform): LaunchSpec {
  if (preset.id === 'shell') {
    const sh = defaultShell(env, platform, prefs.shell)
    return { command: sh.command, args: sh.args, hooks: false }
  }
  const flag = prefs.fullAccess === false || preset.custom ? undefined : FULL_ACCESS_FLAGS[preset.id]
  const lead = flag ? [flag] : []
  return {
    command: preset.binary,
    args: [...lead, ...preset.args],
    resumeArgs: preset.resumeArgs ? [...lead, ...preset.resumeArgs] : undefined,
    env: preset.id === 'deepseek' ? deepseekEnv(prefs) : undefined,
    hooks: preset.hooks
  }
}
