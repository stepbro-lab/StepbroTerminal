import type { Terminal as HeadlessTerminal } from '@xterm/headless'

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
