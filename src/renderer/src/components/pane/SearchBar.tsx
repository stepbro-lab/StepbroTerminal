import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import type { ISearchOptions } from '@xterm/addon-search'
import { registry } from '@/terminal/TerminalRegistry'
import { t } from '@/lib/i18n'

/**
 * Matches are painted by the terminal itself, not by the selection: while you type here the
 * terminal has no focus, and its inactive selection is too faint to notice. Every hit gets a
 * yellow wash and the current one a stronger orange, readable over both themes.
 */
const OPTIONS: ISearchOptions = {
  caseSensitive: false,
  regex: false,
  decorations: {
    matchBackground: '#f5c54266',
    matchBorder: '#f5c542aa',
    matchOverviewRuler: '#f5c542',
    activeMatchBackground: '#f59e0bcc',
    activeMatchBorder: '#f59e0b',
    activeMatchColorOverviewRuler: '#f59e0b'
  }
}

export function SearchBar({ id, onClose }: { id: string; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<{ index: number; count: number } | null>(null)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    ref.current?.focus()
    const search = registry.get(id)?.search
    if (!search) return
    // -1 means "too many to count"; the addon still highlights the active one.
    const sub = search.onDidChangeResults((r) => setHits({ index: r.resultIndex, count: r.resultCount }))
    return () => {
      sub.dispose()
      search.clearDecorations()
    }
  }, [id])

  const find = (text: string, dir: 'next' | 'prev', incremental = false): void => {
    const search = registry.get(id)?.search
    if (!search) return
    if (!text) {
      search.clearDecorations()
      setHits(null)
      return
    }
    const opts = incremental ? { ...OPTIONS, incremental: true } : OPTIONS
    const found = dir === 'next' ? search.findNext(text, opts) : search.findPrevious(text, opts)
    if (!found) setHits({ index: -1, count: 0 })
  }
  const close = (): void => {
    registry.get(id)?.search.clearDecorations()
    onClose()
    registry.focus(id)
  }
  const label = !q || !hits ? '' : hits.count === 0 ? t('No results') : hits.count < 0 ? `${hits.index + 1}/…` : `${hits.index + 1}/${hits.count}`
  return (
    <div className="fade-in flex items-center gap-0.5">
      <div className="relative">
        <input
          ref={ref}
          className="field h-6 w-[220px] pr-14"
          placeholder={t('Find')}
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            find(e.target.value, 'next', true)
          }}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') find(q, e.shiftKey ? 'prev' : 'next')
            if (e.key === 'Escape') close()
          }}
        />
        {label && (
          <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[11.5px] tabular-nums text-muted">{label}</span>
        )}
      </div>
      <button className="icon-btn h-6 w-6" onClick={() => find(q, 'prev')} title={t('Previous (Shift+Enter)')}>
        <ChevronUp size={14} />
      </button>
      <button className="icon-btn h-6 w-6" onClick={() => find(q, 'next')} title={t('Next (Enter)')}>
        <ChevronDown size={14} />
      </button>
      <button className="icon-btn h-6 w-6" onClick={close} title={t('Close (Esc)')}>
        <X size={14} />
      </button>
    </div>
  )
}
