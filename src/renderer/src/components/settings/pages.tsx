import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { CustomPreset, Prefs } from '@shared/types'
import { usePrefs } from '@/stores/prefs'
import { useData } from '@/stores/data'
import { ACCENTS } from '@/theme/accents'
import { modKey } from '@/lib/format'
import { AgentLogo } from '../sidebar/AgentLogo'
import { Footer, Row, Section, Segmented, Slider, SmallButton, TextField, Toggle } from './controls'

const FONTS = ['JetBrains Mono', 'SF Mono', 'Cascadia Mono', 'Menlo', 'Consolas', 'Fira Code', 'Monaspace Neon', 'Iosevka']

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
      <Section title="Mode" description="Applies to the window, sidebar and terminal colors. Agents draw their own interface with their own theme setting.">
        <Row label="Mode">
          <Segmented
            value={p.theme}
            options={[
              { value: 'system', label: 'Auto' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' }
            ]}
            onChange={(theme) => upd({ theme })}
          />
        </Row>
      </Section>

      <Section title="App color" description="Tints selections, buttons and the activity marks, and washes the window chrome very slightly.">
        <div className="flex items-center gap-3 py-1">
          {ACCENTS.map((a) => (
            <button
              key={a.id}
              className="swatch"
              data-on={p.accent === a.id}
              title={a.name}
              style={{ background: dark ? a.dark : a.light }}
              onClick={() => upd({ accent: a.id })}
            />
          ))}
        </div>
      </Section>

      <Section title="Terminal text" description="The bundled JetBrains Mono renders crisply everywhere. Any font installed on this machine works too.">
        <Row label="Font">
          <TextField value={p.fontFamily} list={FONTS} width={200} onChange={(fontFamily) => upd({ fontFamily })} />
        </Row>
        <Row label="Size">
          <Slider value={p.fontSize} min={11} max={20} onChange={(fontSize) => upd({ fontSize })} format={(v) => `${v} px`} />
        </Row>
        <Row label="Line height">
          <Slider value={p.lineHeight} min={1} max={1.6} step={0.05} onChange={(lineHeight) => upd({ lineHeight })} format={(v) => v.toFixed(2)} />
        </Row>
      </Section>

      <Section title="Sidebar">
        <Row label="Width">
          <Slider value={p.sidebarWidth} min={200} max={360} step={10} onChange={(sidebarWidth) => upd({ sidebarWidth })} format={(v) => `${v} px`} />
        </Row>
      </Section>

      <Footer>
        <SmallButton onClick={() => upd({ theme: 'system', accent: 'blue', fontFamily: 'JetBrains Mono', fontSize: 13, lineHeight: 1.2, sidebarWidth: 240 })}>
          Revert to default
        </SmallButton>
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
      <Section title="Shell" description="Every new session runs this program inside the selected folder. Leave it empty to use the system default.">
        <Row label="Program" hint={shell?.resolvedPath ? `Now: ${shell.resolvedPath}` : undefined}>
          <TextField value={p.shell ?? ''} placeholder="auto" mono width={300} onChange={(v) => upd({ shell: v || undefined })} />
        </Row>
      </Section>

      <Section title="Cursor">
        <Row label="Shape">
          <Segmented
            value={p.cursorStyle}
            options={[
              { value: 'bar', label: 'Bar' },
              { value: 'block', label: 'Block' },
              { value: 'underline', label: 'Underline' }
            ]}
            onChange={(cursorStyle) => upd({ cursorStyle })}
          />
        </Row>
        <Row label="Blink">
          <Toggle value={p.cursorBlink} onChange={(cursorBlink) => upd({ cursorBlink })} />
        </Row>
      </Section>

      <Section title="History" description="Lines kept above the visible screen, per session. The host keeps the same amount while the window is closed.">
        <Row label="Scrollback">
          <Slider value={p.scrollback} min={1000} max={50000} step={1000} onChange={(scrollback) => upd({ scrollback })} format={(v) => `${(v / 1000).toFixed(0)}k`} />
        </Row>
      </Section>

      <Footer>
        <SmallButton onClick={() => upd({ shell: undefined, cursorStyle: 'bar', cursorBlink: true, scrollback: 5000 })}>Revert to default</SmallButton>
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
      <Section title="Detected" description="Type any of these in a shell and StepbroTerminal recognizes it. Right-click a folder to start one directly with live status.">
        <div className="flex flex-col">
          {agents.map((a) => (
            <div key={a.id} className="setting-row">
              <span className="flex w-6 items-center justify-center" style={{ color: a.installed ? a.color : 'var(--text-faint)' }}>
                <AgentLogo presetId={a.id} size={14} />
              </span>
              <span className="flex-1 text-[13px]" style={{ color: a.installed ? 'var(--text)' : 'var(--text-muted)' }}>
                {a.name}
              </span>
              <span className="max-w-[320px] truncate font-mono text-[11px] text-muted">{a.installed ? a.resolvedPath : 'Not installed'}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="As you type"
        description="Type claude, codex or gemini at a prompt and the flag that skips its permission prompts shows up in grey. Tab or → accepts it, Esc hides it."
      >
        <Row label="Suggest skip-permissions flags">
          <Toggle value={p.flagHints} onChange={(flagHints) => upd({ flagHints })} />
        </Row>
      </Section>

      <Section title="Claude Code" description="StepbroTerminal passes hooks to Claude per session so it can show working, waiting and done. Only set a path if the binary is not on PATH.">
        <Row label="Binary">
          <TextField
            value={p.claudePath ?? ''}
            placeholder={presets.find((x) => x.id === 'claude')?.resolvedPath ?? 'claude'}
            mono
            width={300}
            onChange={(v) => upd({ claudePath: v || undefined })}
          />
        </Row>
      </Section>

      <Section title="Your launchers" description="Any command becomes an entry in the folder menu and the palette.">
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
          <button className="icon-btn h-6 w-6" onClick={() => onChange(list.filter((x) => x.id !== c.id))} title="Remove">
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <div className="setting-row">
        <input className="field h-7 w-[140px] text-[12.5px]" placeholder="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        <input
          className="field h-7 flex-1 font-mono text-[12px]"
          placeholder="command --flags"
          value={draft.command}
          onChange={(e) => setDraft({ ...draft, command: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button className="icon-btn" onClick={add} title="Add">
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
      <Section title="Attention" description="Only for sessions you are not looking at. Clicking the notification jumps to the session.">
        <Row label="Notify when a session needs input or finishes">
          <Toggle value={p.notifications} onChange={(notifications) => upd({ notifications })} />
        </Row>
        <Row label="Play a sound">
          <Toggle value={p.sound} disabled={!p.notifications} onChange={(sound) => upd({ sound })} />
        </Row>
      </Section>
    </>
  )
}

const SHORTCUTS: Array<[string, string]> = [
  ['New shell', `${modKey} T`],
  ['Command palette', `${modKey} K`],
  ['Next session that needs you', `${modKey} J`],
  ['Prompt history', `${modKey} ⇧ H`],
  ['Jump to session 1 to 9', `${modKey} 1…9`],
  ['Split right with a new shell', `${modKey} \\`],
  ['Split down with a new shell', `${modKey} ⇧ \\`],
  ['Arrange panes', 'drag a session from the sidebar or a card title onto an edge'],
  ['Next / previous view', `${modKey} ⇧ ] and ${modKey} ⇧ [`],
  ['Close session', `${modKey} W`],
  ['Restart session', `${modKey} ⇧ R`],
  ['Rename session', 'F2'],
  ['Find in terminal', `${modKey} F`],
  ['Toggle sidebar', `${modKey} B`],
  ['Add folder', `${modKey} ⇧ O`],
  ['Settings', `${modKey} ,`],
  ['Copy selection', window.step.platform === 'darwin' ? '⌘ C' : 'Ctrl ⇧ C, or Ctrl C with a selection'],
  ['Paste text, or hand an image to the agent', window.step.platform === 'darwin' ? '⌘ V' : 'Ctrl V'],
  ['Drop files onto the terminal', 'inserts their paths']
]

export function ShortcutsPage() {
  return (
    <Section title="Keyboard">
      <div className="flex flex-col">
        {SHORTCUTS.map(([what, keys]) => (
          <div key={what} className="setting-row !min-h-[34px] !py-1">
            <span className="flex-1 text-[13px]">{what}</span>
            <span className="flex gap-1">
              {keys.split(' ').map((k, i) => (
                <kbd key={i}>{k}</kbd>
              ))}
            </span>
          </div>
        ))}
      </div>
    </Section>
  )
}

export function AdvancedPage() {
  const hostState = useData((s) => s.hostState)
  const dir = window.step.platform === 'win32' ? '%USERPROFILE%\\.step' : '~/.step'
  return (
    <>
      <Section
        title="Session host"
        description="A small background process owns every shell so they survive the window. Restarting it ends the shells that are open right now."
      >
        <Row label="Status" hint={hostState.kind === 'connected' ? `Connected · host ${hostState.info.version} · pid ${hostState.info.pid}` : hostState.kind}>
          <SmallButton onClick={() => void window.step.invoke('host:restartHost')}>Restart host</SmallButton>
        </Row>
      </Section>
      <Section title="Data" description="Session state, scrollback logs and per-session hook files.">
        <Row label="Folder" hint={dir}>
          <SmallButton onClick={() => void window.step.invoke('app:openPath', dir)}>Open</SmallButton>
        </Row>
      </Section>
    </>
  )
}
