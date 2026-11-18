import { describe, expect, it } from 'vitest'
import { instructions } from './mcp'

describe('what agents are told about the stepbro server', () => {
  it('tells them the notes are here, so "anota esto" goes straight to save_note', () => {
    for (const topito of [false, true]) {
      const text = instructions(topito)
      expect(text).toContain('save_note')
      expect(text).toContain('anota')
      expect(text).toContain('do not look for a notes feature in the project')
    }
  })

  it('fits in what Claude Code keeps of it, Topito included, so nothing at the end is cut', () => {
    expect(instructions(true).length).toBeLessThan(4096)
    expect(instructions(true)).toContain('preview_console')
  })

  it('only mentions Topito while he is turned on', () => {
    expect(instructions(false)).not.toContain('Topito')
    expect(instructions(true)).toContain('Topito')
  })
})
