import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type { ChangedFile, FileDiff, GitChanges } from '@shared/types'

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

/** A NUL byte near the start is how git itself decides a file is not text. */
const looksBinary = (buf: Buffer): boolean => buf.subarray(0, 8000).includes(0)

interface Counts {
  added: number
  removed: number
  binary: boolean
}

/** Lines added and removed per path from `git diff --numstat`; git writes "-" for a binary file. */
async function numstat(root: string, args: string[]): Promise<Map<string, Counts>> {
  const map = new Map<string, Counts>()
  let out = ''
  try {
    out = await git(root, ['diff', '--numstat', '--no-renames', '-z', ...args])
  } catch {
    return map
  }
  for (const entry of out.split('\0')) {
    const m = /^(\d+|-)\t(\d+|-)\t(.+)$/s.exec(entry)
    if (!m) continue
    const binary = m[1] === '-'
    const cur = map.get(m[3]) ?? { added: 0, removed: 0, binary: false }
    cur.added += binary ? 0 : Number(m[1])
    cur.removed += binary ? 0 : Number(m[2])
    cur.binary ||= binary
    map.set(m[3], cur)
  }
  return map
}

/** Counts for a file git does not track yet: every line of it is new. */
function countNewFile(abs: string): Counts | null {
  try {
    const st = fs.statSync(abs)
    if (st.size > 2_000_000) return null
    const buf = fs.readFileSync(abs)
    if (looksBinary(buf)) return { added: 0, removed: 0, binary: true }
    let lines = 0
    for (const b of buf) if (b === 10) lines++
    if (buf.length && buf[buf.length - 1] !== 10) lines++
    return { added: lines, removed: 0, binary: false }
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
  // How much each file changed: what is not staged plus what is, and a count of a new file's lines.
  const [unstaged, staged] = await Promise.all([numstat(root, []), numstat(root, ['--cached'])])
  for (const f of files) {
    const counts = f.untracked ? countNewFile(f.path) : merge(unstaged.get(f.rel), staged.get(f.rel))
    if (!counts) continue
    f.added = counts.added
    f.removed = counts.removed
    if (counts.binary) f.binary = true
  }
  files.sort((a, b) => Number(b.bySession) - Number(a.bySession) || b.mtime - a.mtime)
  return { root, files }
}

function merge(a: Counts | undefined, b: Counts | undefined): Counts | null {
  if (!a && !b) return null
  return { added: (a?.added ?? 0) + (b?.added ?? 0), removed: (a?.removed ?? 0) + (b?.removed ?? 0), binary: !!(a?.binary || b?.binary) }
}

/** Unified diff of one file against the index; a file git does not track yet is shown whole, as additions. */
export async function gitDiff(root: string, rel: string, untracked: boolean): Promise<FileDiff> {
  if (untracked) {
    let buf: Buffer
    try {
      buf = fs.readFileSync(path.join(root, rel))
    } catch {
      return { kind: 'empty', text: '' }
    }
    if (looksBinary(buf)) return { kind: 'binary', text: '' }
    if (buf.length > 400_000) return { kind: 'large', text: '' }
    const lines = buf.toString('utf8').split('\n')
    if (lines[lines.length - 1] === '') lines.pop()
    return { kind: 'text', text: lines.map((l) => '+' + l).join('\n') }
  }
  try {
    let d = await git(root, ['diff', '--no-color', '--', rel])
    if (!d.trim()) d = await git(root, ['diff', '--no-color', '--cached', '--', rel])
    if (!d.trim()) return { kind: 'empty', text: '' }
    if (/^Binary files .* differ$/m.test(d)) return { kind: 'binary', text: '' }
    if (d.length > 1_500_000) return { kind: 'large', text: '' }
    return { kind: 'text', text: d }
  } catch (e: any) {
    return { kind: 'error', text: String(e?.message ?? e) }
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
