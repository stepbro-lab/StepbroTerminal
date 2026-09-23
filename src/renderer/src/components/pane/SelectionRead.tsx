import { useEffect, useState } from 'react'
import { AudioLines } from 'lucide-react'
import { useUi } from '@/stores/ui'
import { useVoice } from '@/stores/voice'
import { registry } from '@/terminal/TerminalRegistry'
import { t } from '@/lib/i18n'

/**
 * Select something in a terminal and this appears where the selection ended: press it and the
 * voice reads it out.
 *
 * It exists because of where a selection goes. Reaching a menu means moving the mouse and
 * clicking, and a click in a terminal is what clears a selection, so by the time the menu is
 * open there is nothing left to read. This sits right where the mouse already is, and presses
 * without taking the selection with it: the press is refused before it begins, which leaves both
 * the selection and the terminal's focus exactly where they were.
 */
export function SelectionRead() {
  const activeId = useUi((s) => s.activeId)
  const read = useVoice((s) => s.read)
  const [at, setAt] = useState<{ x: number; y: number; text: string } | null>(null)

  useEffect(() => setAt(null), [activeId])

  useEffect(() => {
    // Watched from the document rather than from a terminal's own element: a pane is mounted and
    // unmounted as the layout moves, and an element found once is an element soon out of date.
    const terminal = (): { term: import('@xterm/xterm').Terminal; el: HTMLElement } | null => {
      const id = useUi.getState().activeId
      const entry = id ? registry.get(id) : undefined
      const el = entry?.term.element
      return entry && el ? { term: entry.term, el } : null
    }
    const hide = (): void => setAt(null)
    const onUp = (ev: MouseEvent): void => {
      // The left button only. A right-click opens the menu on the way down, and this, coming up
      // after it, put the button back on screen over the menu, which offers the same thing anyway.
      if (ev.button !== 0) return
      const here = terminal()
      if (!here || !here.el.contains(ev.target as Node)) return
      // A moment after the button comes up, so xterm has settled on what is selected.
      window.setTimeout(() => {
        const text = here.term.getSelection().trim()
        setAt(text ? { x: ev.clientX, y: ev.clientY, text } : null)
      }, 0)
    }
    const onDown = (ev: MouseEvent): void => {
      // Pressing the button itself refuses the press, so this never sees it.
      if (!(ev.target as Element | null)?.closest?.('.sel-read')) hide()
    }
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key === 'Escape') hide()
    }
    document.addEventListener('mouseup', onUp, true)
    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('wheel', hide, true)
    window.addEventListener('resize', hide)
    window.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mouseup', onUp, true)
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('wheel', hide, true)
      window.removeEventListener('resize', hide)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [])

  if (!at) return null
  return (
    <button
      className="sel-read"
      style={{ left: Math.min(at.x + 8, window.innerWidth - 170), top: Math.min(at.y + 10, window.innerHeight - 44) }}
      // Refusing the press is what keeps the selection, and the terminal's focus, where they are.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        read(at.text)
        setAt(null)
      }}
    >
      <AudioLines size={12} />
      {t('Read aloud')}
    </button>
  )
}
