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
  session: Session
}

export interface SidebarProject {
  path: string
  name: string
  sessions: SidebarSession[]
  collapsed: boolean
  lastAt: number
}

function same(a: string, b: string): boolean {
  const na = a.replace(/[\\/]+$/, '')
  const nb = b.replace(/[\\/]+$/, '')
  return window.step.platform === 'win32' ? na.toLowerCase() === nb.toLowerCase() : na === nb
}

export function rowPresetId(s: Session): string {
  return s.agent.detectedPreset ?? s.presetId
}

/** Sidebar = user projects, each with the sessions opened in Step (pinned first, then in the user's order, newest last). */
export function buildSidebar(projects: Project[], sessions: Session[], prefs: Prefs | null): SidebarProject[] {
  const collapsedSet = new Set((prefs?.collapsedProjects ?? []).map((p) => p.toLowerCase()))
  const out: SidebarProject[] = []
  for (const p of projects) {
    const rows: SidebarSession[] = sessions
      .filter((s) => same(s.projectPath, p.path))
      .map((s) => ({
        key: s.id,
        id: s.id,
        title: s.title || defaultTitle(s),
        status: s.status,
        presetId: rowPresetId(s),
        pinned: s.pinned,
        lastAt: s.updatedAt,
        session: s
      }))
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        return a.session.order - b.session.order || a.session.createdAt - b.session.createdAt
      })
    out.push({
      path: p.path,
      name: p.name,
      sessions: rows,
      collapsed: collapsedSet.has(p.path.toLowerCase()),
      lastAt: rows.reduce((m, r) => Math.max(m, r.lastAt), 0)
    })
  }
  // Keep the order the user added them in; projects with live sessions do not jump around.
  return out
}

export function defaultTitle(s: Session): string {
  if (s.presetId === 'shell') return 'Shell'
  return s.presetId.charAt(0).toUpperCase() + s.presetId.slice(1)
}

export function flatSessions(model: SidebarProject[]): SidebarSession[] {
  return model.flatMap((p) => p.sessions)
}
