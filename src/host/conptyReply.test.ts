import { describe, expect, it } from 'vitest'
import { conptyReply, isControlOnly, stripProbeReplies } from './conptyReply'

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
