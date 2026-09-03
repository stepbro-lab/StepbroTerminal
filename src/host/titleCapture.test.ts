import { describe, expect, it } from 'vitest'
import { detectAgentFromCommand, TitleCapture } from './titleCapture'

const b = (s: string) => Buffer.from(s, 'utf8')

describe('TitleCapture', () => {
  it('returns the first non-empty line once', () => {
    const t = new TitleCapture()
    expect(t.feed(b('\r'))).toBeNull()
    expect(t.feed(b('npm run '))).toBeNull()
    expect(t.feed(b('dev\r'))).toBe('npm run dev')
    expect(t.feed(b('other\r'))).toBeNull()
  })

  it('applies backspace and ignores escape sequences', () => {
    const t = new TitleCapture()
    expect(t.feed(b('claudx\x7fe\x1b[A\x1b[3~\r'))).toBe('claude')
  })

  it('ignores control bytes and osc sequences', () => {
    const t = new TitleCapture()
    expect(t.feed(b('\x1b]0;title\x07ls -la\x03\n'))).toBe('ls -la')
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
    expect(detectAgentFromCommand('npm run dev')).toBeNull()
    expect(detectAgentFromCommand('')).toBeNull()
  })
})
