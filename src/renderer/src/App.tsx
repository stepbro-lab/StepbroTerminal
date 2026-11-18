import { useEffect, useRef } from 'react'
import { useData, subscribeData } from '@/stores/data'
import { usePrefs } from '@/stores/prefs'
import { allPaneIds, useUi } from '@/stores/ui'
import { registry } from '@/terminal/TerminalRegistry'
import { usePace } from '@/lib/windowPace'
import { handleKeydown, runCommand, setSidebarModelRef, type Command } from '@/lib/shortcuts'
import { terminalContextMenu } from '@/lib/terminalMenu'
import { defaultTitle } from '@/lib/sidebarModel'
import { pruneLayout, type LayoutNode } from '@/lib/layout'
import { addDroppedFolders, openWorkspaceByKey } from '@/lib/actions'
import { useSidebarModel } from '@/lib/useSidebarModel'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { SidebarPeek } from '@/components/sidebar/SidebarPeek'
import { TopBar, useWindowCorners } from '@/components/Chrome'
import { startTopito, topitoSay } from '@/lib/topito/director'
import { TerminalPane } from '@/components/pane/TerminalPane'
import { CommandPalette } from '@/components/CommandPalette'
import { SettingsView } from '@/components/settings/SettingsView'
import { Toasts } from '@/components/Toasts'
import { ContextMenu } from '@/components/ContextMenu'
import { playNotificationSound } from '@/lib/sound'
import { useUpdates } from '@/stores/updates'
import { useNotes } from '@/stores/notes'
import { NotesPanel } from '@/components/notes/NotesPanel'
import { NoteFlight } from '@/components/notes/NoteFlight'
import { useHandoff } from '@/stores/handoff'
import { HandoffFlight } from '@/components/HandoffFlight'
import { WhatsNew } from '@/components/WhatsNew'

