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

import { findWorkspace, slugOf, workspaceUrl } from './launchConfigs'

describe('slugOf', () => {
  it('lower-cases, joins words with dashes and drops the rest', () => {
    expect(slugOf('Demo stack')).toBe('demo-stack')
    expect(slugOf('  Frontend + Backend!  ')).toBe('frontend-backend')
    expect(slugOf('Café Ünïcode')).toBe('cafe-unicode')
  })
})

describe('workspaceUrl and findWorkspace', () => {
  const a = cfg('Demo stack', [{ cwd: '/a' }])
  const b = { ...cfg('Frontend + Backend', [{ cwd: '/b' }]), id: 'wsb' }

  it('links by slug and falls back to the id for a nameless workspace', () => {
    expect(workspaceUrl(a)).toBe('step://workspace/demo-stack')
    expect(workspaceUrl({ ...a, name: '' })).toBe('step://workspace/x')
  })

  it('finds by id, by slug, or by a loosely typed name', () => {
    expect(findWorkspace([a, b], 'wsb')).toBe(b)
    expect(findWorkspace([a, b], 'demo-stack')).toBe(a)
    expect(findWorkspace([a, b], 'Demo Stack')).toBe(a)
    expect(findWorkspace([a, b], 'frontend_backend')).toBe(b)
    expect(findWorkspace([a, b], 'nope')).toBeUndefined()
  })
})
