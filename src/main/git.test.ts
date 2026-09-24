import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { gitBranch, gitDiff } from './git'

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

describe('gitBranch', () => {
  const write = async (rel: string, text: string): Promise<void> => {
    await fs.mkdir(path.dirname(path.join(dir, rel)), { recursive: true })
    await fs.writeFile(path.join(dir, rel), text)
  }

  it('reads the branch checked out, from a folder inside the repository too', async () => {
    await write('.git/HEAD', 'ref: refs/heads/feature/login\n')
    await fs.mkdir(path.join(dir, 'src', 'deep'), { recursive: true })
    expect(await gitBranch(dir)).toEqual({ name: 'feature/login', detached: false, worktree: false })
    expect(await gitBranch(path.join(dir, 'src', 'deep'))).toEqual({ name: 'feature/login', detached: false, worktree: false })
  })

  it('gives the short hash of a detached checkout', async () => {
    await write('.git/HEAD', '0123456789abcdef0123456789abcdef01234567\n')
    expect(await gitBranch(dir)).toEqual({ name: '0123456', detached: true, worktree: false })
  })

  it('follows a linked worktree to its own HEAD', async () => {
    await write('main/.git/worktrees/wt/HEAD', 'ref: refs/heads/fix-bar\n')
    await write('wt/.git', 'gitdir: ../main/.git/worktrees/wt\n')
    expect(await gitBranch(path.join(dir, 'wt'))).toEqual({ name: 'fix-bar', detached: false, worktree: true })
  })

  it('says nothing outside a repository', async () => {
    expect(await gitBranch(dir)).toBeNull()
  })
})