export default function App() {
  useWindowCorners()
  const prefs = usePrefs((s) => s.prefs)
  const dark = usePrefs((s) => s.dark)
  const sessions = useData((s) => s.sessions)
  const hostState = useData((s) => s.hostState)
  const activeId = useUi((s) => s.activeId)
  const settingsOpen = useUi((s) => s.settingsOpen)
  const booted = useUi((s) => s.booted)
  const model = useSidebarModel()

  useEffect(() => {
    void usePrefs.getState().load()
    void useData
      .getState()
      .load()
      .then(() => window.step.invoke('workspace:get'))
      .then((saved) => {
        const sessions = useData.getState().sessions
        const views = (saved?.views ?? []).map((v) => pruneLayout(v, (id) => !!sessions[id])).filter((v): v is LayoutNode => v !== null)
        useUi.getState().restore(views, saved?.activeView ?? 0, saved?.activeId ?? null)
      })
    const persist = (): void => {
      const { views, activeView, activeId, booted } = useUi.getState()
      if (booted) window.step.send('workspace:set', { views, activeView, activeId })
    }
    const offWorkspace = useUi.subscribe((s, prev) => {
      if (s.views !== prev.views || s.activeView !== prev.activeView || s.activeId !== prev.activeId) persist()
    })
    const offData = subscribeData()
    const s = window.step
    const offs = [
      s.on('host:output', (id, bytes, replay) => registry.write(id, bytes, replay)),
      s.on('host:clear', (id) => registry.clear(id)),
      s.on('host:removed', (id) => registry.dispose(id)),
      s.on('prefs:update', (p) => usePrefs.getState().applyRemote(p)),
      s.on('theme:system', (d) => usePrefs.getState().setSystemDark(d)),
      s.on('ui:focusSession', (id) => {
        const sess = useData.getState().sessions[id]
        if (sess) useUi.getState().setActiveProject(sess.projectPath)
        useUi.getState().setActive(id)
      }),
      s.on('ui:command', (name) => runCommand(name as Command)),
      s.on('ui:openPreview', (sessionId, url) => useUi.getState().openSide({ kind: 'preview', url, sessionId })),
      s.on('ui:closePreview', (sessionId) => {
        if (useUi.getState().sides[sessionId]?.kind === 'preview') useUi.getState().closeSide(sessionId)
      }),
      s.on('ui:sound', playNotificationSound),
      s.on('ui:update', (state) => useUpdates.getState().set(state)),
      s.on('notes:update', (notes, added) => useNotes.getState().receive(notes, added)),
      s.on('ui:handoff', (h) => useHandoff.getState().arrive(h)),
      s.on('win:maximized', (m) => useUi.getState().setMaximized(m)),
      s.on('win:fullscreen', (f) => useUi.getState().setFullscreen(f)),
      s.on('ui:openFolder', (p) => void addDroppedFolders([p])),
      s.on('ui:openWorkspace', (k) => void openWorkspaceByKey(k)),
      s.on('ui:topito', (say) => topitoSay(say))
    ]
    const stopTopito = startTopito()
    void s.invoke('win:isMaximized').then((m) => useUi.getState().setMaximized(m))
    void s.invoke('notes:list').then((notes) => useNotes.getState().receive(notes))

    const onKey = (ev: KeyboardEvent): void => {
      if (handleKeydown(ev)) {
        ev.preventDefault()
        ev.stopPropagation()
      }
    }
    window.addEventListener('keydown', onKey, true)
    const swallowFileDrop = (ev: DragEvent): void => {
      if (ev.dataTransfer && Array.from(ev.dataTransfer.types).includes('Files')) ev.preventDefault()
    }
    document.addEventListener('dragover', swallowFileDrop)
    document.addEventListener('drop', swallowFileDrop)
    registry.setAppKeyHandler((ev) => !!(handleKeydown(ev) && (ev.preventDefault(), true)))
    registry.setContextMenuHandler((id, x, y) => void terminalContextMenu(id, x, y))
    registry.setAgentResolver((id) => {
      const s = useData.getState().sessions[id]
      return s ? (s.agent.detectedPreset ?? (s.presetId !== 'shell' ? s.presetId : null)) : null
    })
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onMq = (e: MediaQueryListEvent): void => usePrefs.getState().setSystemDark(e.matches)
    mq.addEventListener('change', onMq)
    return () => {
      offData()
      offWorkspace()
      offs.forEach((off) => off())
      stopTopito()
      window.removeEventListener('keydown', onKey, true)
      document.removeEventListener('dragover', swallowFileDrop)
      document.removeEventListener('drop', swallowFileDrop)
      mq.removeEventListener('change', onMq)
    }
  }, [])

  const resumedRef = useRef(false)
  useEffect(() => {
    if (resumedRef.current || hostState.kind !== 'connected' || !prefs || !booted) return
    resumedRef.current = true
    if (!prefs.resumeOnLaunch) return
    for (const s of Object.values(useData.getState().sessions)) {
      if (s.leftRunning && !s.alive) window.step.send('host:restart', s.id)
    }
  }, [hostState.kind, prefs, booted])

  const pulledRef = useRef(false)
  useEffect(() => {
    if (pulledRef.current || hostState.kind !== 'connected' || !booted) return
    pulledRef.current = true
    void window.step.invoke('app:pendingFolders').then((paths) => {
      if (paths.length) void addDroppedFolders(paths)
    })
  }, [hostState.kind, booted])

  const pulledWsRef = useRef(false)
  useEffect(() => {
    if (pulledWsRef.current || hostState.kind !== 'connected' || !booted || !prefs) return
    pulledWsRef.current = true
    void window.step.invoke('app:pendingWorkspaces').then((keys) => {
      for (const k of keys) void openWorkspaceByKey(k)
    })
  }, [hostState.kind, booted, prefs])

  useEffect(() => {
    if (prefs) registry.applyPrefs(prefs, dark)
  }, [prefs, dark])

  const anyWorking = Object.values(sessions).some((s) => s.status === 'working' || s.status === 'starting')
  const pace = usePace()
  useEffect(() => {
    if (!anyWorking || pace === 'off') return
    const t = window.setInterval(() => useUi.getState().tickSpinner(), pace === 'live' ? 80 : 400)
    return () => window.clearInterval(t)
  }, [anyWorking, pace])

  useEffect(() => {
    setSidebarModelRef(model)
  }, [model])
  useEffect(() => {
    const ui = useUi.getState()
    if (hostState.kind !== 'connected' || !ui.booted) return
    for (const id of allPaneIds()) if (!sessions[id]) ui.dropPane(id)
    if (!useUi.getState().activeId) {
      const first = Object.values(sessions).sort((a, b) => b.updatedAt - a.updatedAt)[0]
      if (first) {
        ui.setActiveProject(first.projectPath)
        ui.setActive(first.id)
      }
    }
    if (!ui.activeProject && model[0]) ui.setActiveProject(model[0].path)
  }, [sessions, activeId, hostState, model])

  useEffect(() => {
    const s = activeId ? sessions[activeId] : undefined
    window.step.send('win:setTitle', s ? s.title || defaultTitle(s) : '')
  }, [activeId, sessions])

  return (
    <div className="app-frame relative flex h-full w-full flex-col overflow-hidden" data-frame>
      <div className="relative flex min-h-0 flex-1" style={{ display: settingsOpen ? 'none' : undefined }}>
        <Sidebar />
        <SidebarPeek />
        <TerminalPane />
      </div>
      {settingsOpen && <SettingsView />}
      <TopBar />
      <CommandPalette />
      <NotesPanel />
      <NoteFlight />
      <HandoffFlight />
      <ContextMenu />
      <WhatsNew />
      <Toasts />
    </div>
  )
}
