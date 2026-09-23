import type { Terminal } from '@xterm/xterm'
import { currentPace, onPace, type Pace } from '@/lib/windowPace'

/**
 * How often the terminals are drawn, by how much of the window can be seen (see windowPace).
 *
 * What the terminals are sent is still read as it comes, at full speed, whatever happens here: the
 * host waits on that, and the programs with it. Only the drawing is held back. In front, the
 * terminals are drawn as they change; with the window behind another, a few times a second; with it
 * minimised or hidden, not at all. Drawing comes back in one go when it is seen.
 */

/** How often a terminal is drawn while the window is behind another: a few times a second. */
export const SLOW_FRAME_MS = 200

type Entry = { isIntersecting?: boolean; intersectionRatio: number }
type RenderService = { _handleIntersectionChange?: (entry: Entry) => void }

interface Held {
  /** Whether xterm's own watcher last said the terminal is on the page, which still counts. */
  onPage: boolean
  draw: (on: boolean) => void
}

const held = new Set<Held>()
let pulse = 0
let following = false

function follow(pace: Pace): void {
  window.clearInterval(pulse)
  pulse = 0
  for (const h of held) h.draw(pace === 'live')
  // Slowed down: every so often, one frame with whatever changed since the last.
  if (pace === 'slow') {
    pulse = window.setInterval(() => {
      for (const h of held) {
        h.draw(true)
        h.draw(false)
      }
    }, SLOW_FRAME_MS)
  }
}

/**
 * Puts a terminal's drawing under the window's pace. It works through the pause xterm already has
 * for a terminal scrolled off the page, which keeps reading what it is sent and draws everything
 * once when it is let go; that pause is private to xterm, and without the name it reaches for the
 * terminal simply draws as it always did. Returns what takes it back out.
 */
export function paceDrawing(term: Terminal): () => void {
  const rs = (term as unknown as { _core?: { _renderService?: RenderService } })._core?._renderService
  const own = rs?._handleIntersectionChange?.bind(rs)
  if (!rs || !own) return () => {}
  const h: Held = {
    onPage: true,
    draw: (on) => own({ isIntersecting: on && h.onPage, intersectionRatio: on && h.onPage ? 1 : 0 })
  }
  // xterm's own watcher still has its say: a terminal off the page stays paused whatever the pace.
  rs._handleIntersectionChange = (entry) => {
    h.onPage = entry.isIntersecting ?? entry.intersectionRatio > 0
    h.draw(currentPace() === 'live')
  }
  held.add(h)
  if (!following) {
    following = true
    onPace(follow)
    // The window may already be behind another by now, and no change of pace would say so.
    follow(currentPace())
  } else h.draw(currentPace() === 'live')
  return () => {
    held.delete(h)
    rs._handleIntersectionChange = own
    own({ isIntersecting: h.onPage, intersectionRatio: h.onPage ? 1 : 0 })
  }
}
