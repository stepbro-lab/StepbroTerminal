import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { CustomPreset, LaunchConfig, LaunchPane, Prefs } from '@shared/types'
import { usePrefs } from '@/stores/prefs'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { launchWorkspace } from '@/lib/actions'
import { blankPane, newLaunchConfig, workspaceUrl } from '@/lib/launchConfigs'
import { ACCENTS } from '@/theme/accents'
import { DEFAULT_LOGO, LOGOS } from '@/lib/logos'
import type { LogoId } from '@shared/types'
import { LANGUAGES } from '@shared/i18n'
import { canBlurBehind } from '@shared/frame'
import { AgentLogo } from '../sidebar/AgentLogo'
import { Footer, Row, Section, Segmented, Slider, SmallButton, TextArea, TextField, Toggle } from './controls'
import { ResourceSections } from './Resources'
import { TopitoCard } from './TopitoCard'
import { playNotificationSound } from '@/lib/sound'
import { useUpdates } from '@/stores/updates'
import { showAllChanges } from '../WhatsNew'
import { t } from '@/lib/i18n'

const FONTS = ['JetBrains Mono', 'Geist Mono', 'SF Mono', 'Cascadia Mono', 'Menlo', 'Consolas', 'Fira Code', 'Monaspace Neon', 'Iosevka']

function usePrefsPage(): [Prefs, (p: Partial<Prefs>) => void] {
  const prefs = usePrefs((s) => s.prefs)!
  const set = usePrefs((s) => s.set)
  return [prefs, (p) => void set(p)]
}

