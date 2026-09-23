import { describe, expect, it } from 'vitest'
import { conptyReply, dropOwedReplies, hasQuery, isControlOnly, probeQueries, stripProbeReplies, stripStaleReplies } from './conptyReply'

describe('conptyReply', () => {
  it('answers the device-attributes probe', () => {
    expect(conptyReply('\x1b[c')).toBe('\x1b[?1;2c')
    expect(conptyReply('\x1b[0c')).toBe('\x1b[?1;2c')
    // The real ConPTY startup chunk carries several sequences at once; only DA gets an answer.
    expect(conptyReply('\x1b[6n\x1b[c\x1b[?1004h\x1b[?9001h')).toBe('\x1b[?1;2c')
  })

  it('leaves the cursor-position probe alone: answering it makes PowerShell swallow the first key', () => {
    expect(conptyReply('\x1b[6n')).toBe('')
  })

  it('stays silent for ordinary output', () => {
    expect(conptyReply('Microsoft Windows [Version 10]')).toBe('')
    expect(conptyReply('PS C:\\repo> ')).toBe('')
    expect(conptyReply('')).toBe('')
  })
})

describe('isControlOnly', () => {
  it('is true for ConPTY init and escape-only chunks', () => {
    expect(isControlOnly('\x1b[6n\x1b[c\x1b[?1004h\x1b[?9001h')).toBe(true)
    expect(isControlOnly('\x1b[?7l\x1b[?7h')).toBe(true)
    expect(isControlOnly('\x1b]0;title\x07')).toBe(true)
    expect(isControlOnly('\r\n')).toBe(true)
  })

  it('is false once the shell prints something', () => {
    expect(isControlOnly('Microsoft Windows [Version 10]')).toBe(false)
    expect(isControlOnly('\x1b[32mPS C:\\>\x1b[0m')).toBe(false)
  })
})

describe('stripProbeReplies', () => {
  it('drops the replies a view sends to the startup probes', () => {
    expect(stripProbeReplies('\x1b[?1;2c')).toBe('')
    expect(stripProbeReplies('\x1b[24;1R')).toBe('')
    expect(stripProbeReplies('\x1b[1;1R\x1b[?1;2c')).toBe('')
  })

  it('keeps what the user typed around them', () => {
    expect(stripProbeReplies('\x1b[?1;2cls\r')).toBe('ls\r')
    expect(stripProbeReplies('echo hola\r')).toBe('echo hola\r')
    expect(stripProbeReplies('\x1b[A')).toBe('\x1b[A')
  })
})

const ESC = String.fromCharCode(27)
const BEL = String.fromCharCode(7)
const ST = ESC + String.fromCharCode(92)

describe('hasQuery', () => {
  it('sees a program asking what colours the terminal draws in', () => {
    expect(hasQuery(`${ESC}]10;?${ST}`)).toBe(true)
    expect(hasQuery(`${ESC}]11;?${BEL}`)).toBe(true)
  })

  it('sees it asking what kind of terminal it is, and where the cursor sits', () => {
    expect(hasQuery(`${ESC}[c`)).toBe(true)
    expect(hasQuery(`${ESC}[6n`)).toBe(true)
  })

  it('does not mistake ordinary output for a question', () => {
    expect(hasQuery('Ask Codex to do anything')).toBe(false)
    expect(hasQuery(`${ESC}[1;32mgreen${ESC}[0m`)).toBe(false)
    expect(hasQuery(`${ESC}]0;a window title${BEL}`)).toBe(false)
  })
})

describe('stripStaleReplies', () => {
  it('drops the colours a terminal reports, which is what lands in an agent prompt', () => {
    const reply = `${ESC}]10;rgb:e5e5/e2e2/e1e1${ST}${ESC}]11;rgb:1616/1616/1919${ST}`
    expect(stripStaleReplies(reply)).toBe('')
  })

  it('drops them however they are terminated', () => {
    expect(stripStaleReplies(`${ESC}]11;rgb:0000/0000/0000${BEL}`)).toBe('')
  })

  it('still drops what the probe filter dropped', () => {
    expect(stripStaleReplies(`${ESC}[?1;2c`)).toBe('')
    expect(stripStaleReplies(`${ESC}[24;80R`)).toBe('')
  })

  it('leaves typing alone, including anything that merely looks technical', () => {
    expect(stripStaleReplies('npm run dev')).toBe('npm run dev')
    expect(stripStaleReplies('rgb:1616/1616/1919')).toBe('rgb:1616/1616/1919')
    // Arrow keys and Enter are input, not answers.
    expect(stripStaleReplies(`${ESC}[A`)).toBe(`${ESC}[A`)
    expect(stripStaleReplies(String.fromCharCode(13))).toBe(String.fromCharCode(13))
  })

  it('keeps the rest of a chunk that carried an answer along with it', () => {
    expect(stripStaleReplies(`${ESC}]11;rgb:1616/1616/1919${ST}ls`)).toBe('ls')
  })
})

describe('the answers owed to ConPTY\'s probe', () => {
  it('counts what ConPTY asked', () => {
    expect(probeQueries('\x1b[6n\x1b[c')).toEqual({ da: 1, cpr: 1 })
    expect(probeQueries('\x1b[?9001h\x1b[?1004h\x1b[0c')).toEqual({ da: 1, cpr: 0 })
    expect(probeQueries('\x1b[H\x1b[2J')).toEqual({ da: 0, cpr: 0 })
  })

  it('drops exactly the answers owed, and lets the next ones through', () => {
    const owed = { da: 1, cpr: 1 }
    expect(dropOwedReplies('\x1b[1;1R\x1b[?1;2c', owed)).toBe('')
    expect(owed).toEqual({ da: 0, cpr: 0 })
    // The program's own question, answered afterwards.
    expect(dropOwedReplies('\x1b[3;7R', owed)).toBe('\x1b[3;7R')
  })

  it('keeps what a person typed alongside', () => {
    const owed = { da: 0, cpr: 1 }
    expect(dropOwedReplies('ls\x1b[1;1R -la', owed)).toBe('ls -la')
    expect(dropOwedReplies('\x1b[?1;2c', owed)).toBe('\x1b[?1;2c')
  })
})
