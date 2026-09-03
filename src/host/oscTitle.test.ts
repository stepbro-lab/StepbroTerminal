import { describe, expect, it } from 'vitest'
import { isBoringTitle, OscTitleParser, stripTitleGlyph } from './oscTitle'

const b = (s: string) => Buffer.from(s)

describe('OscTitleParser', () => {
  it('parses BEL and ST terminated titles', () => {
    const p = new OscTitleParser()
    expect(p.feed(b('hello \x1b]0;My Title\x07 world \x1b]2;Second\x1b\\ end'))).toEqual(['My Title', 'Second'])
  })

  it('handles sequences split across chunks', () => {
    const p = new OscTitleParser()
    expect(p.feed(b('x\x1b]0;Par'))).toEqual([])
    expect(p.feed(b('tial\x07'))).toEqual(['Partial'])
  })

  it('ignores other osc codes', () => {
    const p = new OscTitleParser()
    expect(p.feed(b('\x1b]8;;http://x\x07link\x1b]8;;\x07\x1b]0;ok\x07'))).toEqual(['ok'])
  })
})

describe('isBoringTitle', () => {
  it('flags default shell titles and paths', () => {
    expect(isBoringTitle('Windows PowerShell')).toBe(true)
    expect(isBoringTitle('C:\\Users\\x')).toBe(true)
    expect(isBoringTitle('~/dev')).toBe(true)
    expect(isBoringTitle('kevin@mac: bash')).toBe(true)
    expect(isBoringTitle('')).toBe(true)
    expect(isBoringTitle('✱ Refactor checkout')).toBe(false)
    expect(isBoringTitle('npm run dev')).toBe(false)
  })
})

describe('stripTitleGlyph', () => {
  it('drops a leading spinner glyph but keeps real titles', () => {
    expect(stripTitleGlyph('✳ Claude Code')).toBe('Claude Code')
    expect(stripTitleGlyph('◑ Respuesta simple')).toBe('Respuesta simple')
    expect(stripTitleGlyph('npm run dev')).toBe('npm run dev')
    expect(stripTitleGlyph('C:\\dev')).toBe('C:\\dev')
  })
})
