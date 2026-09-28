import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { gitDiff } from './git'

let dir: string
beforeEach(async () => { dir = await fs.mkdtemp(path.join(os.tmpdir(), 'step-git-')) })
afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }) })
describe('untracked diffs', () => {
  it('preserves text and binary classification', async () => {
    await fs.writeFile(path.join(dir, 'text'), 'one\ntwo\n')
    await fs.writeFile(path.join(dir, 'binary'), Buffer.from([0, 1, 2]))
    expect(await gitDiff(dir, 'text', true)).toEqual({ kind: 'text', text: '+one\n+two' })
    expect(await gitDiff(dir, 'binary', true)).toEqual({ kind: 'binary', text: '' })
  })
  it('classifies large files without loading the whole file', async () => {
    const fh = await fs.open(path.join(dir, 'large'), 'w')
    try {
      await fh.write(Buffer.alloc(400_001, 97))
      await fh.truncate(100 * 1024 * 1024)
    } finally { await fh.close() }
    expect(await gitDiff(dir, 'large', true)).toEqual({ kind: 'large', text: '' })
    expect(await gitDiff(dir, 'missing', true)).toEqual({ kind: 'empty', text: '' })
  })
})

