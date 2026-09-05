import { Bell, ChevronLeft, Cpu, Keyboard, LayoutGrid, Palette, Terminal, Wrench } from 'lucide-react'
import { useUi, type SettingsPage } from '@/stores/ui'
import { AppearancePage, TerminalPage, AgentsPage, WorkspacesPage, NotificationsPage, AdvancedPage } from './pages'
import { ShortcutsPage } from './ShortcutsPage'
import { t } from '@/lib/i18n'

const pages = (): Array<{ id: SettingsPage; label: string; icon: React.ReactNode; title: string; blurb: string }> => [
  { id: 'appearance', label: t('Appearance'), icon: <Palette size={14} />, title: t('Appearance'), blurb: t('How StepbroTerminal looks. Auto follows your system appearance.') },
  { id: 'terminal', label: t('Terminal'), icon: <Terminal size={14} />, title: t('Terminal'), blurb: t('The shell StepbroTerminal opens and how text is drawn inside it.') },
  { id: 'agents', label: t('Agents'), icon: <Cpu size={14} />, title: t('Agents'), blurb: t('Coding agents found on this machine and your own launchers.') },
  { id: 'workspaces', label: t('Workspaces'), icon: <LayoutGrid size={14} />, title: t('Workspaces'), blurb: t('Arrangements of panes that open in one go, each in its own folder, running what you tell it.') },
  { id: 'notifications', label: t('Notifications'), icon: <Bell size={14} />, title: t('Notifications'), blurb: t('When StepbroTerminal should get your attention.') },
  { id: 'shortcuts', label: t('Shortcuts'), icon: <Keyboard size={14} />, title: t('Shortcuts'), blurb: t('Everything you can do without leaving the keyboard, and the keys you prefer for it.') },
  { id: 'advanced', label: t('Advanced'), icon: <Wrench size={14} />, title: t('Advanced'), blurb: t('The session host, data on disk and paths.') }
]

/** Full-window settings, in place of the workspace: a page list on the left, one page on the right. */
export function SettingsView() {
  const PAGES = pages()
  const page = useUi((s) => s.settingsPage)
  const setPage = useUi((s) => s.setSettingsPage)
  const close = () => useUi.getState().setSettingsOpen(false)
  const current = PAGES.find((p) => p.id === page) ?? PAGES[0]

  return (
    <div className="fade-in flex min-h-0 flex-1">
      <aside className="flex w-[200px] shrink-0 flex-col px-2 pt-1">
        <button className="nav-row mb-2 !text-muted hover:!text-fg" onClick={close}>
          <ChevronLeft size={14} />{t('Back')}</button>
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
              <span>{t('Settings')}</span>
              <span className="mx-1.5 text-faint">/</span>
              <span className="text-secondary">{current.label}</span>
            </div>
            <h2 className="mt-2 text-[22px] font-bold tracking-[-0.02em] text-fg">{current.title}</h2>
            <p className="mb-8 mt-1 text-[12.5px] text-muted">{current.blurb}</p>
            {page === 'appearance' && <AppearancePage />}
            {page === 'terminal' && <TerminalPage />}
            {page === 'agents' && <AgentsPage />}
            {page === 'workspaces' && <WorkspacesPage />}
            {page === 'notifications' && <NotificationsPage />}
            {page === 'shortcuts' && <ShortcutsPage />}
            {page === 'advanced' && <AdvancedPage />}
          </div>
        </div>
      </main>
    </div>
  )
}
