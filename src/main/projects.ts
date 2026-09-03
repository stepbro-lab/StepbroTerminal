import fs from 'node:fs'
import { normalizeProjectPath, projectName, sameProject } from '@shared/paths'
import type { HistorySession, Prefs, Project, Session } from '@shared/types'

/** Projects = added by the user ∪ seen in Claude history ∪ owning a live session, minus hidden ones. */
export function computeProjects(prefs: Prefs, history: HistorySession[], sessions: Session[]): Project[] {
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
  const seen = new Set<string>()
  for (const h of history) {
    if (seen.has(h.projectPath)) continue
    seen.add(h.projectPath)
    add(h.projectPath, 'history')
  }
  return out.filter((p) => !prefs.hiddenProjects.some((h) => sameProject(h, p.path)) && (p.sources.includes('live') || dirExists(p.path)))
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
