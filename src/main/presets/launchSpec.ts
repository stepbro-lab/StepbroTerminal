import type { LaunchSpec, Preset, Prefs } from '@shared/types'
import { defaultShell } from './detect'

const DEEPSEEK_URL = 'https://api.deepseek.com/anthropic'

/**
 * The model a DeepSeek session runs on: V4 Pro unless Flash was picked, or the id typed in for a
 * model of the person's choosing. An "other" left empty falls back to Pro rather than start a
 * session with no model at all.
 */
export function deepseekMainModel(prefs: Prefs): string {
  const custom = prefs.deepseekModelId?.trim()
  if (prefs.deepseekModel === 'custom' && custom) return custom
  return prefs.deepseekModel === 'flash' ? 'deepseek-v4-flash' : 'deepseek-v4-pro'
}

/**
 * The environment DeepSeek documents for Claude Code: its Anthropic-shaped endpoint, the key as
 * the auth token, the chosen model for every tier Claude Code asks for (Flash for sub-agents and
 * the small model either way) and the effort and compaction settings it recommends.
 */
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
    env: preset.id === 'deepseek' ? deepseekEnv(prefs) : undefined,
    hooks: preset.hooks
  }
}
