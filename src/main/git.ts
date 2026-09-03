import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type { ChangedFile, GitChanges } from '@shared/types'

function git(cwd: string, args: string[], maxBuffer = 8 * 1024 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, maxBuffer, windowsHide: true }, (err, stdout) => (err ? reject(err) : resolve(stdout)))
  })
}

async function repoRoot(cwd: string): Promise<string | null> {
  try {
    return (await git(cwd, ['rev-parse', '--show-toplevel'])).trim().replace(/\//g, path.sep)
  } catch {
    return null
  }
}

/**
 * Working-tree changes of a folder's repository. Files edited by the session (from hooks) or
 * modified after it started are flagged so the panel can show what the agent touched.
 */
export async function gitChanges(projectPath: string, since: number, touched: string[]): Promise<GitChanges> {
  const root = await repoRoot(projectPath)
  if (!root) return { root: null, files: [] }
  const out = await git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])
  const touchedSet = new Set(touched.map((t) => path.resolve(t).toLowerCase()))
  const files: ChangedFile[] = []
  const entries = out.split('\0')
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]
    if (e.length < 4) continue
    const x = e[0]
    const y = e[1]
    let rel = e.slice(3)
    if (x === 'R' || x === 'C') {
      // Renames carry the old path as the next entry.
      i++
    }
    const abs = path.join(root, rel.replace(/\//g, path.sep))
    let mtime = 0
    try {
      mtime = fs.statSync(abs).mtimeMs
    } catch {
      /* deleted */
    }
    const untracked = x === '?' && y === '?'
    const status: ChangedFile['status'] = untracked ? 'added' : x === 'D' || y === 'D' ? 'deleted' : x === 'A' ? 'added' : x === 'R' ? 'renamed' : 'modified'
    files.push({
      path: abs,
      rel: rel.replace(/\\/g, '/'),
      status,
      untracked,
      bySession: touchedSet.has(abs.toLowerCase()) || (mtime > since && since > 0),
      mtime
    })
  }
  files.sort((a, b) => Number(b.bySession) - Number(a.bySession) || b.mtime - a.mtime)
  return { root, files }
}

/** Unified diff of one file against the index (untracked files are shown whole as additions). */
export async function gitDiff(root: string, rel: string, untracked: boolean): Promise<string> {
  if (untracked) {
    try {
      const text = fs.readFileSync(path.join(root, rel), 'utf8')
      if (text.length > 400_000) return '(file too large to show)'
      return text
        .split('\n')
        .map((l) => '+' + l)
        .join('\n')
    } catch {
      return ''
    }
  }
  try {
    const d = await git(root, ['diff', '--no-color', '--', rel])
    if (d.trim()) return d
    return await git(root, ['diff', '--no-color', '--cached', '--', rel])
  } catch (e: any) {
    return String(e?.message ?? e)
  }
}

/** Throws away the file's changes: untracked files are deleted, tracked ones restored from HEAD. */
export async function gitRevert(root: string, rel: string, untracked: boolean): Promise<void> {
  if (untracked) {
    fs.rmSync(path.join(root, rel), { force: true })
    return
  }
  await git(root, ['checkout', 'HEAD', '--', rel])
}
