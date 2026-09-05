import { describe, expect, it } from 'vitest'
import { workspaceKeyFromUrl } from './stepUrl'

describe('workspaceKeyFromUrl', () => {
  it('reads the name from a workspace link', () => {
    expect(workspaceKeyFromUrl('step://workspace/demo-stack')).toBe('demo-stack')
    expect(workspaceKeyFromUrl('STEP://Workspace/demo-stack/')).toBe('demo-stack')
  })

  it('decodes and ignores a query string', () => {
    expect(workspaceKeyFromUrl('step://workspace/Demo%20stack?new_window=true')).toBe('Demo stack')
  })

  it('is null for other links and empty names', () => {
    expect(workspaceKeyFromUrl('step://focus/abc')).toBeNull()
    expect(workspaceKeyFromUrl('step://workspace/')).toBeNull()
    expect(workspaceKeyFromUrl('https://example.com')).toBeNull()
  })
})
