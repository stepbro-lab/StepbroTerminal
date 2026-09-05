import { useEffect, useState } from 'react'
import type { AppStats, Session, SessionStats } from '@shared/types'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { killSession } from '@/lib/actions'
import { defaultTitle, rowPresetId } from '@/lib/sidebarModel'
import { AgentLogo } from '../sidebar/AgentLogo'
import { Row, Section, SmallButton } from './controls'
import { t } from '@/lib/i18n'

const POLL_MS = 2000
const platform = window.step.platform

export function formatBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`
  if (n >= 1024 ** 2) return `${Math.round(n / 1024 ** 2)} MB`
  return `${Math.round(n / 1024)} KB`
}

export function formatCpu(n: number): string {
  return `${n < 10 ? n.toFixed(1) : Math.round(n)}%`
}

function revealLabel(): string {
  return platform === 'darwin' ? t('Show in Finder') : platform === 'win32' ? t('Show in Explorer') : t('Show in file manager')
}

/** Memory, the terminals running right now and where things live on disk. Polls while it is on screen. */
export function ResourceSections() {
  const sessions = useData((s) => s.sessions)
  const presets = useData((s) => s.presets)
  const [stats, setStats] = useState<AppStats | null>(null)
  const [paths, setPaths] = useState<{ data: string; hostLog: string } | null>(null)
  const [round, setRound] = useState(0)

  useEffect(() => {
    void window.step.invoke('app:paths').then(setPaths)
  }, [])

  // CPU is measured between two looks, so the first answer reads 0 and the next one, a moment later, is real.
  useEffect(() => {
    let alive = true
    let timer: number | undefined
    const poll = async (): Promise<void> => {
      try {
        const next = await window.step.invoke('stats:get')
        if (alive) setStats(next)
      } catch {
        /* the host is away; the next round will tell */
      }
      if (alive) timer = window.setTimeout(() => void poll(), POLL_MS)
    }
    void poll()
    return () => {
      alive = false
      if (timer) window.clearTimeout(timer)
    }
  }, [round])

  const host = stats?.host ?? null
  const running = (host?.sessions ?? []).filter((r) => sessions[r.id]).sort((a, b) => b.cpu - a.cpu || b.memory - a.memory)
  const totalCpu = running.reduce((n, r) => n + r.cpu, 0)
  const totalMem = running.reduce((n, r) => n + r.memory, 0)
  const open = (s: Session): void => {
    const ui = useUi.getState()
    ui.setSettingsOpen(false)
    ui.setActiveProject(s.projectPath)
    ui.setActive(s.id)
  }
  const value = (text: string): React.ReactNode => <span className="text-[12.5px] tabular-nums text-muted">{text}</span>

  return (
    <>
      <Section title={t('Memory')} description={t('What the app and its session host are using right now.')}>
        <Row label={t('App')} hint={t('Window, main process and helpers')}>
          {value(stats ? formatBytes(stats.app) : '…')}
        </Row>
        <Row label={t('Session host')} hint={host ? `pid ${host.pid}` : t('Waiting for the host…')}>
          {value(host ? formatBytes(host.memory) : '…')}
        </Row>
        <Row label={t('Scrollback on disk')} hint={host ? t('{n} sessions kept, with what they printed', { n: host.sessionsOnDisk }) : undefined}>
          {value(host ? formatBytes(host.scrollbackBytes) : '…')}
        </Row>
      </Section>

      <Section
        title={t('Running terminals')}
        description={
          running.length
            ? t('{n} running · {cpu} CPU · {mem} memory. Sorted by CPU use.', { n: running.length, cpu: formatCpu(totalCpu), mem: formatBytes(totalMem) })
            : t('Nothing running right now.')
        }
        action={<SmallButton onClick={() => setRound((r) => r + 1)}>{t('Refresh')}</SmallButton>}
      >
        {running.map((r) => {
          const s = sessions[r.id]
          const presetId = rowPresetId(s)
          const preset = presets.find((p) => p.id === presetId)
          return <TerminalRow key={r.id} stats={r} session={s} presetId={presetId} presetName={preset?.name ?? presetId} color={preset?.color ?? '#8a8a90'} onOpen={() => open(s)} />
        })}
      </Section>

      <Section title={t('Diagnostics')} description={t('Where StepbroTerminal keeps session data, and the host log with hook and MCP traffic.')}>
        <Row label={t('Session data')} hint={paths?.data}>
          <SmallButton onClick={() => paths && void window.step.invoke('app:openPath', paths.data)}>{revealLabel()}</SmallButton>
        </Row>
        <Row label={t('Host log')} hint={paths?.hostLog}>
          <SmallButton onClick={() => paths && void window.step.invoke('app:revealPath', paths.hostLog)}>{revealLabel()}</SmallButton>
        </Row>
      </Section>
    </>
  )
}

function TerminalRow({
  stats: r,
  session: s,
  presetId,
  presetName,
  color,
  onOpen
}: {
  stats: SessionStats
  session: Session
  presetId: string
  presetName: string
  color: string
  onOpen: () => void
}) {
  const procs = r.processes === 1 ? t('1 process') : t('{n} processes', { n: r.processes })
  const hint = `${presetName} · pid ${r.pid} · ${procs}`
  return (
    <div className="setting-row">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-line" style={{ color }}>
          <AgentLogo presetId={presetId} size={14} />
        </span>
        <div className="min-w-0">
          <div className="truncate text-[13px] text-fg">{s.title || defaultTitle(s)}</div>
          <div className="truncate text-[11.5px] text-muted" title={hint}>
            {hint}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-5">
        <Metric value={formatCpu(r.cpu)} label="CPU" />
        <Metric value={formatBytes(r.memory)} label={t('Memory')} />
        <div className="flex items-center gap-1.5">
          <SmallButton onClick={onOpen}>{t('Open')}</SmallButton>
          <SmallButton tone="danger" onClick={() => killSession(s.id)}>
            {t('Stop')}
          </SmallButton>
        </div>
      </div>
    </div>
  )
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="w-16 text-right">
      <div className="text-[12.5px] tabular-nums text-fg">{value}</div>
      <div className="text-[10.5px] text-muted">{label}</div>
    </div>
  )
}
