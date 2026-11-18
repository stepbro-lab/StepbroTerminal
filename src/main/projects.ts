import fs from 'node:fs'
import { normalizeProjectPath, projectName, sameProject } from '@shared/paths'
import type { Prefs, Project, Session } from '@shared/types'

export function computeProjects(prefs: Prefs, sessions: Session[]): Project[] {
  const out: Project[] = []
  const add = (p: string, source: Project['sources'][number]): void => {
    const norm = normalizeProjectPath(p)
    const existing = out.find((x) => sameProject(x.path, norm))
    if (existing) {
      if (!existing.sources.includes(source)) existing.sources.push(source)
      return
    }
    out.push({ path: norm, name: projectName(norm), sources: [source] })
  }
  for (const p of prefs.addedProjects) add(p, 'added')
  for (const s of sessions) add(s.projectPath, 'live')
  const shown = out.filter((p) => !prefs.hiddenProjects.some((h) => sameProject(h, p.path)) && (p.sources.includes('live') || dirExists(p.path)))
  return inOrder(shown, prefs.projectOrder ?? [])
}

export function inOrder(projects: Project[], order: string[]): Project[] {
  const rank = (p: Project): number => {
    const i = order.findIndex((o) => sameProject(o, p.path))
    return i < 0 ? order.length : i
  }
  return projects.map((p, i) => ({ p, i })).sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i).map((x) => x.p)
}

const dirCache = new Map<string, { ok: boolean; at: number }>()
function dirExists(p: string): boolean {
  const c = dirCache.get(p)
  const now = Date.now()
  if (c && now - c.at < 30_000) return c.ok
  let ok = false
  try {
    ok = fs.statSync(p).isDirectory()
  } catch {
    ok = false
  }
  dirCache.set(p, { ok, at: now })
  return ok
}
