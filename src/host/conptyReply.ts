// ConPTY blocks a new shell for about 3s until the terminal answers its device attributes probe.
// Its cursor position probe must stay unanswered: with PSReadLine 2.0 the reply eats the first key.
const DA = /\x1b\[0?c/

export function conptyReply(chunk: string): string {
  return DA.test(chunk) ? '\x1b[?1;2c' : ''
}

export function isControlOnly(chunk: string): boolean {
  const stripped = chunk
    .replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, '')
    .replace(/\x1b[[\]()#;?]*[0-9;]*[A-Za-z@`~]/g, '')
    .replace(/\x1b./g, '')
    .replace(/[\x00-\x1f\x7f]/g, '')
  return stripped.trim().length === 0
}

const PROBE_REPLIES = /\x1b\[\?[\d;]*c|\x1b\[\d+;\d+R/g

export function stripProbeReplies(input: string): string {
  return input.replace(PROBE_REPLIES, '')
}

export interface Owed {
  da: number
  cpr: number
}

export function probeQueries(chunk: string): Owed {
  return { da: (chunk.match(/\x1b\[0?c/g) ?? []).length, cpr: (chunk.match(/\x1b\[6n/g) ?? []).length }
}

export function dropOwedReplies(input: string, owed: Owed): string {
  return input.replace(PROBE_REPLIES, (reply) => {
    const kind = reply.endsWith('c') ? 'da' : 'cpr'
    if (owed[kind] <= 0) return reply
    owed[kind]--
    return ''
  })
}

const QUERIES = /\x1b\][\d;]*;\?(\x07|\x1b\\)|\x1b\[>?0?c|\x1b\[6n/

export function hasQuery(chunk: string): boolean {
  return QUERIES.test(chunk)
}

const REPLIES = /\x1b\[\?[\d;]*c|\x1b\[\d+;\d+R|\x1b\][\d;]*;rgb:[\da-fA-F/]*(\x07|\x1b\\)/g

export function stripStaleReplies(input: string): string {
  return input.replace(REPLIES, '')
}
