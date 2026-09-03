import { describe, expect, it } from 'vitest'
import type { Session } from '@shared/types'
import { viewLabel } from './viewLabel'

const mk = (title: string, presetId = 'shell', detected?: string): Session =>
  ({ id: title, title, presetId, agent: { detectedPreset: detected }, launch: { command: 'x', args: [], hooks: false } }) as unknown as Session

const names: Record<string, string> = { claude: 'Claude Code', codex: 'Codex', gemini: 'Gemini CLI', shell: 'Shell' }
const name = (id: string): string => names[id] ?? id

describe('viewLabel', () => {
  it('uses the title for a single session and the preset for an untitled one', () => {
    expect(viewLabel([mk('NivoMusic', 'claude')], name)).toEqual({ text: 'NivoMusic', presetIds: ['claude'], count: 1 })
    expect(viewLabel([mk('', 'claude')], name).text).toBe('Claude')
    expect(viewLabel([], name).text).toBe('Empty')
  })

  it('keeps what the titles share instead of chopping them together', () => {
    const v = viewLabel([mk('STEPBRO TERMINAL CLAUDE', 'shell', 'claude'), mk('STEPBRO TERMINAL CODEX', 'shell', 'codex')], name)
    expect(v.text).toBe('STEPBRO TERMINAL')
    expect(v.presetIds).toEqual(['claude', 'codex'])
    expect(v.count).toBe(2)
  })

  it('names the agents when the titles have nothing in common', () => {
    expect(viewLabel([mk('Fix login', 'claude'), mk('Write tests', 'codex')], name).text).toBe('Claude Code · Codex')
  })

  it('falls back to the first title plus a count when even the agents repeat', () => {
    expect(viewLabel([mk('Fix login', 'claude'), mk('Write tests', 'claude')], name).text).toBe('Fix login +1')
  })

  it('clips long names cleanly and caps the logos at three', () => {
    const long = 'A very long session title that goes on and on'
    expect(viewLabel([mk(long, 'claude')], name).text.length).toBeLessThanOrEqual(28)
    expect(viewLabel([mk(long, 'claude')], name).text.endsWith('…')).toBe(true)
    const many = viewLabel([mk('a', 'claude'), mk('b', 'codex'), mk('c', 'gemini'), mk('d', 'shell')], name)
    expect(many.presetIds).toEqual(['claude', 'codex', 'gemini'])
    expect(many.count).toBe(4)
  })
})
