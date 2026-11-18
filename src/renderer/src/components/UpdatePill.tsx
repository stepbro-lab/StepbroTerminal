import { useUpdates } from '@/stores/updates'
import { t } from '@/lib/i18n'

export function UpdatePill() {
  const state = useUpdates((s) => s.state)
  const install = useUpdates((s) => s.install)
  if (state.kind !== 'available' && state.kind !== 'downloading' && state.kind !== 'ready') return null

  const label = state.kind === 'ready' ? t('Restart to update') : state.kind === 'downloading' ? t('Downloading {percent}%', { percent: state.percent }) : t('Update available')
  const title =
    state.kind === 'ready'
      ? t('{version} is ready. Restart to install it.', { version: state.version })
      : state.kind === 'downloading'
        ? t('Downloading {version}', { version: state.version })
        : state.direct
          ? t('{version} · click to download', { version: state.version })
          : t('{version} · opens the download page', { version: state.version })

  return (
    <button
      className="icon-btn no-drag"
      style={{ width: 'auto', paddingLeft: 7, paddingRight: 9 }}
      title={title}
      disabled={state.kind === 'downloading'}
      onClick={() => void install()}
    >
      <span className="flex items-center gap-1.5">
        <span className="rounded-full" style={{ width: 7, height: 7, background: 'var(--accent)' }} />
        <span className="text-[12.5px] font-medium tabular-nums">{label}</span>
      </span>
    </button>
  )
}
