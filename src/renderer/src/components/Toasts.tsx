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
          className="toast-in pointer-events-auto max-w-[360px] rounded-lg border border-line bg-card px-3 py-2 text-left text-[12.5px] text-fg"
          style={{
            boxShadow: 'var(--shadow-pop)',
            borderLeft: `3px solid ${t.tone === 'error' ? 'var(--danger)' : t.tone === 'success' ? 'var(--success)' : 'var(--accent)'}`
          }}
        >
          {t.text}
        </button>
      ))}
    </div>
  )
}
