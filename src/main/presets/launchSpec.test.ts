import { describe, expect, it } from 'vitest'
import type { Preset, Prefs } from '@shared/types'
import { buildLaunchSpec, deepseekEnv } from './launchSpec'
import { detectPresets } from './detect'
import { defaultPrefs } from '../prefs'

const prefs = (over: Partial<Prefs> = {}): Prefs => ({ ...defaultPrefs, ...over })

const deepseek: Preset = {
  id: 'deepseek',
  name: 'DeepSeek',
  color: '#4d6bfe',
  binary: 'claude',
  args: ['--session-id', '{sessionId}'],
  resumeArgs: ['--resume', '{sessionId}'],
  hooks: true,
  installed: true
}

describe('DeepSeek through Claude Code', () => {
  it('runs claude with the environment DeepSeek documents, keyed and on the chosen model', () => {
    const spec = buildLaunchSpec(deepseek, prefs({ deepseekApiKey: 'sk-test', deepseekModel: 'flash' }), {}, 'linux')
    expect(spec.command).toBe('claude')
    expect(spec.hooks).toBe(true)
    expect(spec.args).toEqual(['--session-id', '{sessionId}'])
    expect(spec.env).toMatchObject({
      ANTHROPIC_BASE_URL: 'https://api.deepseek.com/anthropic',
      ANTHROPIC_AUTH_TOKEN: 'sk-test',
      ANTHROPIC_MODEL: 'deepseek-v4-flash',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'deepseek-v4-flash',
      CLAUDE_CODE_SUBAGENT_MODEL: 'deepseek-v4-flash'
    })
  })

  it('defaults to Pro for the main and Sonnet-tier models', () => {
    const env = deepseekEnv(prefs({ deepseekApiKey: 'k' }))
    expect(env['ANTHROPIC_MODEL']).toBe('deepseek-v4-pro')
    expect(env['ANTHROPIC_DEFAULT_OPUS_MODEL']).toBe('deepseek-v4-pro')
    expect(env['ANTHROPIC_DEFAULT_SONNET_MODEL']).toBe('deepseek-v4-pro')
  })

  it('runs on a model id of the person\'s choosing, while sub-agents stay on Flash', () => {
    const env = deepseekEnv(prefs({ deepseekApiKey: 'k', deepseekModel: 'custom', deepseekModelId: '  deepseek-v5-preview ' }))
    expect(env['ANTHROPIC_MODEL']).toBe('deepseek-v5-preview')
    expect(env['ANTHROPIC_DEFAULT_OPUS_MODEL']).toBe('deepseek-v5-preview')
    expect(env['ANTHROPIC_DEFAULT_SONNET_MODEL']).toBe('deepseek-v5-preview')
    expect(env['CLAUDE_CODE_SUBAGENT_MODEL']).toBe('deepseek-v4-flash')
  })

  it('falls back to Pro when "other" is picked but no id was typed', () => {
    expect(deepseekEnv(prefs({ deepseekApiKey: 'k', deepseekModel: 'custom' }))['ANTHROPIC_MODEL']).toBe('deepseek-v4-pro')
    expect(deepseekEnv(prefs({ deepseekApiKey: 'k', deepseekModel: 'custom', deepseekModelId: '   ' }))['ANTHROPIC_MODEL']).toBe('deepseek-v4-pro')
  })

  it('ignores a typed id once a named model is picked again', () => {
    expect(deepseekEnv(prefs({ deepseekApiKey: 'k', deepseekModel: 'flash', deepseekModelId: 'deepseek-v5-preview' }))['ANTHROPIC_MODEL']).toBe('deepseek-v4-flash')
  })

  it('leaves other presets without an environment of their own', () => {
    const claude: Preset = { ...deepseek, id: 'claude', name: 'Claude Code' }
    expect(buildLaunchSpec(claude, prefs(), {}, 'linux').env).toBeUndefined()
  })

  it('is installed only when claude is on PATH and a key is set', () => {
    const env = { PATH: '' }
    const without = detectPresets(env, prefs(), 'linux').find((p) => p.id === 'deepseek')!
    expect(without.installed).toBe(false)
    const keyed = detectPresets(env, prefs({ deepseekApiKey: 'k' }), 'linux').find((p) => p.id === 'deepseek')!
    expect(keyed.installed).toBe(false)
    expect(keyed.binary).toBe('claude')
  })
})
