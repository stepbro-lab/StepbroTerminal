import type { Terminal as HeadlessTerminal } from '@xterm/headless'

/**
 * The modes a screen is in that the serializer leaves out, as the sequences that set them again.
 * It writes back whether a program follows the mouse (1000, 1002, 1003) but not how the reports
 * are encoded, so a screen brought back for a window that opens, reloads or reconnects went on
 * reporting the mouse in the old X10 bytes. Codex asks for SGR (1006) once, when it starts, and
 * takes those bytes for typing: every move of the mouse filled its prompt with "[MC…". Reaches
 * into xterm's core: if that ever moves, the screen comes back as it did before.
 */
export function modesSerializeMisses(screen: HeadlessTerminal): string {
  const core = (screen as unknown as { _core?: { coreMouseService?: { activeEncoding?: string } } })._core
  switch (core?.coreMouseService?.activeEncoding) {
    case 'SGR':
      return '\x1b[?1006h'
    case 'SGR_PIXELS':
      return '\x1b[?1016h'
    default:
      return ''
  }
}
