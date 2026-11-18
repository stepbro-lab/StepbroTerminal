import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { codexThreadsSince, justWritten, latestSince, readThreadHead, sameFolder } from './codexThreads'

let home: string
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'step-codex-'))
})
afterEach(() => {
  fs.rmSync(home, { recursive: true, force: true })
})

const pad = (n: number): string => String(n).padStart(2, '0')
function conversation(id: string, cwd: string, ago = 0, startedAt = Date.now() - ago): string {
  const d = new Date(startedAt)
  const dir = path.join(home, 'sessions', String(d.getFullYear()), pad(d.getMonth() + 1), pad(d.getDate()))
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `rollout-2026-09-28T10-00-00-${id}.jsonl`)
  const meta = { timestamp: new Date(startedAt).toISOString(), type: 'session_meta', payload: { session_id: id, id, timestamp: new Date(startedAt).toISOString(), cwd, originator: 'codex-tui', base_instructions: { text: 'x'.repeat(20000) } } }
  fs.writeFileSync(file, JSON.stringify(meta) + '\n{"type":"event_msg"}\n')
  const t = (Date.now() - ago) / 1000
  fs.utimesSync(file, t, t)
  return file
}

describe('reading what Codex saved', () => {
  it('takes the id, folder and start from the first line, however long it is', () => {
    const line = JSON.stringify({ type: 'session_meta', payload: { id: 'abc', timestamp: '2026-09-28T05:19:53.800Z', cwd: 'C:\\Users\\me\\app' } })
    expect(readThreadHead(line)).toEqual({ id: 'abc', cwd: 'C:\\Users\\me\\app', startedAt: Date.parse('2026-09-28T05:19:53.800Z') })
    expect(readThreadHead('{"type":"event_msg"}')).toBeNull()
  })

  it('finds the conversations written since a moment, and only those', () => {
    conversation('new-one', '/work/app', 1000)
    conversation('old-one', '/work/app', 3 * 3600_000)
    const found = codexThreadsSince(home, Date.now() - 60_000)
    expect(found.map((t) => t.id)).toEqual(['new-one'])
    expect(found[0].cwd).toBe('/work/app')
  })
})

describe('telling which conversation is the session\'s', () => {
  const t = (id: string, cwd: string, writtenAgo: number) => ({ id, cwd, startedAt: 0, writtenAt: Date.now() - writtenAgo })

  it('takes the one just written in the session\'s folder', () => {
    expect(justWritten([t('a', '/work/app', 2000), t('b', '/work/other', 1000)], '/work/app', new Set())).toBe('a')
  })

  it('does not guess between two, nor take one another session has', () => {
    expect(justWritten([t('a', '/work/app', 2000), t('b', '/work/app', 1000)], '/work/app', new Set())).toBeNull()
    expect(justWritten([t('a', '/work/app', 2000), t('b', '/work/app', 1000)], '/work/app', new Set(['b']))).toBe('a')
    expect(justWritten([t('a', '/work/app', 60_000)], '/work/app', new Set())).toBeNull()
  })

  it('falls back to the last one written since the session was made, if there is one', () => {
    const since = Date.now() - 600_000
    expect(latestSince([t('a', '/work/app', 300_000), t('b', '/work/app', 100_000), t('c', '/work/app', 900_000)], '/work/app', since, new Set())).toBe('b')
    expect(latestSince([t('c', '/work/app', 900_000)], '/work/app', since, new Set())).toBeNull()
  })

  it('reads a folder the same however it is written', () => {
    expect(sameFolder('C:\\Work\\App\\', 'c:\\work\\app', 'win32')).toBe(true)
    expect(sameFolder('/work/app/', '/work/app', 'darwin')).toBe(true)
    expect(sameFolder('/work/app', '/work/App', 'darwin')).toBe(false)
  })
})
