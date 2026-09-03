import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { registry } from '@/terminal/TerminalRegistry'

export function SearchBar({ id, onClose }: { id: string; onClose: () => void }) {
  const [q, setQ] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    ref.current?.focus()
  }, [])
  const opts = { caseSensitive: false, regex: false, decorations: undefined }
  const next = (): void => {
    if (q) registry.get(id)?.search.findNext(q, opts)
  }
  const prev = (): void => {
    if (q) registry.get(id)?.search.findPrevious(q, opts)
  }
  const close = (): void => {
    registry.get(id)?.search.clearDecorations()
    onClose()
    registry.focus(id)
  }
  return (
    <div className="fade-in flex items-center gap-0.5">
      <input
        ref={ref}
        className="field h-6 w-[200px]"
        placeholder="Find"
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          if (e.target.value) registry.get(id)?.search.findNext(e.target.value, { ...opts, incremental: true })
        }}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') (e.shiftKey ? prev : next)()
          if (e.key === 'Escape') close()
        }}
      />
      <button className="icon-btn h-6 w-6" onClick={prev} title="Previous (Shift+Enter)">
        <ChevronUp size={14} />
      </button>
      <button className="icon-btn h-6 w-6" onClick={next} title="Next (Enter)">
        <ChevronDown size={14} />
      </button>
      <button className="icon-btn h-6 w-6" onClick={close} title="Close (Esc)">
        <X size={14} />
      </button>
    </div>
  )
}
