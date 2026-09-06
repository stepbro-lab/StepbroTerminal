import { describe, expect, it } from 'vitest'
import { imagePaste, imagePathText, newlineSequence } from './agentKeys'

describe('pasting an image', () => {
  it('lets Claude Code read the clipboard itself, with the key its platform listens for', () => {
    expect(imagePaste('claude', 'win32')).toEqual({ kind: 'key', bytes: [0x1b, 0x76] })
    expect(imagePaste('claude', 'darwin')).toEqual({ kind: 'key', bytes: [0x16] })
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
    expect(newlineSequence('claude')).toBe('\\\r')
    expect(newlineSequence('gemini')).toBe('\\\r')
  })

  it('gives Codex a Ctrl+J', () => {
    expect(newlineSequence('codex')).toBe('\n')
  })

  it('leaves shells and unknown programs alone', () => {
    expect(newlineSequence(null)).toBeNull()
    expect(newlineSequence(undefined)).toBeNull()
    expect(newlineSequence('shell')).toBeNull()
    expect(newlineSequence('my-launcher')).toBeNull()
  })
})
