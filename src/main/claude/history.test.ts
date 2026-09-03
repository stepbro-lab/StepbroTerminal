import { describe, expect, it } from 'vitest'
import { parseHistoryLines } from './history'
import type { HistorySession } from '@shared/types'

const line = (o: object) => JSON.stringify(o)

describe('parseHistoryLines', () => {
  it('groups prompts by session, keeps the first real prompt as title and tracks last activity', () => {
    const map = new Map<string, HistorySession>()
    const text = [
      line({ display: '/model', timestamp: 100, project: 'C:\\p', sessionId: 's1' }),
      line({ display: 'make the header sticky', timestamp: 200, project: 'C:\\p', sessionId: 's1' }),
      'not json at all',
      line({ display: 'later prompt', timestamp: 300, project: 'C:\\p', sessionId: 's1' }),
      line({ display: 'other project', timestamp: 50, project: '/q', sessionId: 's2' }),
      line({ nope: true }),
      ''
    ].join('\n')
    parseHistoryLines(text, map)
    expect(map.size).toBe(2)
    expect(map.get('s1')).toEqual({
      sessionId: 's1',
      projectPath: 'C:\\p',
      title: 'make the header sticky',
      firstAt: 100,
      lastAt: 300,
      prompts: 3
    })
    expect(map.get('s2')?.title).toBe('other project')
  })

  it('truncates long titles and collapses whitespace', () => {
    const map = new Map<string, HistorySession>()
    parseHistoryLines(line({ display: 'a   b\n\nc' + 'x'.repeat(200), timestamp: 1, project: 'p', sessionId: 's' }), map)
    const t = map.get('s')!.title
    expect(t.startsWith('a b c')).toBe(true)
    expect(t.length).toBe(120)
    expect(t.endsWith('…')).toBe(true)
  })
})