export function AppearancePage() {
  const [p, upd] = usePrefsPage()
  const dark = usePrefs((s) => s.dark)
  return (
    <>
      <TopitoCard />
      <Section title={t('Theme')}>
        <Row label={t('Mode')} hint={t('Window, sidebar and terminal. Agents draw their own interface with their own theme.')} wrapHint>
          <Segmented
            value={p.theme}
            options={[
              { value: 'system', label: t('Auto') },
              { value: 'light', label: t('Light') },
              { value: 'dark', label: t('Dark') }
            ]}
            onChange={(theme) => upd({ theme })}
          />
        </Row>
        <Row label={t('App color')} hint={t('Selections, buttons and activity marks.')} wrapHint>
          <div className="flex items-center gap-2.5">
            {ACCENTS.map((a) => (
              <button
                key={a.id}
                className="swatch"
                data-on={p.accent === a.id}
                title={t(a.name)}
                aria-label={t(a.name)}
                style={{ background: dark ? a.dark : a.light }}
                onClick={() => upd({ accent: a.id })}
              />
            ))}
          </div>
        </Row>
        <Row label={t('Language')} hint={t('Shells and agents keep their own.')} wrapHint>
          <Segmented value={p.language} options={LANGUAGES.map((l) => ({ value: l.id, label: l.label }))} onChange={(language) => upd({ language })} />
        </Row>
      </Section>

      {canBlurBehind(window.step.platform, window.step.osVersion) && (
        <Section title={t('Opacity')} description={t('How much of the desktop shows through, blurred, behind the frame and behind the terminal. At 100% both are solid.')}>
          <Row label={t('Frame')}>
            <Slider value={Math.round(p.frameOpacity * 100)} min={0} max={100} step={5} onChange={(v) => upd({ frameOpacity: v / 100 })} format={(v) => `${v}%`} />
          </Row>
          <Row label={t('Terminal')}>
            <Slider value={Math.round(p.contentOpacity * 100)} min={0} max={100} step={5} onChange={(v) => upd({ contentOpacity: v / 100 })} format={(v) => `${v}%`} />
          </Row>
        </Section>
      )}

      <Section title={t('Logo')} description={t('The mark the app shows on its window, in the tray, in notifications and on an empty pane. On Windows the Start Menu, desktop and taskbar shortcuts take it too; on macOS the Dock does while the app runs.')}>
        <div className="flex items-center gap-3 py-1">
          {(Object.keys(LOGOS) as LogoId[]).map((id) => (
            <button
              key={id}
              className="logo-pick"
              data-on={(p.logo ?? DEFAULT_LOGO) === id}
              title={t(LOGOS[id].name)}
              onClick={() => upd({ logo: id })}
            >
              <img src={LOGOS[id].src} alt="" draggable={false} />
              <span>{t(LOGOS[id].name)}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title={t('Top bar')} description={t('The bar the top edge grows into, with the window buttons in it.')}>
        <Row label={t('Tuck it away')} hint={t('Off, the bar stays open and the terminal sits below it.')}>
          <Toggle value={p.barHides !== false} onChange={(barHides) => upd({ barHides })} />
        </Row>
      </Section>

      <Section title={t('Terminal text')} description={t('The bundled JetBrains Mono and Geist Mono render crisply everywhere. Any font installed on this machine works too.')}>
        <Row label={t('Font')}>
          <TextField value={p.fontFamily} list={FONTS} width={200} onChange={(fontFamily) => upd({ fontFamily })} />
        </Row>
        <Row label={t('Size')}>
          <Slider value={p.fontSize} min={11} max={20} onChange={(fontSize) => upd({ fontSize })} format={(v) => `${v} px`} />
        </Row>
        <Row label={t('Line height')}>
          <Slider value={p.lineHeight} min={1} max={1.6} step={0.05} onChange={(lineHeight) => upd({ lineHeight })} format={(v) => v.toFixed(2)} />
        </Row>
      </Section>

      <Section title={t('Sidebar')}>
        <Row label={t('Width')}>
          <Slider value={p.sidebarWidth} min={200} max={360} step={10} onChange={(sidebarWidth) => upd({ sidebarWidth })} format={(v) => `${v} px`} />
        </Row>
        <Row label={t('Show it from the left edge')} hint={t('Folded away, it opens when the pointer reaches the edge.')}>
          <Toggle value={p.edgePeek !== false} onChange={(edgePeek) => upd({ edgePeek })} />
        </Row>
      </Section>

      <Footer>
        <SmallButton onClick={() => upd({ theme: 'system', accent: 'graphite', logo: DEFAULT_LOGO, fontFamily: 'JetBrains Mono', fontSize: 13, lineHeight: 1, sidebarWidth: 240, frameOpacity: 0, contentOpacity: 0.9, barHides: true, edgePeek: true })}>{t('Revert to default')}</SmallButton>
      </Footer>
    </>
  )
}

export function TerminalPage() {
  const [p, upd] = usePrefsPage()
  const presets = useData((s) => s.presets)
  const shell = presets.find((x) => x.id === 'shell')
  return (
    <>
      <Section title={t('Shell')} description={t('Every new session runs this program inside the selected folder. Leave it empty to use the system default.')}>
        <Row label={t('Program')} hint={shell?.resolvedPath ? t('Now {path}', { path: shell.resolvedPath }) : undefined}>
          <TextField value={p.shell ?? ''} placeholder="auto" mono width={300} onChange={(v) => upd({ shell: v || undefined })} />
        </Row>
      </Section>

      <Section title={t('Cursor')}>
        <Row label={t('Shape')}>
          <Segmented
            value={p.cursorStyle}
            options={[
              { value: 'bar', label: t('Bar') },
              { value: 'block', label: t('Block') },
              { value: 'underline', label: t('Underline') }
            ]}
            onChange={(cursorStyle) => upd({ cursorStyle })}
          />
        </Row>
        <Row label={t('Blink')}>
          <Toggle value={p.cursorBlink} onChange={(cursorBlink) => upd({ cursorBlink })} />
        </Row>
      </Section>

      <Section title={t('Selection')}>
        <Row label={t('Copy on select')} hint={t('Text you select goes straight to the clipboard.')}>
          <Toggle value={p.copyOnSelect !== false} onChange={(copyOnSelect) => upd({ copyOnSelect })} />
        </Row>
      </Section>

      <Section
        title={t('Rendering')}
        description={t('Terminals draw with the GPU. Turn it off if your display shifts colour, brightness or HDR while the app is open; the software renderer looks the same and only costs a little speed.')}
      >
        <Row label={t('GPU acceleration')}>
          <Toggle value={p.gpuRendering} onChange={(gpuRendering) => upd({ gpuRendering })} />
        </Row>
      </Section>

      <Section title={t('History')} description={t('Lines kept above the visible screen, per session. The host keeps the same amount while the window is closed.')}>
        <Row label={t('Scrollback')}>
          <Slider value={p.scrollback} min={1000} max={50000} step={1000} onChange={(scrollback) => upd({ scrollback })} format={(v) => `${(v / 1000).toFixed(0)}k`} />
        </Row>
      </Section>

      <Section title={t('Sessions')} description={t('Sessions run in a background host that outlives the window. When it ends — an update, a restart — stepbro terminal can bring them back on launch, resuming any agent where it stopped.')}>
        <Row label={t('Resume sessions on launch')}>
          <Toggle value={p.resumeOnLaunch} onChange={(resumeOnLaunch) => upd({ resumeOnLaunch })} />
        </Row>
        <Row label={t('Archived sessions shown per folder')} hint={t('The rest wait behind a "more" row.')}>
          <Slider value={p.archivedShown ?? 5} min={0} max={20} onChange={(archivedShown) => upd({ archivedShown })} />
        </Row>
      </Section>

      <Footer>
        <SmallButton onClick={() => upd({ shell: undefined, cursorStyle: 'bar', cursorBlink: true, copyOnSelect: true, scrollback: 5000, resumeOnLaunch: true })}>{t('Revert to default')}</SmallButton>
      </Footer>
    </>
  )
}

export function AgentsPage() {
  const [p, upd] = usePrefsPage()
  const presets = useData((s) => s.presets)
  const agents = presets.filter((x) => x.id !== 'shell' && !x.custom)
  return (
    <>
      <Section title={t('Detected')} description={t('Type any of these in a shell and stepbro terminal recognizes it. Right-click a folder to start one directly with live status.')}>
        <div className="flex flex-col">
          {agents.map((a) => (
            <div key={a.id} className="setting-row">
              <span className="flex w-6 items-center justify-center" style={{ color: a.installed ? a.color : 'var(--text-faint)' }}>
                <AgentLogo presetId={a.id} size={14} />
              </span>
              <span className="flex-1 text-[13px]" style={{ color: a.installed ? 'var(--text)' : 'var(--text-muted)' }}>
                {a.name}
              </span>
              <span className="max-w-[320px] truncate font-mono text-[11.5px] text-muted">
                {a.installed ? a.resolvedPath : a.id === 'deepseek' && a.resolvedPath ? t('Needs an API key') : t('Not installed')}
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title={t('As you type')}
        description={t('Type claude, codex, gemini or opencode at a prompt and the flag that skips its permission prompts shows up in grey. Tab or → accepts it, Esc hides it.')}
      >
        <Row label={t('Suggest skip-permissions flags')}>
          <Toggle value={p.flagHints} onChange={(flagHints) => upd({ flagHints })} />
        </Row>
      </Section>

      <Section title="Claude Code" description={t('stepbro terminal passes hooks to Claude per session so it can show working, waiting and done. Only set a path if the binary is not on PATH.')}>
        <Row label={t('Binary')}>
          <TextField
            value={p.claudePath ?? ''}
            placeholder={presets.find((x) => x.id === 'claude')?.resolvedPath ?? 'claude'}
            mono
            width={300}
            onChange={(v) => upd({ claudePath: v || undefined })}
          />
        </Row>
      </Section>

      <Section
        title="DeepSeek"
        description={t('Claude Code on DeepSeek models, through the Anthropic-shaped API DeepSeek serves: same hooks, notes and status. With a key, DeepSeek shows up next to the other agents.')}
      >
        <Row label={t('API key')} hint={t('Kept on this machine, in the app preferences.')} wrapHint>
          <TextField value={p.deepseekApiKey ?? ''} placeholder="sk-…" mono secret width={300} onChange={(v) => upd({ deepseekApiKey: v.trim() || undefined })} />
          <SmallButton onClick={() => void window.step.invoke('app:openExternal', 'https://platform.deepseek.com/api_keys')}>{t('Get a key')}</SmallButton>
        </Row>
        <Row label={t('Model')} hint={t('Pro thinks harder; Flash is faster and cheaper. Sub-agents always use Flash.')} wrapHint>
          <Segmented
            value={p.deepseekModel ?? 'pro'}
            options={[
              { value: 'pro', label: 'V4 Pro' },
              { value: 'flash', label: 'V4 Flash' },
              { value: 'custom', label: t('Other') }
            ]}
            onChange={(deepseekModel) => upd({ deepseekModel })}
          />
        </Row>
        {p.deepseekModel === 'custom' && (
          <Row label={t('Model id')} hint={t('The id as DeepSeek lists it. Empty, sessions use V4 Pro. New sessions and restarts pick it up.')} wrapHint>
            <TextField
              value={p.deepseekModelId ?? ''}
              placeholder="deepseek-…"
              mono
              width={300}
              list={['deepseek-v4-pro', 'deepseek-v4-flash']}
              onChange={(v) => upd({ deepseekModelId: v.trim() || undefined })}
            />
          </Row>
        )}
      </Section>

      <Section title={t('Your launchers')} description={t('Any command becomes an entry in the folder menu and the palette.')}>
        <CustomLaunchers list={p.customPresets} onChange={(customPresets) => upd({ customPresets })} />
      </Section>
    </>
  )
}

function CustomLaunchers({ list, onChange }: { list: CustomPreset[]; onChange: (l: CustomPreset[]) => void }) {
  const [draft, setDraft] = useState({ name: '', command: '' })
  const add = (): void => {
    if (!draft.name.trim() || !draft.command.trim()) return
    const parts = draft.command.trim().split(/\s+/)
    const id = 'custom-' + draft.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    onChange([...list.filter((c) => c.id !== id), { id, name: draft.name.trim(), command: parts[0], args: parts.slice(1), color: '#9ca3af' }])
    setDraft({ name: '', command: '' })
  }
  return (
    <div className="flex flex-col">
      {list.map((c) => (
        <div key={c.id} className="setting-row">
          <span className="w-[140px] truncate text-[13px]">{c.name}</span>
          <span className="flex-1 truncate font-mono text-[11.5px] text-muted">{[c.command, ...c.args].join(' ')}</span>
          <button className="icon-btn h-6 w-6" onClick={() => onChange(list.filter((x) => x.id !== c.id))} title={t('Remove')}>
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <div className="setting-row">
        <input className="field h-7 w-[140px] text-[12.5px]" placeholder={t('Name')} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        <input
          className="field h-7 flex-1 font-mono text-[12.5px]"
          placeholder="command --flags"
          value={draft.command}
          onChange={(e) => setDraft({ ...draft, command: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button className="icon-btn" onClick={add} title={t('Add')}>
          <Plus size={14} />
        </button>
      </div>
    </div>
  )
}

export function NotificationsPage() {
  const [p, upd] = usePrefsPage()
  return (
    <>
      <Section title={t('Attention')} description={t('Only for sessions you are not looking at. Clicking the notification jumps to the session.')}>
        <Row label={t('Notify when a session needs input or finishes')}>
          <Toggle value={p.notifications} onChange={(notifications) => upd({ notifications })} />
        </Row>
        <Row label={t('Play a sound')}>
          <Toggle value={p.sound} disabled={!p.notifications} onChange={(sound) => upd({ sound })} />
        </Row>
        {p.notifications && p.sound && (
          <Row label={t('Volume')}>
            <div className="flex items-center gap-3">
              <Slider value={p.soundVolume} min={0} max={100} step={5} onChange={(soundVolume) => upd({ soundVolume })} format={(v) => `${v}%`} />
              <SmallButton onClick={() => playNotificationSound(p.soundVolume)}>{t('Try it')}</SmallButton>
            </div>
          </Row>
        )}
      </Section>
    </>
  )
}

function UpdatesSection() {
  const state = useUpdates((s) => s.state)
  const check = useUpdates((s) => s.check)
  const install = useUpdates((s) => s.install)
  const version = window.step.version
  const direct = window.step.platform === 'win32'
  const hint =
    state.kind === 'checking'
      ? `${version} · checking…`
      : state.kind === 'available'
        ? `${version} · ${state.version} is out`
        : state.kind === 'downloading'
          ? `${version} · downloading ${state.version}, ${state.percent}%`
          : state.kind === 'ready'
            ? `${version} · ${state.version} downloaded, restart to install`
            : state.kind === 'error'
              ? `${version} · could not check: ${state.message}`
              : version
  const action =
    state.kind === 'ready'
      ? { label: t('Restart to update'), run: install }
      : state.kind === 'available'
        ? { label: t(state.direct ? 'Download' : 'Open download page'), run: install }
        : state.kind === 'downloading'
          ? null
          : { label: t('Check now'), run: check }
  return (
    <Section
      title={t('Updates')}
      description={
        direct
          ? t('New versions download in the background and install when you restart.')
          : t('New versions are announced here and in the title bar. The download page has the installer for your system.')
      }
    >
      <Row label={t('Version')} hint={hint}>
        {action && <SmallButton onClick={() => void action.run()}>{action.label}</SmallButton>}
      </Row>
      <Row label={t('What’s new')} hint={t('What changed in each release')}>
        <SmallButton onClick={showAllChanges}>{t('Show')}</SmallButton>
      </Row>
    </Section>
  )
}

export function AdvancedPage() {
  const hostState = useData((s) => s.hostState)
  const [p, upd] = usePrefsPage()
  return (
    <>
      <UpdatesSection />
      {window.step.platform === 'win32' && (
        <Section title={t('Closing the window')} description={t('Your sessions keep running either way. In the tray, the app also keeps telling you when one finishes or needs you.')}>
          <Row label={t('Keep running in the tray')} hint={t('Off, closing the window quits the app.')}>
            <Toggle value={p.closeToTray !== false} onChange={(closeToTray) => upd({ closeToTray })} />
          </Row>
        </Section>
      )}
      <Section
        title={t('Session host')}
        description={t('A small background process owns every shell so they survive the window. Restarting it ends the shells that are open right now.')}
      >
        <Row label={t('Status')} hint={hostState.kind === 'connected' ? t('Connected to host {version}', { version: hostState.info.version }) : hostState.kind === 'connecting' ? t('Connecting…') : t('Not running')}>
          <SmallButton onClick={() => void window.step.invoke('host:restartHost')}>{t('Restart host')}</SmallButton>
        </Row>
      </Section>
      <ResourceSections />
    </>
  )
}

/** Saved pane arrangements that open in one go, each pane in its own folder, running what it is told. */
export function WorkspacesPage() {
  const [p, upd] = usePrefsPage()
  const presets = useData((s) => s.presets)
  const projects = useData((s) => s.projects)
  const configs = p.launchConfigs ?? []
  const [editing, setEditing] = useState<string | null>(null)
  const current = configs.find((c) => c.id === editing)
  const runnable = presets.filter((x) => x.id === 'shell' || x.installed)

  const save = (next: LaunchConfig[]): void => upd({ launchConfigs: next })
  const update = (id: string, patch: Partial<LaunchConfig>): void => save(configs.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  const updatePane = (c: LaunchConfig, i: number, patch: Partial<LaunchPane>): void =>
    update(c.id, { panes: c.panes.map((pane, k) => (k === i ? { ...pane, ...patch } : pane)) })
  const add = (): void => {
    const c = newLaunchConfig(projects[0]?.path ?? '')
    save([...configs, c])
    setEditing(c.id)
  }
  const remove = (id: string): void => {
    save(configs.filter((c) => c.id !== id))
    if (editing === id) setEditing(null)
  }
  const pickFolder = async (c: LaunchConfig, i: number): Promise<void> => {
    const dir = await window.step.invoke('projects:pickFolder')
    if (dir) updatePane(c, i, { cwd: dir })
  }
  const open = (c: LaunchConfig): void => {
    useUi.getState().setSettingsOpen(false)
    void launchWorkspace(c)
  }
  const summary = (c: LaunchConfig): string => `${t(c.panes.length === 1 ? '{n} pane' : '{n} panes', { n: c.panes.length })} · ${t(c.split === 'row' ? 'side by side' : 'stacked')} · ${workspaceUrl(c)}`
  const copyLink = (c: LaunchConfig): void => {
    window.step.send('clipboard:write', workspaceUrl(c))
    useUi.getState().toast(t('Link copied'), 'success')
  }
  const example = configs[0] ? workspaceUrl(configs[0]) : 'step://workspace/my-project'

  return (
    <>
      <Section
        title={t('Your workspaces')}
        description={t('Each one opens its panes at once, every pane in its own folder, and types a start command as soon as the prompt is ready. Open them from here or from the palette.')}
        footnote={
          <>
            {t('Every workspace has a link that opens it from a shortcut or a script, starting the app if it is closed.')} Windows:{' '}
            <code className="whitespace-nowrap font-mono text-[11.5px] text-secondary">start "" "{example}"</code> · macOS: <code className="whitespace-nowrap font-mono text-[11.5px] text-secondary">open "{example}"</code> · Linux:{' '}
            <code className="whitespace-nowrap font-mono text-[11.5px] text-secondary">xdg-open "{example}"</code>
          </>
        }
      >
        {configs.length === 0 && <div className="py-2 text-[12.5px] text-muted">{t('No workspaces yet.')}</div>}
        {configs.map((c) => (
          <Row key={c.id} label={c.name.trim() || t('Untitled')} hint={summary(c)}>
            <div className="flex items-center gap-1.5">
              <SmallButton onClick={() => open(c)}>{t('Open')}</SmallButton>
              <SmallButton onClick={() => copyLink(c)}>{t('Copy link')}</SmallButton>
              <SmallButton onClick={() => setEditing(editing === c.id ? null : c.id)}>{t(editing === c.id ? 'Close' : 'Edit')}</SmallButton>
              <SmallButton tone="danger" onClick={() => remove(c.id)}>{t('Delete')}</SmallButton>
            </div>
          </Row>
        ))}
      </Section>
      <Footer>
        <SmallButton onClick={add}>{t('New workspace')}</SmallButton>
      </Footer>

      {current && (
        <Section plain title={`Editing ${current.name.trim() || 'Untitled'}`} description={t('Changes save as you type.')}>
          <Row label={t('Name')}>
            <TextField value={current.name} placeholder="Frontend + backend" onChange={(name) => update(current.id, { name })} />
          </Row>
          <Row label={t('Layout')}>
            <Segmented
              value={current.split}
              options={[
                { value: 'row', label: t('Side by side') },
                { value: 'column', label: t('Stacked') }
              ]}
              onChange={(split) => update(current.id, { split })}
            />
          </Row>
          {current.panes.map((pane, i) => (
            <div key={i} className="card mt-3 px-4 py-3">
              <div className="mb-1 flex items-center justify-between">
                <div className="text-[12.5px] font-semibold text-secondary">Pane {i + 1}</div>
                {current.panes.length > 1 && (
                  <button className="icon-btn h-6 w-6" title={t('Remove pane')} onClick={() => update(current.id, { panes: current.panes.filter((_, k) => k !== i) })}>
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
              <Row label={t('Folder')}>
                <div className="flex items-center gap-1.5">
                  <TextField value={pane.cwd} mono width={240} placeholder={t('Choose a folder')} onChange={(cwd) => updatePane(current, i, { cwd })} />
                  <SmallButton onClick={() => void pickFolder(current, i)}>{t('Choose…')}</SmallButton>
                </div>
              </Row>
              <Row label={t('Runs')}>
                <select className="field h-7 text-[12.5px]" style={{ width: 200 }} value={pane.presetId} onChange={(e) => updatePane(current, i, { presetId: e.target.value })}>
                  {runnable.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </Row>
              <div className="mt-3">
                <div className="text-[13px] text-fg">{t('Type when ready')}</div>
                <div className="mb-1.5 text-[11.5px] text-muted">{t('Entered line by line once the pane settles at its prompt. For an agent, this is its first message.')}</div>
                <TextArea value={pane.runOnStart ?? ''} mono placeholder="npm run dev" onChange={(runOnStart) => updatePane(current, i, { runOnStart })} />
              </div>
            </div>
          ))}
          <Footer>
            <SmallButton onClick={() => update(current.id, { panes: [...current.panes, blankPane(current.panes[current.panes.length - 1]?.cwd ?? '')] })}>{t('Add pane')}</SmallButton>
            <SmallButton onClick={() => open(current)}>{t('Open now')}</SmallButton>
          </Footer>
        </Section>
      )}
    </>
  )
}
