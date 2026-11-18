import type { LayoutNode } from '@shared/types'
import type { SidebarProject, SidebarSession } from './sidebarModel'

export type RailStatus = 'working' | 'attention' | 'error' | 'idle' | 'gone'

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

export const SESSION_RAIL = false

export const RAIL_INSET = 96

let pointerOnRailAt = -Infinity
export function notePointerOnRail(): void {
  pointerOnRailAt = performance.now()
}

export function sincePointerOnRail(): number {
  return performance.now() - pointerOnRailAt
}

export function topRightLeaf(node: LayoutNode): string {
  return node.kind === 'leaf' ? node.id : topRightLeaf(node.dir === 'row' ? node.b : node.a)
}

function samePath(a: string, b: string): boolean {
  const na = a.replace(/[\\/]+$/, '')
  const nb = b.replace(/[\\/]+$/, '')
  return window.step.platform === 'win32' ? na.toLowerCase() === nb.toLowerCase() : na === nb
}
