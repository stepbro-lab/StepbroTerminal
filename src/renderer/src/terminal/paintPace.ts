import type { Terminal } from '@xterm/xterm'
import { currentPace, onPace, type Pace } from '@/lib/windowPace'

export const SLOW_FRAME_MS = 200

type Entry = { isIntersecting?: boolean; intersectionRatio: number }
type RenderService = { _handleIntersectionChange?: (entry: Entry) => void }

interface Held {
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
  if (pace === 'slow') {
    pulse = window.setInterval(() => {
      for (const h of held) {
        h.draw(true)
        h.draw(false)
      }
    }, SLOW_FRAME_MS)
  }
}

export function paceDrawing(term: Terminal): () => void {
  const rs = (term as unknown as { _core?: { _renderService?: RenderService } })._core?._renderService
  const own = rs?._handleIntersectionChange?.bind(rs)
  if (!rs || !own) return () => {}
  const h: Held = {
    onPage: true,
    draw: (on) => own({ isIntersecting: on && h.onPage, intersectionRatio: on && h.onPage ? 1 : 0 })
  }

  rs._handleIntersectionChange = (entry) => {
    h.onPage = entry.isIntersecting ?? entry.intersectionRatio > 0
    h.draw(currentPace() === 'live')
  }
  held.add(h)
  if (!following) {
    following = true
    onPace(follow)
    follow(currentPace())
  } else h.draw(currentPace() === 'live')
  return () => {
    held.delete(h)
    rs._handleIntersectionChange = own
    own({ isIntersecting: h.onPage, intersectionRatio: h.onPage ? 1 : 0 })
  }
}
