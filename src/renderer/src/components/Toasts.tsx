import { useUi } from '@/stores/ui'

export function Toasts() {
  const toasts = useUi((s) => s.toasts)
  const dismiss = useUi((s) => s.dismissToast)
  if (!toasts.length) return null
  return (
    <div className="pointer-events-none absolute bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className="toast-in pointer-events-auto flex max-w-[360px] items-center gap-2.5 rounded-full py-1.5 pl-3 pr-3.5 text-left text-[12.5px] text-fg"
          style={{ background: 'var(--bg-elevated)', boxShadow: '0 0 0 1px var(--border-strong) inset, var(--shadow-pop)' }}
        >
          <span
            className="shrink-0 rounded-full"
            style={{ width: 7, height: 7, background: t.tone === 'error' ? 'var(--danger)' : t.tone === 'success' ? 'var(--success)' : 'var(--accent)' }}
          />
          <span className="truncate">{t.text}</span>
        </button>
      ))}
    </div>
  )
}
