import type { Terminal } from '@xterm/xterm'

const SGR = /^\x1b\[<(\d+);\d+;\d+[Mm]$/
const URXVT = /^\x1b\[(\d+);\d+;\d+M$/

/**
 * Whether what xterm is about to send is the report of a mouse moving with no button held, in the
 * SGR (1006) or urxvt (1015) encoding: the motion bit (32) set and the button bits saying "none" (3).
 * Modifier bits do not matter. The default encoding is sent as binary and never reaches here.
 */
export function isHoverReport(data: string): boolean {
  const sgr = SGR.exec(data)
  const urxvt = sgr ? null : URXVT.exec(data)
  const cb = sgr ? Number(sgr[1]) : urxvt ? Number(urxvt[1]) - 32 : NaN
  return !Number.isNaN(cb) && (cb & 32) !== 0 && (cb & 3) === 3
}

/**
 * OpenCode asks to hear about every move of the mouse (mode 1003), and xterm sends each report as
 * input from the person, which clears the selection: selecting text and moving the mouse at all
 * left nothing for Ctrl+C or Ctrl+Shift+C to copy. A move with no button held is not something the
 * person typed or clicked, so it no longer counts as such; presses, drags and the wheel still do.
 * Reaches into xterm's core: if that ever moves, the terminal simply behaves as before.
 */
export function keepSelectionWhileTheMouseMoves(term: Terminal): void {
  const core = (term as unknown as { _core?: { coreService?: { triggerDataEvent?: (data: string, wasUserInput?: boolean) => void } } })._core
  const cs = core?.coreService
  if (!cs || typeof cs.triggerDataEvent !== 'function') return
  const trigger = cs.triggerDataEvent.bind(cs)
  cs.triggerDataEvent = (data: string, wasUserInput = false) => trigger(data, wasUserInput && !isHoverReport(data))
}
