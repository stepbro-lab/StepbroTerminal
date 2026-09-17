import type { LayoutNode } from '@shared/types'
import type { SidebarProject, SidebarSession } from './sidebarModel'

/** What a rail bar shows of a session: a sweep of light while it works, amber while it waits on you. */
export type RailStatus = 'working' | 'attention' | 'error' | 'idle' | 'gone'

/**
 * The folder whose sessions the rail lists: the one holding the session in front, else the folder
 * the sidebar had selected, else the first folder that has any session at all.
 */
export function railProject(model: SidebarProject[], activeProject: string | null, activeId: string | null): SidebarProject | null {
  if (activeId) {
    const holding = model.find((p) => p.sessions.some((s) => s.id === activeId))
    if (holding) return holding
  }
  if (activeProject) {
    const selected = model.find((p) => samePath(p.path, activeProject))
    if (selected) return selected
  }
  return model.find((p) => p.sessions.length > 0) ?? null
}

export function railStatus(row: SidebarSession): RailStatus {
  if (!row.session.alive) return 'gone'
  switch (row.status) {
    case 'working':
    case 'starting':
      return 'working'
    case 'attention':
      return 'attention'
    case 'error':
      return 'error'
    default:
      return 'idle'
  }
}

/**
 * The floating session rail is off for now: the sidebar is back while the rail's design is
 * finished. Its component, styles and motion are all still here; true brings it back.
 */
export const SESSION_RAIL = false

/** How wide the folded rail is, so what sits under its corner can keep out of its way. */
export const RAIL_INSET = 84

/** The pane the rail hangs over: rightmost among panes side by side, topmost among stacked ones. */
export function topRightLeaf(node: LayoutNode): string {
  return node.kind === 'leaf' ? node.id : topRightLeaf(node.dir === 'row' ? node.b : node.a)
}

function samePath(a: string, b: string): boolean {
  const na = a.replace(/[\\/]+$/, '')
  const nb = b.replace(/[\\/]+$/, '')
  return window.step.platform === 'win32' ? na.toLowerCase() === nb.toLowerCase() : na === nb
}
