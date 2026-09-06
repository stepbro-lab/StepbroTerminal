import { useState } from 'react'
import { AlertTriangle, RotateCw } from 'lucide-react'
import { useData } from '@/stores/data'
import { t } from '@/lib/i18n'

export function HostBanner() {
  const hostState = useData((s) => s.hostState)
  const [busy, setBusy] = useState(false)
  if (hostState.kind === 'connected') return null
  if (hostState.kind === 'connecting') {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-muted">
        <RotateCw size={14} className="animate-spin" />{t('Connecting to the session host…')}</div>
    )
  }
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl text-attention" style={{ background: 'var(--bg-input)' }}>
        <AlertTriangle size={20} />
      </div>
      <div>
        <div className="text-[15px] font-medium">{t('The session host is not running')}</div>
        <pre className="mt-2 max-w-[520px] whitespace-pre-wrap rounded-md p-3 text-left font-mono text-[11.5px] text-muted" style={{ background: 'var(--bg-input)' }}>
          {hostState.message}
        </pre>
        <div className="mt-2 font-mono text-[11.5px] text-muted">{hostState.logPath}</div>
      </div>
      <button
        className="btn btn-primary disabled:opacity-50"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          try {
            await window.step.invoke('host:restartHost')
          } finally {
            setBusy(false)
          }
        }}
      >
        {t('Retry')}
      </button>
    </div>
  )
}
