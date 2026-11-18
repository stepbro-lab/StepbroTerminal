import type { Prefs, Project, Session, SessionStatus } from '@shared/types'

export type RowStatus = SessionStatus

export interface SidebarSession {
  key: string
  id: string
  title: string
  status: RowStatus
  presetId: string
  pinned: boolean
  lastAt: number
  view: number | null
  session: Session
}

export interface ViewGroup {
  view: number
  ids: string[]
}

export interface SidebarProject {
  path: string
  name: string
  sessions: SidebarSession[]
  archived: SidebarSession[]
  collapsed: boolean
  lastAt: number
}

function same(a: string, b: string): boolean {
  const na = a.replace(/[\\/]+$/, '')
  const nb = b.replace(/[\\/]+$/, '')
  return window.step.platform === 'win32' ? na.toLowerCase() === nb.toLowerCase() : na === nb
}

export function rowPresetId(s: Session): string {
  return s.agent.detectedPreset ?? (s.alive ? undefined : s.agent.lastPreset) ?? s.presetId
}

export function buildSidebar(projects: Project[], sessions: Session[], prefs: Prefs | null, groups: ViewGroup[] = []): SidebarProject[] {
  const collapsedSet = new Set((prefs?.collapsedProjects ?? []).map((p) => p.toLowerCase()))
  const viewOf = new Map<string, number>()
  for (const g of groups) for (const id of g.ids) viewOf.set(id, g.view)
  const out: SidebarProject[] = []
  for (const p of projects) {
    const here = sessions
      .filter((s) => same(s.projectPath, p.path))
      .map((s) => ({
        key: s.id,
        id: s.id,
        title: s.title || defaultTitle(s),
        status: s.status,
        presetId: rowPresetId(s),
        pinned: s.pinned,
        lastAt: s.updatedAt,
        view: viewOf.get(s.id) ?? null,
        session: s
      }))
    const rows = orderRows(here.filter((r) => !r.session.archived))
    const archived = here.filter((r) => r.session.archived).sort((a, b) => b.lastAt - a.lastAt)
    out.push({
      path: p.path,
      name: p.name,
      sessions: rows,
      archived,
      collapsed: collapsedSet.has(p.path.toLowerCase()),
      lastAt: rows.reduce((m, r) => Math.max(m, r.lastAt), 0)
    })
  }

  return out
}

function byPlace(a: SidebarSession, b: SidebarSession): number {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
  return a.session.order - b.session.order || a.session.createdAt - b.session.createdAt
}

export function orderRows(rows: SidebarSession[]): SidebarSession[] {
  const sorted = rows.slice().sort(byPlace)
  const anchor = new Map<number, SidebarSession>()
  for (const r of sorted) if (r.view !== null && !anchor.has(r.view)) anchor.set(r.view, r)
  const place = (r: SidebarSession): SidebarSession => (r.view !== null ? anchor.get(r.view)! : r)
  return sorted.sort((a, b) => {
    const pa = place(a)
    const pb = place(b)
    return pa === pb ? byPlace(a, b) : byPlace(pa, pb)
  })
}

export function canResume(s: Session): boolean {
  if (!s.agent.sessionId) return false
  return !!s.launch.resumeArgs || (s.presetId === 'shell' && (s.agent.detectedPreset ?? s.agent.lastPreset) === 'claude')
}

export function defaultTitle(s: Session): string {
  const id = s.presetId === 'shell' ? s.agent?.detectedPreset : s.presetId
  if (!id) return 'Shell'
  return id.charAt(0).toUpperCase() + id.slice(1)
}

export function flatSessions(model: SidebarProject[]): SidebarSession[] {
  return model.flatMap((p) => p.sessions)
}
