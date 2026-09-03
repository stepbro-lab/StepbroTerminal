import { describe, expect, it } from 'vitest'
import { conptyReply, isControlOnly } from './conptyReply'

describe('conptyReply', () => {
  it('answers the device-attributes probe', () => {
    expect(conptyReply('\x1b[c')).toBe('\x1b[?1;2c')
    expect(conptyReply('\x1b[0c')).toBe('\x1b[?1;2c')
    // The real ConPTY startup chunk carries several sequences at once: answer both, DA first.
    expect(conptyReply('\x1b[6n\x1b[c\x1b[?1004h\x1b[?9001h')).toBe('\x1b[?1;2c\x1b[1;1R')
  })

  it('answers the cursor-position probe', () => {
    expect(conptyReply('\x1b[6n')).toBe('\x1b[1;1R')
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
