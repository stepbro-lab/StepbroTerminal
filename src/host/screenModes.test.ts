import { describe, expect, it } from 'vitest'
import { Terminal as HeadlessTerminal } from '@xterm/headless'
import { SerializeAddon } from '@xterm/addon-serialize'
import { modesSerializeMisses } from './screenModes'

function screen(): { term: HeadlessTerminal; serializer: SerializeAddon } {
  const term = new HeadlessTerminal({ cols: 80, rows: 24, allowProposedApi: true })
  const serializer = new SerializeAddon()
  term.loadAddon(serializer as any)
  return { term, serializer }
}

const write = (term: HeadlessTerminal, data: string) => new Promise<void>((resolve) => term.write(data, resolve))
const encoding = (term: HeadlessTerminal) => (term as any)._core.coreMouseService.activeEncoding as string

/** The screen as a window that opens or reconnects gets it, written into a fresh terminal. */
async function broughtBack(term: HeadlessTerminal, serializer: SerializeAddon): Promise<HeadlessTerminal> {
  const fresh = screen().term
  await write(fresh, serializer.serialize({ scrollback: 1000 }) + modesSerializeMisses(term))
  return fresh
}

describe('a screen brought back for a window', () => {
  it('keeps the SGR mouse reports Codex asked for once, when it started', async () => {
    const { term, serializer } = screen()
    // What Codex 0.160 sends as it starts, and never again.
    await write(term, '\x1b[?1049h\x1b[?1000h\x1b[?1002h\x1b[?1003h\x1b[?1006h› Ask Codex to do anything')
    const back = await broughtBack(term, serializer)
    expect(back.modes.mouseTrackingMode).toBe('any')
    expect(encoding(back)).toBe('SGR')
  })

  it('keeps pixel reports too', async () => {
    const { term, serializer } = screen()
    await write(term, '\x1b[?1003h\x1b[?1016h')
    expect(encoding(await broughtBack(term, serializer))).toBe('SGR_PIXELS')
  })

  it('adds nothing for a screen in the default encoding', async () => {
    const { term } = screen()
    expect(modesSerializeMisses(term)).toBe('')
    await write(term, '\x1b[?1003h\x1b[?1006h\x1b[?1006l')
    expect(modesSerializeMisses(term)).toBe('')
  })
})
