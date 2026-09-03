import { useEffect, useMemo, useRef, useState } from 'react'
import { Folder, History, Moon, PanelLeft, RotateCw, Search, Settings, Sun, Terminal } from 'lucide-react'
import { useData } from '@/stores/data'
import { usePrefs, setChromeDim } from '@/stores/prefs'
import { useUi } from '@/stores/ui'
import { filter } from '@/lib/fuzzy'
import { addProject, createSession, historyFor, newShell, restartSession, resumeHistory } from '@/lib/actions'
import { flatSessions } from '@/lib/sidebarModel'
import { timeAgo } from '@/lib/format'
import { useSidebarModel } from './sidebar/Sidebar'
import { StatusGlyph } from './sidebar/StatusGlyph'
import { AgentLogo } from './sidebar/AgentLogo'

interface Item {
  id: string
  group: string
  label: string
  hint?: string
  icon: React.ReactNode
  run: () => unknown
}

export function CommandPalette() {
  const open = useUi((s) => s.paletteOpen)
  const mode = useUi((s) => s.paletteMode)
  const paletteProject = useUi((s) => s.paletteProject)
  const query = useUi((s) => s.paletteQuery)
  const setQuery = useUi((s) => s.setPaletteQuery)
  const close = useUi((s) => s.closePalette)
  const setActive = useUi((s) => s.setActive)
  const setActiveProject = useUi((s) => s.setActiveProject)
  const setSettingsOpen = useUi((s) => s.setSettingsOpen)
  const activeProject = useUi((s) => s.activeProject)
  const activeId = useUi((s) => s.activeId)
  const model = useSidebarModel()
  const presets = useData((s) => s.presets)
  const projects = useData((s) => s.projects)
  const history = useData((s) => s.history)
  const prefs = usePrefs((s) => s.prefs)
  const setPrefs = usePrefs((s) => s.set)
  const dark = usePrefs((s) => s.dark)
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const items = useMemo<Item[]>(() => {
    const color = (id: string): string => presets.find((p) => p.id === id)?.color ?? '#8a8a90'
    if (mode === 'resume' && paletteProject) {
      return historyFor(paletteProject).map((h) => ({
        id: h.sessionId,
        group: 'Past conversations',
        label: h.title,
        hint: `${timeAgo(h.lastAt)} · ${h.prompts} prompt${h.prompts === 1 ? '' : 's'}`,
        icon: (
          <span style={{ color: color('claude') }}>
            <AgentLogo presetId="claude" size={13} />
          </span>
        ),
        run: () => resumeHistory(h)
      }))
    }
    const out: Item[] = []
    for (const row of flatSessions(model)) {
      const project = model.find((p) => p.sessions.includes(row))
      out.push({
        id: row.key,
        group: 'Sessions',
        label: row.title,
        hint: project?.name,
        icon: (
          <span className="flex items-center gap-1.5">
            <StatusGlyph status={row.status} color={color(row.presetId)} size={12} />
            <span className="text-muted">
              <AgentLogo presetId={row.presetId} size={12} />
            </span>
          </span>
        ),
        run: () => {
          setActiveProject(row.session.projectPath)
          setActive(row.id)
        }
      })
    }
    const target = activeProject ?? projects[0]?.path
    const targetName = target ? projects.find((p) => p.path === target)?.name : undefined
    out.push({
      id: 'a:shell',
      group: 'Actions',
      label: 'New shell',
      hint: targetName ?? 'Add a folder first',
      icon: <Terminal size={13} className="text-muted" />,
      run: () => (target ? newShell(target) : addProject())
    })
    for (const pr of presets.filter((p) => p.installed && p.id !== 'shell')) {
      out.push({
        id: `new:${pr.id}`,
        group: 'Actions',
        label: `New ${pr.name} session`,
        hint: targetName,
        icon: (
          <span style={{ color: pr.color }}>
            <AgentLogo presetId={pr.id} size={13} />
          </span>
        ),
        run: () => (target ? createSession(target, pr.id) : addProject())
      })
    }
    if (target && historyFor(target).length) {
      out.push({
        id: 'a:resume',
        group: 'Actions',
        label: 'Resume a Claude Code conversation…',
        hint: targetName,
        icon: <History size={13} className="text-muted" />,
        run: () => setTimeout(() => useUi.getState().openPalette('', 'resume', target), 0)
      })
    }
    for (const p of projects) {
      out.push({
        id: `p:${p.path}`,
        group: 'Folders',
        label: p.name,
        hint: p.path,
        icon: <Folder size={13} className="text-muted" />,
        run: () => setActiveProject(p.path)
      })
    }
    out.push(
      { id: 'a:add', group: 'Actions', label: 'Add folder…', icon: <Folder size={13} className="text-muted" />, run: () => addProject() },
      {
        id: 'a:theme',
        group: 'Actions',
        label: `Switch to ${dark ? 'light' : 'dark'} theme`,
        icon: dark ? <Sun size={13} className="text-muted" /> : <Moon size={13} className="text-muted" />,
        run: () => setPrefs({ theme: dark ? 'light' : 'dark' })
      },
      {
        id: 'a:sidebar',
        group: 'Actions',
        label: `${prefs?.sidebarCollapsed ? 'Show' : 'Hide'} sidebar`,
        icon: <PanelLeft size={13} className="text-muted" />,
        run: () => setPrefs({ sidebarCollapsed: !prefs?.sidebarCollapsed })
      },
      { id: 'a:settings', group: 'Actions', label: 'Settings', icon: <Settings size={13} className="text-muted" />, run: () => setSettingsOpen(true) }
    )
    if (activeId) {
      out.push({
        id: 'a:restart',
        group: 'Actions',
        label: 'Restart current session',
        icon: <RotateCw size={13} className="text-muted" />,
        run: () => restartSession(activeId)
      })
    }
    out.push({
      id: 'a:host',
      group: 'Actions',
      label: 'Restart session host',
      hint: 'Sessions keep running',
      icon: <Terminal size={13} className="text-muted" />,
      run: () => window.step.invoke('host:restartHost')
    })
    return out
  }, [mode, paletteProject, model, presets, projects, history, activeProject, activeId, dark, prefs, setActive, setActiveProject, setPrefs, setSettingsOpen])

  const filtered = useMemo(() => filter(items, query, (i) => `${i.label} ${i.hint ?? ''}`), [items, query])

  useEffect(() => {
    if (open) {
      setCursor(0)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
    setChromeDim(open)
    return () => setChromeDim(false)
  }, [open, mode])
  useEffect(() => setCursor(0), [query])
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-i="${cursor}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  if (!open) return null

  const pick = (it: Item): void => {
    close()
    void it.run()
  }

  let lastGroup: string | null = null
  return (
    <div className="absolute inset-0 z-40 flex items-start justify-center pt-[12vh]" style={{ background: 'var(--scrim)' }} onMouseDown={close}>
      <div
        className="fade-in w-[560px] max-w-[92vw] overflow-hidden rounded-xl border border-line bg-card"
        style={{ boxShadow: 'var(--shadow-pop)' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-line px-3">
          <Search size={15} className="text-muted" />
          <input
            ref={inputRef}
            className="h-11 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted"
            style={{ userSelect: 'text' }}
            placeholder={mode === 'resume' ? 'Search past conversations…' : 'Jump to a session, folder or action…'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setCursor((c) => Math.min(filtered.length - 1, c + 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setCursor((c) => Math.max(0, c - 1))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                if (filtered[cursor]) pick(filtered[cursor])
              } else if (e.key === 'Escape') {
                e.preventDefault()
                close()
              }
            }}
          />
        </div>
        <div ref={listRef} className="scroll-thin max-h-[52vh] py-1">
          {filtered.length === 0 && <div className="px-4 py-6 text-center text-muted">Nothing matches</div>}
          {filtered.map((it, i) => {
            const header = !query && it.group !== lastGroup ? it.group : null
            lastGroup = it.group
            return (
              <div key={it.id}>
                {header && <div className="px-4 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted">{header}</div>}
                <button
                  data-i={i}
                  className="flex w-full items-center gap-2.5 px-4 py-1.5 text-left"
                  style={{ background: i === cursor ? 'var(--bg-active)' : undefined }}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => pick(it)}
                >
                  <span className="flex w-8 shrink-0 items-center justify-center">{it.icon}</span>
                  <span className="min-w-0 flex-1 truncate">{it.label}</span>
                  {it.hint && <span className="max-w-[45%] shrink-0 truncate text-[11.5px] text-muted">{it.hint}</span>}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
