import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NoteStore } from './NoteStore'

let dir: string
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'step-notes-'))
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

const agent = { kind: 'agent' as const, sessionId: 's1', presetId: 'claude', title: 'Fix login' }

describe('NoteStore', () => {
  it('adds notes newest first, trimmed and capped', () => {
    const store = new NoteStore(path.join(dir, 'notes.json'))
    store.load()
    const a = store.add('  first idea \r\n', agent)
    const b = store.add('x'.repeat(5000), { kind: 'user' })
    expect(store.list().map((n) => n.id)).toEqual([b.id, a.id])
    expect(a.text).toBe('first idea')
    expect(b.text.length).toBe(4000)
    expect(a.done).toBe(false)
    expect(a.source).toEqual(agent)
  })

  it('updates text and done, and removes', () => {
    const store = new NoteStore(path.join(dir, 'notes.json'))
    const n = store.add('todo', { kind: 'user' })
    expect(store.update(n.id, { done: true })?.done).toBe(true)
    expect(store.update(n.id, { text: 'todo, done' })?.text).toBe('todo, done')
    expect(store.update('nope', { done: true })).toBeNull()
    expect(store.remove(n.id)).toBe(true)
    expect(store.remove(n.id)).toBe(false)
    expect(store.list()).toEqual([])
  })

  it('tells listeners what changed and which note an agent just added', () => {
    const store = new NoteStore(path.join(dir, 'notes.json'))
    const seen: Array<{ count: number; added?: string }> = []
    store.on('change', (notes, added) => seen.push({ count: notes.length, added: added?.id }))
    const n = store.add('from claude', agent)
    store.update(n.id, { done: true })
    expect(seen).toEqual([
      { count: 1, added: n.id },
      { count: 1, added: undefined }
    ])
  })

  it('comes back from disk', () => {
    const file = path.join(dir, 'notes.json')
    const a = new NoteStore(file)
    const n = a.add('remember me', agent)
    const b = new NoteStore(file)
    b.load()
    expect(b.list()).toEqual([n])
    fs.writeFileSync(file, '{"broken":')
    const c = new NoteStore(file)
    c.load()
    expect(c.list()).toEqual([])
  })
})
