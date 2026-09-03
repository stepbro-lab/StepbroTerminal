import { create } from 'zustand'
import type { HistorySession, HostState, LiveClaude, Preset, Project, Session } from '@shared/types'

interface DataState {
  hostState: HostState
  sessions: Record<string, Session>
  history: HistorySession[]
  live: LiveClaude[]
  presets: Preset[]
  projects: Project[]
  load: () => Promise<void>
  setSessions: (list: Session[]) => void
  patchSession: (s: Session) => void
  removeSession: (id: string) => void
}

export const useData = create<DataState>((set) => ({
  hostState: { kind: 'connecting' },
  sessions: {},
  history: [],
  live: [],
  presets: [],
  projects: [],
  load: async () => {
    const [hostState, list, history, live, presets, projects] = await Promise.all([
      window.step.invoke('host:state'),
      window.step.invoke('host:list'),
      window.step.invoke('history:list'),
      window.step.invoke('history:live'),
      window.step.invoke('presets:list'),
      window.step.invoke('projects:list')
    ])
    const sessions: Record<string, Session> = {}
    for (const s of list) sessions[s.id] = s
    set({ hostState, sessions, history, live, presets, projects })
  },
  setSessions: (list) => {
    const sessions: Record<string, Session> = {}
    for (const s of list) sessions[s.id] = s
    set({ sessions })
  },
  patchSession: (s) => set((st) => ({ sessions: { ...st.sessions, [s.id]: s } })),
  removeSession: (id) =>
    set((st) => {
      const next = { ...st.sessions }
      delete next[id]
      return { sessions: next }
    })
}))

/** Wires every main -> renderer event into the store. Returns an unsubscribe function. */
export function subscribeData(): () => void {
  const s = window.step
  const offs = [
    s.on('host:state', (hostState) => useData.setState({ hostState })),
    s.on('host:sessions', (list) => useData.getState().setSessions(list)),
    s.on('host:session', (session) => useData.getState().patchSession(session)),
    s.on('host:removed', (id) => useData.getState().removeSession(id)),
    s.on('history:update', (history) => useData.setState({ history })),
    s.on('live:update', (live) => useData.setState({ live })),
    s.on('presets:update', (presets) => useData.setState({ presets })),
    s.on('projects:update', (projects) => useData.setState({ projects }))
  ]
  return () => offs.forEach((off) => off())
}
