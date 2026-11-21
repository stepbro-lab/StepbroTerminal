import { describe, expect, it } from 'vitest'
import { WIN32_SHIFT_ENTER, altArrowSequence, imagePaste, imagePathText, newlineSequence } from './agentKeys'

describe('pasting an image', () => {
  it('lets Claude Code read the clipboard itself, with the key its platform listens for', () => {
    expect(imagePaste('claude', 'win32')).toEqual({ kind: 'key', bytes: [0x1b, 0x76] })
    expect(imagePaste('claude', 'darwin')).toEqual({ kind: 'key', bytes: [0x16] })
    expect(imagePaste('deepseek', 'darwin')).toEqual({ kind: 'key', bytes: [0x16] })
  })

  it('hands everyone else a file', () => {
    for (const agent of ['codex', 'opencode', 'gemini', 'shell', null, undefined]) expect(imagePaste(agent, 'win32')).toEqual({ kind: 'path' })
  })

  it('pastes the path the way a dropped file would arrive, with an @ for Gemini', () => {
    expect(imagePathText('opencode', 'C:\\t\\image-1.png', 'win32')).toBe('C:\\t\\image-1.png ')
    expect(imagePathText('codex', '/tmp/image-1.png', 'darwin')).toBe('/tmp/image-1.png ')
    expect(imagePathText('gemini', '/tmp/image-1.png', 'linux')).toBe('@/tmp/image-1.png ')
    expect(imagePathText(null, 'C:\\Users\\Ana Ruiz\\image-1.png', 'win32')).toBe('"C:\\Users\\Ana Ruiz\\image-1.png" ')
    expect(imagePathText('opencode', '/Users/ana ruiz/image-1.png', 'darwin')).toBe('/Users/ana\\ ruiz/image-1.png ')
  })
})

describe('newlineSequence', () => {
  it('gives Claude and Gemini a backslash and Enter', () => {
    expect(newlineSequence('claude', 'win32')).toBe('\\\r')
    expect(newlineSequence('gemini', 'darwin')).toBe('\\\r')
  })

  it('gives DeepSeek the same, since it runs Claude Code', () => {
    expect(newlineSequence('deepseek', 'darwin')).toBe('\\\r')
  })

  it('gives Codex a real Shift+Enter on Windows, where ConPTY would turn Ctrl+J into Ctrl+Enter, and Ctrl+J elsewhere', () => {
    expect(newlineSequence('codex', 'win32')).toBe(WIN32_SHIFT_ENTER)
    expect(WIN32_SHIFT_ENTER).toBe('\x1b[13;28;13;1;16;1_')
    expect(newlineSequence('codex', 'darwin')).toBe('\n')
    expect(newlineSequence('codex', 'linux')).toBe('\n')
  })

  it('leaves shells and unknown programs alone', () => {
    expect(newlineSequence(null, 'win32')).toBeNull()
    expect(newlineSequence(undefined, 'win32')).toBeNull()
    expect(newlineSequence('shell', 'win32')).toBeNull()
    expect(newlineSequence('my-launcher', 'linux')).toBeNull()
  })
})

describe('altArrowSequence', () => {
  it('sends Codex the Alt+arrow other terminals send, where xterm.js would send Ctrl+arrow', () => {
    expect(altArrowSequence('codex', 'ArrowUp', 'win32')).toBe('\x1b[1;3A')
    expect(altArrowSequence('codex', 'ArrowDown', 'linux')).toBe('\x1b[1;3B')
  })

  it('leaves macOS, where xterm.js already sends Alt, and every other program to xterm', () => {
    expect(altArrowSequence('codex', 'ArrowUp', 'darwin')).toBeNull()
    expect(altArrowSequence('claude', 'ArrowUp', 'win32')).toBeNull()
    expect(altArrowSequence(null, 'ArrowDown', 'win32')).toBeNull()
  })
})
