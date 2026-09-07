import gsap from 'gsap'
import { Flip } from 'gsap/Flip'
import type { LayoutNode } from '@/lib/layout'
import { registry } from '@/terminal/TerminalRegistry'

gsap.registerPlugin(Flip)

/**
 * Panes move rather than jump when the layout changes: a split slides the pane over to make room
 * and the new one fades in where it lands; closing one lets the others glide into its space.
 * The cards are remembered where they stand just before React lays them out anew (the store
 * notifies before the render), then GSAP's Flip carries each from there to its new place.
 * Terminals do not refit while they travel; they fit once, where they end up.
 */
let remembered: Flip.FlipState | null = null
let settled: Promise<void> = Promise.resolve()

/** Resolves once the panes stand still: building a new terminal is heavy enough to stall a tween, so it waits for this. */
export const paneMotionSettled = (): Promise<void> => settled

const reduced = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const cards = (): HTMLElement[] => Array.from(document.querySelectorAll<HTMLElement>('[data-pane]'))

/** The arrangement without its proportions: which panes, split how. Dragging a gutter keeps it the same. */
export function shapeOf(node: LayoutNode | null): string {
  if (!node) return ''
  if (node.kind === 'leaf') return node.id
  return `(${node.dir}:${shapeOf(node.a)}|${shapeOf(node.b)})`
}

/** Before the layout changes, while every pane is still where it was. */
export function rememberPanes(): void {
  if (reduced()) return
  const els = cards()
  remembered = els.length ? Flip.getState(els) : null
}

/** After React laid the panes out anew: each travels from where it was to where it is now. */
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
  Flip.from(state, {
    targets: els,
    duration: 0.3,
    ease: 'power3.out',
    absolute: true,
    onEnter: (entering) => gsap.fromTo(entering, { opacity: 0, scale: 0.97 }, { opacity: 1, scale: 1, duration: 0.3, ease: 'power3.out', clearProps: 'opacity,scale' }),
    onComplete: release,
    onInterrupt: release
  })
}
