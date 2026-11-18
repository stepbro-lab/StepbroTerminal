export function pacePieces(text: string, max: number): string[] {
  const pieces: string[] = []
  let cur = ''
  let bytes = 0
  for (const ch of text) {
    const n = Buffer.byteLength(ch, 'utf8')
    if (bytes + n > max) {
      const nl = cur.lastIndexOf('\n')
      if (nl >= Math.floor(cur.length * 0.6)) {
        pieces.push(cur.slice(0, nl + 1))
        cur = cur.slice(nl + 1)
        bytes = Buffer.byteLength(cur, 'utf8')
      } else {
        pieces.push(cur)
        cur = ''
        bytes = 0
      }
    }
    cur += ch
    bytes += n
  }
  if (cur) pieces.push(cur)
  return pieces
}
