import { useUpdates } from '@/stores/updates'

/** Title-bar pill that appears once a newer release is known about. */
export function UpdatePill() {
  const state = useUpdates((s) => s.state)
  const install = useUpdates((s) => s.install)
  if (state.kind !== 'available' && state.kind !== 'downloading' && state.kind !== 'ready') return null

  const label = state.kind === 'ready' ? 'Restart to update' : state.kind === 'downloading' ? `Downloading ${state.percent}%` : 'Update available'
  const title =
    state.kind === 'ready'
      ? `${state.version} is ready. Restart to install it.`
      : state.kind === 'downloading'
        ? `Downloading ${state.version}`
        : state.direct
          ? `${state.version} · click to download`
          : `${state.version} · opens the download page`

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
        <span className="text-[12px] font-medium tabular-nums">{label}</span>
      </span>
    </button>
  )
}
