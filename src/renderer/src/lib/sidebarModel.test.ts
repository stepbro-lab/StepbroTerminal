import { describe, expect, it } from 'vitest'
import { canResume, defaultTitle, orderRows, type SidebarSession } from './sidebarModel'

const row = (id: string, order: number, view: number | null = null, pinned = false): SidebarSession =>
  ({ key: id, id, title: id, status: 'idle', presetId: 'shell', pinned, lastAt: 0, view, session: { order, createdAt: order } }) as unknown as SidebarSession

const ids = (rows: SidebarSession[]): string[] => rows.map((r) => r.id)

describe('orderRows', () => {
  it('follows the user order, pinned first', () => {
    expect(ids(orderRows([row('a', 2), row('b', 0), row('c', 1, null, true)]))).toEqual(['c', 'b', 'a'])
  })

  it('keeps the sessions of a split view together where the first of them sits', () => {
    expect(ids(orderRows([row('a', 0), row('b', 1, 0), row('c', 2), row('d', 3, 0)]))).toEqual(['a', 'b', 'd', 'c'])
  })

  it('orders the members of a box among themselves and boxes among the rest', () => {
    const rows = [row('a', 5, 1), row('b', 0, 0), row('c', 1), row('d', 2, 1), row('e', 3, 0)]
    expect(ids(orderRows(rows))).toEqual(['b', 'e', 'c', 'd', 'a'])
  })
})

describe('canResume', () => {
  const base = { id: 'x', projectPath: 'C:\\p', title: '', titleSource: 'none', pinned: false, order: 0, createdAt: 0, updatedAt: 0, status: 'exited', statusAt: 0, alive: false, cols: 80, rows: 24 } as const

  it('needs a conversation id, and either a resume argument or Claude Code typed into a shell', () => {
    const agent = { ...base, presetId: 'claude', agent: { sessionId: 'abc' }, launch: { command: 'claude', args: [], resumeArgs: ['--resume', '{sessionId}'], hooks: true } } as never
    const shellClaude = { ...base, presetId: 'shell', agent: { sessionId: 'abc', detectedPreset: 'claude' }, launch: { command: 'pwsh', args: [], hooks: false } } as never
    const endedShellClaude = { ...base, presetId: 'shell', agent: { sessionId: 'abc', lastPreset: 'claude' }, launch: { command: 'pwsh', args: [], hooks: false } } as never
    const plainShell = { ...base, presetId: 'shell', agent: {}, launch: { command: 'pwsh', args: [], hooks: false } } as never
    const noId = { ...base, presetId: 'claude', agent: {}, launch: { command: 'claude', args: [], resumeArgs: ['--resume', '{sessionId}'], hooks: true } } as never
    expect(canResume(agent)).toBe(true)
    expect(canResume(shellClaude)).toBe(true)
    expect(canResume(endedShellClaude)).toBe(true)
    expect(canResume(plainShell)).toBe(false)
    expect(canResume(noId)).toBe(false)
  })
})

describe('defaultTitle', () => {
  it('goes by the agent started in a shell until a prompt names the session', () => {
    expect(defaultTitle({ presetId: 'shell', agent: { detectedPreset: 'claude' } } as never)).toBe('Claude')
    expect(defaultTitle({ presetId: 'shell', agent: {} } as never)).toBe('Shell')
    expect(defaultTitle({ presetId: 'codex', agent: {} } as never)).toBe('Codex')
  })
})
