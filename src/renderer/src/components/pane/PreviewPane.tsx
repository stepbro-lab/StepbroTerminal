import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ExternalLink, RotateCw, X } from 'lucide-react'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { AgentLogo } from '../sidebar/AgentLogo'
import { t } from '@/lib/i18n'

/**
 * How long the pane keeps saying an agent is using the page after its last move on it. Long enough
 * to cover the thinking between one click and the next; past it, the agent has moved on to other
 * work, and the page is no longer in use even though its turn goes on.
 */
const USING_MS = 8000

interface WebviewEl extends HTMLElement {
  src: string
  reload: () => void
  goBack: () => void
  canGoBack: () => boolean
  getURL: () => string
  getWebContentsId: () => number
  executeJavaScript?: (code: string) => Promise<unknown>
}

/**
 * A browser beside the terminal for whatever the dev server printed, or whatever an agent asked
 * to see. Runs in Electron's <webview>; once it is up, the main process is told which one, so an
 * agent can be given the page through the stepbro MCP server.
 */
export function PreviewPane({ url, sessionId }: { url: string; sessionId: string }) {
  const closeSide = useUi((s) => s.closeSide)
  const ref = useRef<WebviewEl | null>(null)
  const [current, setCurrent] = useState(url)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState<string | null>(null)
  // The agent at work on the page: the pane says so, in its color, while it moves on the page and
  // a moment past its last move, and no longer: once it goes on to other work, or its turn ends.
  const [usedBy, setUsedBy] = useState<string | null>(null)
  const [recent, setRecent] = useState(false)
  const status = useData((s) => s.sessions[sessionId]?.status)
  const working = status === 'working' || status === 'starting'
  const wasWorking = useRef(working)
  useEffect(() => {
    if (wasWorking.current && !working) setRecent(false)
    wasWorking.current = working
  }, [working])
  const using = usedBy && recent ? usedBy : null
  const presets = useData((s) => s.presets)
  const agent = using ? presets.find((p) => p.id === using) : undefined
  const agentName = agent?.name ?? using ?? ''
  const agentColor = agent?.color ?? '#8a8a90'

  useEffect(() => {
    let timer = 0
    const off = window.step.on('ui:previewActivity', (sid, presetId) => {
      if (sid !== sessionId) return
      setUsedBy(presetId)
      setRecent(true)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setRecent(false), USING_MS)
    })
    return () => {
      off()
      window.clearTimeout(timer)
    }
  }, [sessionId])

  // The cursor on the page follows the turn too: kept awake while it lasts, even between moves,
  // and let fade once it is over. The next move brings it back.
  useEffect(() => {
    const run = (code: string): void => void ref.current?.executeJavaScript?.(code).catch(() => undefined)
    if (!usedBy) return
    if (!using) {
      run(`(() => { const a = window.__stepAgent; if (a && a.root) a.root.style.opacity = '0'; return true })()`)
      return
    }
    const wake = (): void => run(`(() => { const a = window.__stepAgent; if (a) a.wake(); return true })()`)
    wake()
    const timer = window.setInterval(wake, 4000)
    return () => window.clearInterval(timer)
  }, [usedBy, using])

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
    const onReady = (): void => {
      try {
        window.step.send('preview:attached', sessionId, el.getWebContentsId())
      } catch {
        /* not attached yet; the next dom-ready will do */
      }
    }
    el.addEventListener('did-start-loading', onStart)
    el.addEventListener('did-stop-loading', onStop)
    el.addEventListener('did-navigate', onNav)
    el.addEventListener('did-navigate-in-page', onNav)
    el.addEventListener('did-fail-load', onFail)
    // As early as the view exists, so the page's first console lines are caught too; dom-ready again in case.
    el.addEventListener('did-attach', onReady)
    el.addEventListener('dom-ready', onReady)
    return () => {
      el.removeEventListener('did-start-loading', onStart)
      el.removeEventListener('did-stop-loading', onStop)
      el.removeEventListener('did-navigate', onNav)
      el.removeEventListener('did-navigate-in-page', onNav)
      el.removeEventListener('did-fail-load', onFail)
      el.removeEventListener('did-attach', onReady)
      el.removeEventListener('dom-ready', onReady)
      window.step.send('preview:detached', sessionId)
    }
  }, [sessionId])

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
        <button className="icon-btn" title={t('Close preview')} onClick={() => closeSide(sessionId)}>
          <X size={15} />
        </button>
      </div>
      {using && (
        <div className="fade-in flex h-7 shrink-0 items-center gap-2 px-3 text-[12px] font-medium" style={{ background: `color-mix(in srgb, ${agentColor} 14%, transparent)`, color: agentColor }}>
          <AgentLogo presetId={using} size={13} />
          <span className="min-w-0 flex-1 truncate">{t('{agent} is using this page', { agent: agentName })}</span>
          <span className="pulse-once rounded-full" style={{ width: 7, height: 7, background: agentColor }} />
        </div>
      )}
      <div className="relative min-h-0 flex-1" style={{ background: '#fff', boxShadow: using ? `inset 0 0 0 2px ${agentColor}` : undefined, transition: 'box-shadow 200ms' }}>
        {/* @ts-expect-error webview is an Electron element, not a React intrinsic */}
        <webview ref={ref} src={url} style={{ width: '100%', height: '100%' }} allowpopups="false" />
        {failed && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[13px]" style={{ background: 'var(--card-fill, var(--bg-card))', color: 'var(--text-muted)' }}>
            <span>{failed}</span>
            <button className="btn btn-secondary" onClick={() => ref.current?.reload()}>{t('Try again')}</button>
          </div>
        )}
      </div>
    </div>
  )
}
