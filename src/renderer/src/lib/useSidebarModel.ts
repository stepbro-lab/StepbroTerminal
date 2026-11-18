import { useMemo } from 'react'
import { useData } from '@/stores/data'
import { usePrefs } from '@/stores/prefs'
import { useUi } from '@/stores/ui'
import { buildSidebar } from './sidebarModel'
import { leaves } from './layout'

export function useSidebarModel() {
  const projects = useData((s) => s.projects)
  const sessions = useData((s) => s.sessions)
  const prefs = usePrefs((s) => s.prefs)
  const views = useUi((s) => s.views)
  const groups = useMemo(() => views.map((v, i) => ({ view: i, ids: leaves(v) })).filter((g) => g.ids.length > 1), [views])
  return useMemo(() => buildSidebar(projects, Object.values(sessions), prefs, groups), [projects, sessions, prefs, groups])
}
