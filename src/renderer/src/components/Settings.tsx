import { useEffect, useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import type { CustomPreset, Prefs } from '@shared/types'
import { usePrefs } from '@/stores/prefs'
import { useUi } from '@/stores/ui'
import { useData } from '@/stores/data'
import { AgentLogo } from './sidebar/AgentLogo'

const FONTS = ['JetBrains Mono', 'SF Mono', 'Cascadia Mono', 'Menlo', 'Consolas', 'Fira Code', 'Monaspace Neon']

export function Settings() {
  const open = useUi((s) => s.settingsOpen)
  const setOpen = useUi((s) => s.setSettingsOpen)
  const prefs = usePrefs((s) => s.prefs)
  const set = usePrefs((s) => s.set)
  const presets = useData((s) => s.presets)
  const hostState = useData((s) => s.hostState)
  const [advanced, setAdvanced] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  if (!open || !prefs) return null
  const p = prefs
  const upd = (partial: Partial<Prefs>): void => void set(partial)
  const agents = presets.filter((x) => x.id !== 'shell' && !x.custom)

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center" style={{ background: 'var(--scrim)' }} onMouseDown={() => setOpen(false)}>
      <div
        className="fade-in flex max-h-[82vh] w-[600px] max-w-[94vw] flex-col overflow-hidden rounded-2xl"
        style={{ background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-pop)' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex h-12 items-center px-5">
          <span className="text-[15px] font-semibold tracking-[-0.01em]">Settings</span>
          <button className="icon-btn ml-auto" onClick={() => setOpen(false)}>
            <X size={15} />
          </button>
        </div>
        <div className="scroll-thin flex-1 px-5 pb-5">
          <Group title="Appearance">
            <Row label="Theme">
              <div className="segment">
                {(['system', 'light', 'dark'] as const).map((t) => (
                  <button key={t} data-on={p.theme === t} onClick={() => upd({ theme: t })}>
                    {t === 'system' ? 'Auto' : t[0].toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </Row>
            <Row label="Terminal font">
              <input className="field w-[210px]" list="fonts" value={p.fontFamily} onChange={(e) => upd({ fontFamily: e.target.value })} />
              <datalist id="fonts">
                {FONTS.map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
            </Row>
            <Row label="Font size">
              <input type="range" min={11} max={20} value={p.fontSize} onChange={(e) => upd({ fontSize: Number(e.target.value) })} className="w-[150px]" />
              <span className="w-6 text-right tabular-nums text-muted">{p.fontSize}</span>
            </Row>
          </Group>

          <Group title="Terminal">
            <Row label="Scrollback">
              <input
                className="field w-[110px] tabular-nums"
                type="number"
                min={1000}
                max={50000}
                step={1000}
                value={p.scrollback}
                onChange={(e) => upd({ scrollback: Math.min(50000, Math.max(1000, Number(e.target.value) || 1000)) })}
              />
              <span className="text-muted">lines</span>
            </Row>
            <Row label="Shell" hint="Empty means the system default">
              <input
                className="field w-[280px] font-mono text-[12px]"
                placeholder={presets.find((x) => x.id === 'shell')?.resolvedPath ?? 'auto'}
                value={p.shell ?? ''}
                onChange={(e) => upd({ shell: e.target.value || undefined })}
              />
            </Row>
          </Group>

          <Group title="Agents" hint="Found on this machine. Type them in any shell, or start one from a folder’s + menu.">
            <div className="flex flex-wrap gap-1.5">
              {agents.map((a) => (
                <span
                  key={a.id}
                  className="inline-flex h-7 items-center gap-1.5 rounded-full pl-2 pr-2.5 text-[12px]"
                  style={{
                    background: a.installed ? 'var(--bg-hover)' : 'transparent',
                    color: a.installed ? 'var(--text)' : 'var(--text-faint)',
                    boxShadow: a.installed ? undefined : '0 0 0 1px var(--border) inset'
                  }}
                  title={a.installed ? a.resolvedPath : 'Not installed'}
                >
                  <span style={{ color: a.installed ? a.color : 'var(--text-faint)' }}>
                    <AgentLogo presetId={a.id} size={12} />
                  </span>
                  {a.name}
                </span>
              ))}
            </div>
            <CustomPresets list={p.customPresets} onChange={(customPresets) => upd({ customPresets })} />
          </Group>

          <Group title="Notifications">
            <Toggle label="Tell me when a session I’m not looking at finishes or needs input" value={p.notifications} onChange={(v) => upd({ notifications: v })} />
            <Toggle label="With a sound" value={p.sound} onChange={(v) => upd({ sound: v })} disabled={!p.notifications} />
          </Group>

          <div className="mt-2 flex items-center gap-3 text-[12px] text-muted">
            <button className="hover:text-fg" onClick={() => setAdvanced(!advanced)}>
              {advanced ? 'Hide advanced' : 'Advanced…'}
            </button>
            <span className="ml-auto tabular-nums">
              Step {window.step.version}
              {hostState.kind === 'connected' ? ` · host ${hostState.info.version}` : ''}
            </span>
          </div>
          {advanced && (
            <div className="fade-in mt-3 flex flex-col gap-3 rounded-xl p-4" style={{ background: 'var(--bg-hover)' }}>
              <Row label="Claude Code binary" hint="Only if it is not on PATH">
                <input
                  className="field w-[280px] font-mono text-[12px]"
                  placeholder={presets.find((x) => x.id === 'claude')?.resolvedPath ?? 'claude'}
                  value={p.claudePath ?? ''}
                  onChange={(e) => upd({ claudePath: e.target.value || undefined })}
                />
              </Row>
              <div className="flex gap-2">
                <button className="btn btn-secondary" onClick={() => void window.step.invoke('host:restartHost')}>
                  Restart session host
                </button>
                <button className="btn btn-secondary" onClick={() => void window.step.invoke('app:openPath', stepDir())}>
                  Open data folder
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function stepDir(): string {
  return window.step.platform === 'win32' ? '%USERPROFILE%\\.step' : '~/.step'
}

function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-line py-4 first:border-t-0">
      <div className="mb-3">
        <div className="text-[13px] font-semibold">{title}</div>
        {hint && <div className="mt-0.5 text-[12px] text-muted">{hint}</div>}
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4">
      <div className="w-[140px] shrink-0">
        <div className="text-[13px]">{label}</div>
        {hint && <div className="text-[11.5px] text-muted">{hint}</div>}
      </div>
      <div className="flex flex-1 items-center gap-2">{children}</div>
    </div>
  )
}

function Toggle({ label, value, onChange, disabled }: { label: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="flex items-center gap-3" style={{ opacity: disabled ? 0.5 : 1 }}>
      <button
        role="switch"
        aria-checked={value}
        disabled={disabled}
        onClick={() => onChange(!value)}
        className="relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors"
        style={{ background: value ? 'var(--accent)' : 'var(--border-strong)' }}
      >
        <span
          className="absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white transition-all"
          style={{ left: value ? 18 : 2, boxShadow: '0 1px 2px rgba(0,0,0,0.25)' }}
        />
      </button>
      <span className="text-[13px]">{label}</span>
    </label>
  )
}

function CustomPresets({ list, onChange }: { list: CustomPreset[]; onChange: (l: CustomPreset[]) => void }) {
  const [draft, setDraft] = useState({ name: '', command: '' })
  const add = (): void => {
    if (!draft.name.trim() || !draft.command.trim()) return
    const parts = draft.command.trim().split(/\s+/)
    const id = 'custom-' + draft.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    onChange([...list.filter((c) => c.id !== id), { id, name: draft.name.trim(), command: parts[0], args: parts.slice(1), color: '#9ca3af' }])
    setDraft({ name: '', command: '' })
  }
  return (
    <div className="mt-1">
      {list.map((c) => (
        <div key={c.id} className="mb-1.5 flex items-center gap-2">
          <span className="w-[120px] truncate">{c.name}</span>
          <span className="flex-1 truncate font-mono text-[11.5px] text-muted">{[c.command, ...c.args].join(' ')}</span>
          <button className="icon-btn h-6 w-6" onClick={() => onChange(list.filter((x) => x.id !== c.id))} title="Remove">
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <input className="field w-[120px]" placeholder="Launcher name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        <input
          className="field flex-1 font-mono text-[12px]"
          placeholder="command --flags"
          value={draft.command}
          onChange={(e) => setDraft({ ...draft, command: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button className="icon-btn" onClick={add} title="Add launcher">
          <Plus size={14} />
        </button>
      </div>
    </div>
  )
}
