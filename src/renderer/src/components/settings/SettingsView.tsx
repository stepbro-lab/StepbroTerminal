import { Bell, ChevronLeft, Cpu, Keyboard, Palette, Terminal, Wrench } from 'lucide-react'
import { useUi, type SettingsPage } from '@/stores/ui'
import { AppearancePage, TerminalPage, AgentsPage, NotificationsPage, ShortcutsPage, AdvancedPage } from './pages'

const PAGES: Array<{ id: SettingsPage; label: string; icon: React.ReactNode; title: string; blurb: string }> = [
  { id: 'appearance', label: 'Appearance', icon: <Palette size={14} />, title: 'Appearance', blurb: 'How StepbroTerminal looks. Auto follows your system appearance.' },
  { id: 'terminal', label: 'Terminal', icon: <Terminal size={14} />, title: 'Terminal', blurb: 'The shell StepbroTerminal opens and how text is drawn inside it.' },
  { id: 'agents', label: 'Agents', icon: <Cpu size={14} />, title: 'Agents', blurb: 'Coding agents found on this machine and your own launchers.' },
  { id: 'notifications', label: 'Notifications', icon: <Bell size={14} />, title: 'Notifications', blurb: 'When StepbroTerminal should get your attention.' },
  { id: 'shortcuts', label: 'Shortcuts', icon: <Keyboard size={14} />, title: 'Shortcuts', blurb: 'Everything you can do without leaving the keyboard.' },
  { id: 'advanced', label: 'Advanced', icon: <Wrench size={14} />, title: 'Advanced', blurb: 'The session host, data on disk and paths.' }
]

/** Full-window settings, in place of the workspace: a page list on the left, one page on the right. */
export function SettingsView() {
  const page = useUi((s) => s.settingsPage)
  const setPage = useUi((s) => s.setSettingsPage)
  const close = () => useUi.getState().setSettingsOpen(false)
  const current = PAGES.find((p) => p.id === page) ?? PAGES[0]

  return (
    <div className="fade-in flex min-h-0 flex-1">
      <aside className="flex w-[200px] shrink-0 flex-col px-2 pt-1">
        <button className="nav-row mb-2 !text-muted hover:!text-fg" onClick={close}>
          <ChevronLeft size={14} />
          Back
        </button>
        {PAGES.map((p) => (
          <button key={p.id} className="nav-row" data-on={page === p.id} onClick={() => setPage(p.id)}>
            {p.icon}
            {p.label}
          </button>
        ))}
        <div className="mt-auto pb-3 pl-2 text-[11px] text-muted">StepbroTerminal {window.step.version}</div>
      </aside>
      <main className="min-w-0 flex-1 pb-2 pr-2">
        <div className="card scroll-thin h-full">
          <div className="mx-auto max-w-[680px] px-8 pb-10 pt-6">
            <div className="text-[12px] text-muted">
              <span>Settings</span>
              <span className="mx-1.5 text-faint">/</span>
              <span className="text-secondary">{current.label}</span>
            </div>
            <h2 className="mt-2 text-[22px] font-bold tracking-[-0.02em] text-fg">{current.title}</h2>
            <p className="mb-8 mt-1 text-[12.5px] text-muted">{current.blurb}</p>
            {page === 'appearance' && <AppearancePage />}
            {page === 'terminal' && <TerminalPage />}
            {page === 'agents' && <AgentsPage />}
            {page === 'notifications' && <NotificationsPage />}
            {page === 'shortcuts' && <ShortcutsPage />}
            {page === 'advanced' && <AdvancedPage />}
          </div>
        </div>
      </main>
    </div>
  )
}
