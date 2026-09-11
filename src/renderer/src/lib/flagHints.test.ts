import { describe, expect, it } from 'vitest'
import { InputLine, hintFor } from './flagHints'

describe('InputLine', () => {
  it('collects printable input and handles backspace', () => {
    const l = new InputLine()
    l.feed('cla')
    l.feed('ude')
    expect(l.text).toBe('claude')
    l.feed('\x7f')
    expect(l.text).toBe('claud')
    l.feed('\b')
    expect(l.text).toBe('clau')
    expect(l.known).toBe(true)
  })

  it('starts a fresh line on enter and ctrl+c', () => {
    for (const key of ['\r', '\n', '\x03']) {
      const l = new InputLine()
      l.feed('claude')
      l.feed(key)
      expect(l.text).toBe('')
      expect(l.known).toBe(true)
    }
  })

  it('gives up until the next line when the shell may have edited it', () => {
    for (const key of ['\t', '\x1b[A', '\x1b[D', '\x17', '\x01', '\x15']) {
      const l = new InputLine()
      l.feed('cla')
      l.feed(key)
      expect(l.known).toBe(false)
      l.feed('ude')
      expect(l.known).toBe(false)
      l.feed('\r')
      expect(l.known).toBe(true)
      expect(l.text).toBe('')
    }
  })

  it('treats pasted text as typed text', () => {
    const l = new InputLine()
    l.feed('claude --dang')
    expect(l.text).toBe('claude --dang')
    l.reset()
    l.feed('\x1b[200~claude\x1b[201~')
    expect(l.text).toBe('claude')
    expect(l.known).toBe(true)
  })

  it('ignores the replies xterm sends to terminal queries', () => {
    const l = new InputLine()
    l.feed('cla')
    for (const reply of ['\x1b[?1;2c', '\x1b[>0;276;0c', '\x1b[24;80R', '\x1b[0n', '\x1b[I', '\x1b[O', '\x1b]11;rgb:1c1c/1b1b/1b1b\x1b\\', '\x1b]10;rgb:e5e5/e2e2/e1e1\x07']) {
      l.feed(reply)
    }
    expect(l.text).toBe('cla')
    expect(l.known).toBe(true)
  })
})

describe('hintFor', () => {
  it('suggests the skip-permissions flag right after the agent name', () => {
    expect(hintFor('claude')).toBe(' --dangerously-skip-permissions')
    expect(hintFor('  claude')).toBe(' --dangerously-skip-permissions')
    expect(hintFor('claude ')).toBe('--dangerously-skip-permissions')
  })

  it('completes a partially typed flag', () => {
    expect(hintFor('claude --dang')).toBe('erously-skip-permissions')
    expect(hintFor('claude -')).toBe('-dangerously-skip-permissions')
  })

  it('stays quiet for other commands, other arguments and a finished flag', () => {
    expect(hintFor('')).toBeNull()
    expect(hintFor('claudex')).toBeNull()
    expect(hintFor('ls')).toBeNull()
    expect(hintFor('claude -r')).toBeNull()
    expect(hintFor('claude --dangerously-skip-permissions')).toBeNull()
    expect(hintFor('claude --dangerously-skip-permissions ')).toBeNull()
    expect(hintFor('claude foo bar')).toBeNull()
    expect(hintFor('echo claude')).toBeNull()
  })

  it('knows codex, gemini and opencode too', () => {
    expect(hintFor('codex')).toBe(' --dangerously-bypass-approvals-and-sandbox')
    expect(hintFor('gemini ')).toBe('--yolo')
    expect(hintFor('opencode')).toBe(' --auto')
    expect(hintFor('clyra')).toBe(' --auto')
    expect(hintFor('codewhale')).toBe(' --yolo')
  })
})
