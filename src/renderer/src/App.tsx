import { useEffect } from 'react'
import { useData, subscribeData } from '@/stores/data'
import { usePrefs } from '@/stores/prefs'
import { allPaneIds, useUi } from '@/stores/ui'
import { registry } from '@/terminal/TerminalRegistry'
import { handleKeydown, runCommand, setSidebarModelRef, type Command } from '@/lib/shortcuts'
import { terminalContextMenu } from '@/lib/terminalMenu'
import { defaultTitle } from '@/lib/sidebarModel'
import { pruneLayout, type LayoutNode } from '@/lib/layout'
import { TitleBar } from '@/components/TitleBar'
import { Sidebar, useSidebarModel } from '@/components/sidebar/Sidebar'
import { TerminalPane } from '@/components/pane/TerminalPane'
import { CommandPalette } from '@/components/CommandPalette'
import { SettingsView } from '@/components/settings/SettingsView'
import { Toasts } from '@/components/Toasts'
import { ContextMenu } from '@/components/ContextMenu'
import { playNotificationSound } from '@/lib/sound'

export default function App() {
  const prefs = usePrefs((s) => s.prefs)
  const dark = usePrefs((s) => s.dark)
  const sessions = useData((s) => s.sessions)
  const hostState = useData((s) => s.hostState)
  const activeId = useUi((s) => s.activeId)
  const settingsOpen = useUi((s) => s.settingsOpen)
  const model = useSidebarModel()

  // ---- boot: prefs, data, event wiring ----
  useEffect(() => {
    void usePrefs.getState().load()
    void useData
      .getState()
      .load()
      .then(() => window.step.invoke('workspace:get'))
      .then((saved) => {
        // Bring back the pane arrangements, dropping sessions that no longer exist.
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
      s.on('ui:sound', playNotificationSound),
      s.on('win:maximized', (m) => useUi.getState().setMaximized(m))
    ]
    void s.invoke('win:isMaximized').then((m) => useUi.getState().setMaximized(m))
    const onKey = (ev: KeyboardEvent): void => {
      if (handleKeydown(ev)) {
        ev.preventDefault()
        ev.stopPropagation()
      }
    }
    window.addEventListener('keydown', onKey, true)
    registry.setAppKeyHandler((ev) => !!(handleKeydown(ev) && (ev.preventDefault(), true)))
    registry.setContextMenuHandler((id, x, y) => void terminalContextMenu(id, x, y))
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onMq = (e: MediaQueryListEvent): void => usePrefs.getState().setSystemDark(e.matches)
    mq.addEventListener('change', onMq)
    return () => {
      offData()
      offWorkspace()
      offs.forEach((off) => off())
      window.removeEventListener('keydown', onKey, true)
      mq.removeEventListener('change', onMq)
    }
  }, [])

  // ---- terminal prefs ----
  useEffect(() => {
    if (prefs) registry.applyPrefs(prefs, dark)
  }, [prefs, dark])

  // ---- spinner ticker only while something is working ----
  useEffect(() => {
    const anyWorking = Object.values(sessions).some((s) => s.status === 'working' || s.status === 'starting')
    if (!anyWorking) return
    const t = window.setInterval(() => useUi.getState().tickSpinner(), 80)
    return () => window.clearInterval(t)
  }, [sessions])

  // ---- keep the sidebar model available to keyboard jumps, pick a sensible active session ----
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

  // ---- window title ----
  useEffect(() => {
    const s = activeId ? sessions[activeId] : undefined
    window.step.send('win:setTitle', s ? s.title || defaultTitle(s) : '')
  }, [activeId, sessions])

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden">
      <TitleBar />
      {/* The workspace stays mounted behind Settings so terminals keep their state and size. */}
      <div className="flex min-h-0 flex-1" style={{ display: settingsOpen ? 'none' : undefined }}>
        <Sidebar />
        <TerminalPane />
      </div>
      {settingsOpen && <SettingsView />}
      <CommandPalette />
      <ContextMenu />
      <Toasts />
    </div>
  )
}
