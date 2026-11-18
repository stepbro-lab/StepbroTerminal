import gsap from 'gsap'
import { Flip } from 'gsap/Flip'
import type { LayoutNode } from '@/lib/layout'
import { registry } from '@/terminal/TerminalRegistry'

gsap.registerPlugin(Flip)

let remembered: Flip.FlipState | null = null
let settled: Promise<void> = Promise.resolve()
const SETTLE_MAX_MS = 700

export const paneMotionSettled = (): Promise<void> => Promise.race([settled, new Promise<void>((r) => setTimeout(r, SETTLE_MAX_MS))])

const reduced = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const cards = (): HTMLElement[] => Array.from(document.querySelectorAll<HTMLElement>('[data-pane]'))

export function shapeOf(node: LayoutNode | null): string {
  if (!node) return ''
  if (node.kind === 'leaf') return node.id
  return `(${node.dir}:${shapeOf(node.a)}|${shapeOf(node.b)})`
}

export function rememberPanes(): void {
  if (reduced()) return
  const els = cards()
  remembered = els.length ? Flip.getState(els) : null
}

export function movePanes(): void {
  const state = remembered
  remembered = null
  if (!state || reduced()) return
  const els = cards()
  if (!els.length) return
  registry.holdFits()
  let released = false
  let done: () => void = () => {}
  settled = new Promise<void>((r) => {
    done = r
  })
  const release = (): void => {
    if (released) return
    released = true
    registry.releaseFits()
    done()
  }
  try {
    Flip.from(state, {
      targets: els,
      duration: 0.3,
      ease: 'power3.out',
      absolute: true,
      onEnter: (entering) => gsap.fromTo(entering, { opacity: 0, scale: 0.97 }, { opacity: 1, scale: 1, duration: 0.3, ease: 'power3.out', clearProps: 'opacity,scale' }),
      onComplete: release,
      onInterrupt: release
    })
  } catch {
    release()
  }
}
