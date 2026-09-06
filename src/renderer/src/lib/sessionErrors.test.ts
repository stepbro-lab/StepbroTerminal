import { describe, expect, it } from 'vitest'
import { describeSessionError } from './sessionErrors'

describe('describeSessionError', () => {
  it('names a missing program and says where to fix it', () => {
    const w = describeSessionError('Command not found: codex')
    expect(w.title).toBe('codex is not installed, or not on the PATH')
    expect(w.hint).toContain('Settings > Agents')
  })

  it('explains the Windows codes the host runs into', () => {
    expect(describeSessionError('Failed to start: Cannot create process, error code: 267').hint).toBe('The folder does not exist any more.')
    expect(describeSessionError('Failed to start: Cannot create process, error code: 2').hint).toBe('The program was not found.')
    expect(describeSessionError('Failed to start: spawn EACCES').hint).toMatch(/permissions/)
  })

  it('keeps an unknown reason as the hint', () => {
    const w = describeSessionError('Failed to start: something odd')
    expect(w.title).toBe('The session could not start')
    expect(w.hint).toBe('something odd')
    expect(describeSessionError('weird')).toEqual({ title: 'Something went wrong', hint: 'weird' })
    expect(describeSessionError(undefined)).toEqual({ title: 'Something went wrong', hint: undefined })
  })
})
