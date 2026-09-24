import { useEffect, useState } from 'react'
import type { GitBranch } from '@shared/types'
import { currentPace } from './windowPace'

/**
 * The branch a project has checked out, kept current while it is on screen: an agent or you can
 * switch it in a terminal at any moment, and git says nothing when that happens. It is read again
 * every few seconds while the window can be seen, and as soon as the window comes back to the
 * front. Everything showing the same project shares one reading.
 */

const EVERY_MS = 4000

interface Watch {
  value: GitBranch | null
  listeners: Set<(b: GitBranch | null) => void>
  timer: number
}

const watches = new Map<string, Watch>()

const same = (a: GitBranch | null, b: GitBranch | null): boolean =>
  a === b || (!!a && !!b && a.name === b.name && a.detached === b.detached && a.worktree === b.worktree)

async function read(path: string): Promise<void> {
  const w = watches.get(path)
  if (!w || currentPace() === 'off') return
  const next = await window.step.invoke('git:branch', path).catch(() => null)
  const now = watches.get(path)
  if (!now || same(now.value, next)) return
  now.value = next
  for (const l of now.listeners) l(next)
}

function onFocus(): void {
  for (const path of watches.keys()) void read(path)
}

function watch(path: string, listener: (b: GitBranch | null) => void): () => void {
  let w = watches.get(path)
  if (!w) {
    w = { value: null, listeners: new Set(), timer: window.setInterval(() => void read(path), EVERY_MS) }
    watches.set(path, w)
    if (watches.size === 1) window.addEventListener('focus', onFocus)
    void read(path)
  }
  w.listeners.add(listener)
  return () => {
    const cur = watches.get(path)
    if (!cur) return
    cur.listeners.delete(listener)
    if (cur.listeners.size) return
    window.clearInterval(cur.timer)
    watches.delete(path)
    if (!watches.size) window.removeEventListener('focus', onFocus)
  }
}

export function useGitBranch(path: string | null | undefined): GitBranch | null {
  const [branch, setBranch] = useState<GitBranch | null>(() => (path ? (watches.get(path)?.value ?? null) : null))
  useEffect(() => {
    if (!path) {
      setBranch(null)
      return
    }
    setBranch(watches.get(path)?.value ?? null)
    return watch(path, setBranch)
  }, [path])
  return branch
}
