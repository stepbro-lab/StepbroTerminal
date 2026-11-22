import { describe, expect, it } from 'vitest'
import { detectAgentFromCommand, startsOver, TitleCapture, titleFromLine } from './titleCapture'

const b = (s: string) => Buffer.from(s, 'utf8')

describe('TitleCapture', () => {
  it('returns each submitted non-empty line', () => {
    const t = new TitleCapture()
    expect(t.feed(b('\r'))).toBeNull()
    expect(t.feed(b('npm run '))).toBeNull()
    expect(t.feed(b('dev\r'))).toBe('npm run dev')
    expect(t.feed(b('other\r'))).toBe('other')
  })

  it('applies backspace and ignores escape sequences', () => {
    const t = new TitleCapture()
    expect(t.feed(b('claudx\x7fe\x1b[A\x1b[3~\r'))).toBe('claude')
  })

  it('ignores control bytes and osc sequences', () => {
    const t = new TitleCapture()
    expect(t.feed(b('\x1b]0;title\x07ls -la\x01\n'))).toBe('ls -la')
  })

  it('keeps the key typed after Escape pressed on its own', () => {
    const c = new TitleCapture()
    expect(c.feed(b('\x1b'))).toBeNull()
    expect(c.feed(b('e'))).toBeNull()
    expect(c.feed(b('scribe\r'))).toBe('escribe')
  })

  it('knows when something is typed and not sent yet', () => {
    const t = new TitleCapture()
    expect(t.drafting).toBe(false)
    t.feed(b('half a'))
    expect(t.drafting).toBe(true)
    t.feed(b(' thought\r'))
    expect(t.drafting).toBe(false)
    expect(t.feed(b('one\rtwo'))).toBe('one')
    expect(t.drafting).toBe(true)
  })

  it('forgets a line cleared with Ctrl+C or Ctrl+U, and a word with Ctrl+W or Alt+Backspace', () => {
    const t = new TitleCapture()
    t.feed(b('never mind\x03'))
    expect(t.drafting).toBe(false)
    t.feed(b('scratch that\x15'))
    expect(t.drafting).toBe(false)
    t.feed(b('keep this word'))
    t.feed(b('\x17'))
    t.feed(b('\x1b\x7f'))
    expect(t.feed(b('\r'))).toBe('keep')
  })

  it('truncates long lines', () => {
    const t = new TitleCapture(10)
    expect(t.feed(b('abcdefghijklmnop\r'))).toBe('abcdefghi…')
  })
})

describe('detectAgentFromCommand', () => {
  it('detects known agents by first token', () => {
    expect(detectAgentFromCommand('claude --resume abc')).toBe('claude')
    expect(detectAgentFromCommand('codex')).toBe('codex')
    expect(detectAgentFromCommand('C:\\bin\\gemini.exe -p hi')).toBe('gemini')
    expect(detectAgentFromCommand('cursor-agent')).toBe('cursor')
    expect(detectAgentFromCommand('clyra')).toBe('clyra')
    expect(detectAgentFromCommand('clyra analyze')).toBe('clyra')
    expect(detectAgentFromCommand('npm run dev')).toBeNull()
    expect(detectAgentFromCommand('')).toBeNull()
  })
})

describe('titleFromLine', () => {
  it('names an agent session after its first prompt', () => {
    expect(titleFromLine('fix the login bug', true)).toBe('fix the login bug')
    expect(titleFromLine('arregla el botón de cerrar', true)).toBe('arregla el botón de cerrar')
  })

  it('skips what an agent is typed that is not a prompt', () => {
    expect(titleFromLine('/model', true)).toBeNull()
    expect(titleFromLine('/connect openai', true)).toBeNull()
    expect(titleFromLine('1', true)).toBeNull()
    expect(titleFromLine('y', true)).toBeNull()
    expect(titleFromLine('ok', true)).toBeNull()
    expect(titleFromLine('123', true)).toBeNull()
  })

  it('never takes the command that launched the agent', () => {
    expect(titleFromLine('claude', false)).toBeNull()
    expect(titleFromLine('codex --yolo', false)).toBeNull()
  })

  it('names a shell after its first command, paths and all', () => {
    expect(titleFromLine('npm run dev', false)).toBe('npm run dev')
    expect(titleFromLine('/usr/bin/top', false)).toBe('/usr/bin/top')
  })
})

describe('startsOver', () => {
  it('knows the commands that leave a conversation behind', () => {
    expect(startsOver('/clear')).toBe(true)
    expect(startsOver('/new')).toBe(true)
    expect(startsOver('/resume abc')).toBe(true)
    expect(startsOver('/model')).toBe(false)
    expect(startsOver('/clearly not')).toBe(false)
    expect(startsOver('clear the cache')).toBe(false)
  })
})
