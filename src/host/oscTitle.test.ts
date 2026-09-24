import { describe, expect, it } from 'vitest'
import { isBoringTitle, isOwnNameTitle, namesOf, OscTitleParser, stripTitleGlyph, withoutFolder } from './oscTitle'

const b = (s: string) => Buffer.from(s)

describe('isOwnNameTitle', () => {
  it('sees through an agent naming itself, in any spelling', () => {
    expect(isOwnNameTitle('OpenCode', 'opencode', 'StepTerminal')).toBe(true)
    expect(isOwnNameTitle('open-code', 'opencode', 'StepTerminal')).toBe(true)
    expect(isOwnNameTitle('Gemini CLI', 'gemini', 'x')).toBe(true)
    expect(isOwnNameTitle('Claude Code', 'claude', 'x')).toBe(true)
    expect(isOwnNameTitle('', 'codex', 'x')).toBe(true)
  })

  it('sees through the folder name Codex uses as its title', () => {
    expect(isOwnNameTitle('StepTerminal', 'codex', 'StepTerminal')).toBe(true)
    expect(isOwnNameTitle('step-terminal', 'codex', 'Step Terminal')).toBe(true)
  })

  it('sees through the name of what a preset of your own runs', () => {
    const names = namesOf('clyradirect', '/opt/homebrew/bin/npx', ['-y', 'clyra-cli@0.1.0-beta.18'])
    expect(isOwnNameTitle('Clyra', names, 'x')).toBe(true)
    expect(isOwnNameTitle('Fix the login redirect', names, 'x')).toBe(false)
    expect(isOwnNameTitle('Claude Code', namesOf('mine', 'C:\\bin\\claude.exe'), 'x')).toBe(true)
  })

  it('keeps a title that says something', () => {
    expect(isOwnNameTitle('Fix the login redirect', 'claude', 'StepTerminal')).toBe(false)
    expect(isOwnNameTitle('Codex: reviewing tests', 'codex', 'StepTerminal')).toBe(false)
  })
})

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

describe('Codex titles', () => {
  it('drop the spinner turning inside them, so a frame of it does not rename the session', () => {
    expect(stripTitleGlyph('Fix the player \u2838 | NivoMusic')).toBe('Fix the player | NivoMusic')
    expect(stripTitleGlyph('Fix the player \u2807 | NivoMusic')).toBe(stripTitleGlyph('Fix the player \u280b | NivoMusic'))
  })

  it('leave out the folder they add, and count the placeholder while it names the thread as no title', () => {
    expect(withoutFolder('Fix the player | NivoMusic', 'NivoMusic')).toBe('Fix the player')
    expect(withoutFolder('Fix the player | nivomusic', 'NivoMusic')).toBe('Fix the player')
    expect(withoutFolder('A | B', 'NivoMusic')).toBe('A | B')
    expect(isOwnNameTitle(withoutFolder(stripTitleGlyph('renaming... \u2838 | NivoMusic'), 'NivoMusic'), 'codex', 'NivoMusic')).toBe(true)
    expect(isOwnNameTitle('renaming\u2026', 'codex', 'NivoMusic')).toBe(true)
  })
})

describe('stripTitleGlyph', () => {
  it('drops a leading spinner glyph but keeps real titles', () => {
    expect(stripTitleGlyph('✳ Claude Code')).toBe('Claude Code')
    expect(stripTitleGlyph('◑ Respuesta simple')).toBe('Respuesta simple')
    expect(stripTitleGlyph('OC | Saludo de prueba')).toBe('Saludo de prueba')
    expect(stripTitleGlyph('npm run dev')).toBe('npm run dev')
    expect(stripTitleGlyph('C:\\dev')).toBe('C:\\dev')
  })
})

describe('namesOf', () => {
  it('names the package a runner starts, and never a prompt passed along', () => {
    expect(namesOf('x', 'npx', ['-y', '@scope/some-agent@2'])).toEqual(['x', 'npx', 'some-agent'])
    expect(namesOf('x', 'pnpm', ['dlx', 'clyra-cli'])).toEqual(['x', 'pnpm', 'clyra-cli'])
    expect(namesOf('x', 'claude', ['fix the bug'])).toEqual(['x', 'claude'])
    expect(namesOf('x', 'npx', ['fix the bug'])).toEqual(['x', 'npx'])
  })
})
