import { describe, expect, it } from 'vitest'
import type { LaunchConfig } from '@shared/types'
import { layoutFor, openablePanes, paneTitle } from './launchConfigs'

describe('layoutFor', () => {
  it('is a single leaf for one pane', () => {
    expect(layoutFor(['a'], 'row')).toEqual({ kind: 'leaf', id: 'a' })
  })

  it('nests panes in one direction with even shares', () => {
    expect(layoutFor(['a', 'b', 'c'], 'row')).toEqual({
      kind: 'split',
      dir: 'row',
      ratio: 1 / 3,
      a: { kind: 'leaf', id: 'a' },
      b: { kind: 'split', dir: 'row', ratio: 1 / 2, a: { kind: 'leaf', id: 'b' }, b: { kind: 'leaf', id: 'c' } }
    })
  })

  it('stacks when asked', () => {
    const l = layoutFor(['a', 'b'], 'column')
    expect(l.kind === 'split' && l.dir).toBe('column')
  })
})

const cfg = (name: string, panes: Array<{ cwd: string }>): LaunchConfig => ({
  id: 'x',
  name,
  split: 'row',
  panes: panes.map((p) => ({ cwd: p.cwd, presetId: 'shell' }))
})

describe('paneTitle', () => {
  it('names a pane after the workspace and its folder, on either slash', () => {
    const c = cfg('LinttedGate', [{ cwd: 'C:\\Users\\me\\frontend_lintted_gate' }, { cwd: '/home/me/backend/' }])
    expect(paneTitle(c, c.panes[0])).toBe('LinttedGate · frontend_lintted_gate')
    expect(paneTitle(c, c.panes[1])).toBe('LinttedGate · backend')
  })

  it('falls back when the name is blank', () => {
    const c = cfg('   ', [{ cwd: '/srv/app' }])
    expect(paneTitle(c, c.panes[0])).toBe('Workspace · app')
  })
})

describe('openablePanes', () => {
  it('keeps only panes with a folder', () => {
    const c = cfg('W', [{ cwd: '/a' }, { cwd: '  ' }, { cwd: '' }])
    expect(openablePanes(c).map((p) => p.cwd)).toEqual(['/a'])
  })
})
