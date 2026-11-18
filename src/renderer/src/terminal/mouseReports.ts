import type { Terminal } from '@xterm/xterm'

const SGR = /^\x1b\[<(\d+);\d+;\d+[Mm]$/
const URXVT = /^\x1b\[(\d+);\d+;\d+M$/

export function isHoverReport(data: string): boolean {
  const sgr = SGR.exec(data)
  const urxvt = sgr ? null : URXVT.exec(data)
  const cb = sgr ? Number(sgr[1]) : urxvt ? Number(urxvt[1]) - 32 : NaN
  return !Number.isNaN(cb) && (cb & 32) !== 0 && (cb & 3) === 3
}

// OpenCode asks for every mouse move (1003), and xterm clears the selection on each report.
export function keepSelectionWhileTheMouseMoves(term: Terminal): void {
  const core = (term as unknown as { _core?: { coreService?: { triggerDataEvent?: (data: string, wasUserInput?: boolean) => void } } })._core
  const cs = core?.coreService
  if (!cs || typeof cs.triggerDataEvent !== 'function') return
  const trigger = cs.triggerDataEvent.bind(cs)
  cs.triggerDataEvent = (data: string, wasUserInput = false) => trigger(data, wasUserInput && !isHoverReport(data))
}
