import { useEffect, useMemo, useRef, useState } from 'react'
import { Folder, History, LayoutGrid, MessageSquare, Moon, PanelLeft, RotateCw, Search, Settings, Sparkles, Sun, Terminal } from 'lucide-react'
import type { PromptRecord } from '@shared/types'
import { registry } from '@/terminal/TerminalRegistry'
import { useData } from '@/stores/data'
import { usePrefs } from '@/stores/prefs'
import { useUi } from '@/stores/ui'
import { filter } from '@/lib/fuzzy'
import { addProject, createSession, historyFor, launchWorkspace, newShell, restartSession, resumeHistory } from '@/lib/actions'
import { flatSessions } from '@/lib/sidebarModel'
import { timeAgo } from '@/lib/format'
import { useSidebarModel } from '@/lib/useSidebarModel'
import { StatusGlyph } from './sidebar/StatusGlyph'
import { AgentLogo } from './sidebar/AgentLogo'
import { t } from '@/lib/i18n'
import { showAllChanges } from './WhatsNew'

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
  const [prompts, setPrompts] = useState<PromptRecord[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open && mode === 'prompts') void window.step.invoke('prompts:list').then(setPrompts)
  }, [open, mode])

  const items = useMemo<Item[]>(() => {
    const color = (id: string): string => presets.find((p) => p.id === id)?.color ?? '#8a8a90'
    if (mode === 'prompts') {
      return prompts.map((r, i) => ({
        id: `pr:${i}`,
        group: t('Prompts you sent'),
        label: r.text,
        hint: `${projects.find((p) => p.path.toLowerCase() === r.projectPath.toLowerCase())?.name ?? ''} · ${timeAgo(r.ts)}`,
        icon: (
          <span style={{ color: color(r.presetId) }}>
            <AgentLogo presetId={r.presetId} size={13} />
          </span>
        ),
        run: () => {
          const id = useUi.getState().activeId
          if (!id) return
          registry.get(id)?.term.paste(r.text)
          registry.focus(id)
        }
      }))
    }
    if (mode === 'resume' && paletteProject) {
      return historyFor(paletteProject).map((h) => ({
        id: h.sessionId,
        group: t('Past conversations'),
        label: h.title,
        hint: `${timeAgo(h.lastAt)} · ${t(h.prompts === 1 ? '{n} prompt' : '{n} prompts', { n: h.prompts })}`,
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
        group: t('Sessions'),
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
    for (const c of prefs?.launchConfigs ?? []) {
      out.push({
        id: `ws:${c.id}`,
        group: t('Workspaces'),
        label: c.name.trim() || 'Untitled workspace',
        hint: `${t(c.panes.length === 1 ? '{n} pane' : '{n} panes', { n: c.panes.length })} · ${t(c.split === 'row' ? 'side by side' : 'stacked')}`,
        icon: <LayoutGrid size={13} className="text-muted" />,
        run: () => launchWorkspace(c)
      })
    }
    const target = activeProject ?? projects[0]?.path
    const targetName = target ? projects.find((p) => p.path === target)?.name : undefined
    out.push({
      id: 'a:shell',
      group: t('Actions'),
      label: t('New shell'),
      hint: targetName ?? 'Add a folder first',
      icon: <Terminal size={13} className="text-muted" />,
      run: () => (target ? newShell(target) : addProject())
    })
    for (const pr of presets.filter((p) => p.installed && p.id !== 'shell')) {
      out.push({
        id: `new:${pr.id}`,
        group: t('Actions'),
        label: t('New {name} session', { name: pr.name }),
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
        group: t('Actions'),
        label: t('Resume a Claude Code conversation…'),
        hint: targetName,
        icon: <History size={13} className="text-muted" />,
        run: () => setTimeout(() => useUi.getState().openPalette('', 'resume', target), 0)
      })
    }
    for (const p of projects) {
      out.push({
        id: `p:${p.path}`,
        group: t('Folders'),
        label: p.name,
        hint: p.path,
        icon: <Folder size={13} className="text-muted" />,
        run: () => setActiveProject(p.path)
      })
    }
    out.push(
      { id: 'a:add', group: t('Actions'), label: t('Add folder…'), icon: <Folder size={13} className="text-muted" />, run: () => addProject() },
      {
        id: 'a:theme',
        group: t('Actions'),
        label: t(dark ? 'Switch to light theme' : 'Switch to dark theme'),
        icon: dark ? <Sun size={13} className="text-muted" /> : <Moon size={13} className="text-muted" />,
        run: () => setPrefs({ theme: dark ? 'light' : 'dark' })
      },
      {
        id: 'a:sidebar',
        group: t('Actions'),
        label: t(prefs?.sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'),
        icon: <PanelLeft size={13} className="text-muted" />,
        run: () => setPrefs({ sidebarCollapsed: !prefs?.sidebarCollapsed })
      },
      { id: 'a:settings', group: t('Actions'), label: t('Settings'), icon: <Settings size={13} className="text-muted" />, run: () => setSettingsOpen(true) },
      { id: 'a:whats-new', group: t('Actions'), label: t('What’s new'), icon: <Sparkles size={13} className="text-muted" />, run: showAllChanges },
      {
        id: 'a:workspaces',
        group: t('Actions'),
        label: t('Manage workspaces…'),
        icon: <LayoutGrid size={13} className="text-muted" />,
        run: () => {
          useUi.getState().setSettingsPage('workspaces')
          setSettingsOpen(true)
        }
      }
    )
    if (activeId) {
      out.push({
        id: 'a:restart',
        group: t('Actions'),
        label: t('Restart current session'),
        icon: <RotateCw size={13} className="text-muted" />,
        run: () => restartSession(activeId)
      })
    }
    out.push({
      id: 'a:prompts',
      group: t('Actions'),
      label: t('Prompt history…'),
      hint: t('Re-send something you asked an agent before'),
      icon: <MessageSquare size={13} className="text-muted" />,
      run: () => setTimeout(() => useUi.getState().openPalette('', 'prompts'), 0)
    })
    out.push({
      id: 'a:host',
      group: t('Actions'),
      label: t('Restart session host'),
      hint: t('Sessions keep running'),
      icon: <Terminal size={13} className="text-muted" />,
      run: () => window.step.invoke('host:restartHost')
    })
    return out
  }, [mode, paletteProject, prompts, model, presets, projects, history, activeProject, activeId, dark, prefs, setActive, setActiveProject, setPrefs, setSettingsOpen])

  const filtered = useMemo(() => filter(items, query, (i) => `${i.label} ${i.hint ?? ''}`), [items, query])

  useEffect(() => {
    if (open) {
      setCursor(0)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
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
        className="fade-in w-[560px] max-w-[92vw] overflow-hidden rounded-[18px] border border-line bg-card"
        style={{ boxShadow: 'var(--shadow-pop)' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-line px-3">
          <Search size={15} className="text-muted" />
          <input
            ref={inputRef}
            className="h-11 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted"
            style={{ userSelect: 'text' }}
            placeholder={t(mode === 'resume' ? 'Search past conversations…' : mode === 'prompts' ? 'Search prompts you sent…' : 'Jump to a session, folder or action…')}
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
          {filtered.length === 0 && <div className="px-4 py-6 text-center text-muted">{t('Nothing matches')}</div>}
          {filtered.map((it, i) => {
            const header = !query && it.group !== lastGroup ? it.group : null
            lastGroup = it.group
            return (
              <div key={it.id}>
                {header && <div className="px-4 pb-1 pt-2 text-[11.5px] font-medium uppercase tracking-wide text-muted">{header}</div>}
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
