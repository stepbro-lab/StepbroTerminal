import { describe, expect, it, vi } from 'vitest'
import type { Session } from '@shared/types'
import type { SidebarProject, SidebarSession } from './sidebarModel'
import { railProject, railStatus, topRightLeaf } from './rail'

vi.stubGlobal('window', { step: { platform: 'win32' } })

const session = (id: string, over: Partial<Session> = {}): Session =>
  ({ id, projectPath: 'C:\\p', presetId: 'claude', title: id, titleSource: 'none', pinned: false, order: 0, createdAt: 0, updatedAt: 0, status: 'idle', statusAt: 0, alive: true, cols: 80, rows: 24, agent: {}, launch: { command: 'claude', args: [], hooks: true }, ...over }) as Session

const row = (id: string, over: Partial<Session> = {}): SidebarSession => {
  const s = session(id, over)
  return { key: id, id, title: id, status: s.status, presetId: s.presetId, pinned: false, lastAt: 0, view: null, session: s }
}

const project = (path: string, sessions: SidebarSession[]): SidebarProject => ({ path, name: path, sessions, archived: [], collapsed: false, lastAt: 0 })

describe('railProject', () => {
  const model = [project('C:\\a', []), project('C:\\b', [row('one')]), project('C:\\c', [row('two')])]

  it('follows the session in front over the folder the sidebar selected', () => {
    expect(railProject(model, 'C:\\b', 'two')?.path).toBe('C:\\c')
  })

  it('falls back to the selected folder, matched the way Windows reads paths', () => {
    expect(railProject(model, 'c:\\B\\', null)?.path).toBe('C:\\b')
  })

  it('otherwise takes the first folder with a session, and null when there is none', () => {
    expect(railProject(model, null, null)?.path).toBe('C:\\b')
    expect(railProject([project('C:\\a', [])], null, null)).toBeNull()
  })
})

describe('topRightLeaf', () => {
  it('walks right through row splits and up through column splits', () => {
    const leaf = (id: string) => ({ kind: 'leaf' as const, id })
    const tree = { kind: 'split' as const, dir: 'row' as const, ratio: 0.5, a: leaf('left'), b: { kind: 'split' as const, dir: 'column' as const, ratio: 0.5, a: leaf('top-right'), b: leaf('bottom-right') } }
    expect(topRightLeaf(tree)).toBe('top-right')
    expect(topRightLeaf(leaf('only'))).toBe('only')
  })
})

describe('railStatus', () => {
  it('maps the session states the rail draws differently', () => {
    expect(railStatus(row('a', { status: 'working' }))).toBe('working')
    expect(railStatus(row('b', { status: 'starting' }))).toBe('working')
    expect(railStatus(row('c', { status: 'attention' }))).toBe('attention')
    expect(railStatus(row('d', { status: 'error' }))).toBe('error')
    expect(railStatus(row('e', { status: 'done' }))).toBe('idle')
    expect(railStatus(row('f', { status: 'exited', alive: false }))).toBe('gone')
  })
})
