import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ExternalLink, RotateCw, X } from 'lucide-react'
import { useUi } from '@/stores/ui'
import { t } from '@/lib/i18n'

interface WebviewEl extends HTMLElement {
  src: string
  reload: () => void
  goBack: () => void
  canGoBack: () => boolean
  getURL: () => string
}

/** A browser beside the terminal for whatever the dev server printed. Runs in Electron's <webview>. */
export function PreviewPane({ url }: { url: string }) {
  const setSide = useUi((s) => s.setSide)
  const ref = useRef<WebviewEl | null>(null)
  const [current, setCurrent] = useState(url)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState<string | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onStart = (): void => {
      setLoading(true)
      setFailed(null)
    }
    const onStop = (): void => setLoading(false)
    const onNav = (e: Event & { url?: string }): void => {
      if (e.url) setCurrent(e.url)
    }
    const onFail = (e: Event & { errorDescription?: string; isMainFrame?: boolean }): void => {
      if (e.isMainFrame === false) return
      setLoading(false)
      setFailed(e.errorDescription ?? t('Could not load'))
    }
    el.addEventListener('did-start-loading', onStart)
    el.addEventListener('did-stop-loading', onStop)
    el.addEventListener('did-navigate', onNav)
    el.addEventListener('did-navigate-in-page', onNav)
    el.addEventListener('did-fail-load', onFail)
    return () => {
      el.removeEventListener('did-start-loading', onStart)
      el.removeEventListener('did-stop-loading', onStop)
      el.removeEventListener('did-navigate', onNav)
      el.removeEventListener('did-navigate-in-page', onNav)
      el.removeEventListener('did-fail-load', onFail)
    }
  }, [])

  return (
    <div className="card relative flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-line pl-1.5 pr-1.5">
        <button className="icon-btn" title={t('Back')} onClick={() => ref.current?.canGoBack() && ref.current.goBack()}>
          <ArrowLeft size={14} />
        </button>
        <button className="icon-btn" title={t('Reload')} onClick={() => ref.current?.reload()}>
          <RotateCw size={13} className={loading ? 'animate-spin' : undefined} />
        </button>
        <span className="mx-1 min-w-0 flex-1 truncate rounded-md px-2 py-1 font-mono text-[11.5px] text-secondary" style={{ background: 'var(--bg-hover)' }}>
          {current}
        </span>
        <button className="icon-btn" title={t('Open in your browser')} onClick={() => void window.step.invoke('app:openExternal', current)}>
          <ExternalLink size={13} />
        </button>
        <button className="icon-btn" title={t('Close preview')} onClick={() => setSide(null)}>
          <X size={15} />
        </button>
      </div>
      <div className="relative min-h-0 flex-1" style={{ background: '#fff' }}>
        {/* @ts-expect-error webview is an Electron element, not a React intrinsic */}
        <webview ref={ref} src={url} style={{ width: '100%', height: '100%' }} allowpopups="false" />
        {failed && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[13px]" style={{ background: 'var(--bg-card)', color: 'var(--text-muted)' }}>
            <span>{failed}</span>
            <button className="btn btn-secondary" onClick={() => ref.current?.reload()}>{t('Try again')}</button>
          </div>
        )}
      </div>
    </div>
  )
}
