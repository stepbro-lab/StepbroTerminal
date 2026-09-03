import { describe, expect, it } from 'vitest'
import { newlineSequence } from './agentKeys'

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
