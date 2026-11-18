const LITTLE = new Set(
  (
    'de del la las el los lo un una unos unas y e o u en con para por al a mi mis tu tus su sus que se ' +
    'the a an of for to and or in on at with from by my your its this that'
  ).split(' ')
)

const PREAMBLE = [
  /^(hola|oye|hey|hi|hello|buenas|buenos días|buenas tardes)\b[\s,!.]*/i,
  /^(por favor|porfa|pls|please)\b[\s,]*/i,
  /^(necesito|quiero|quisiera|me gustar[ií]a) que\s+/i,
  /^(puedes|podr[ií]as|me puedes|can you|could you|would you|i want you to|i need you to|i'd like you to)\s+/i,
  /^(ay[uú]dame a|help me( to)?)\s+/i
]

const bare = (w: string): string => w.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
const capital = (s: string): string => s.charAt(0).toLocaleUpperCase() + s.slice(1)

export function titleCandidates(title: string, fromPrompt = false): string[] {
  let t = title.replace(/\s+/g, ' ').trim()
  if (fromPrompt) {
    if (t.endsWith('…')) t = t.slice(0, -1).replace(/\s*\S*$/, '')
    for (let again = true; again; ) {
      again = false
      for (const re of PREAMBLE) {
        const next = t.replace(/^[¿¡]/, '').replace(re, '')
        if (next !== t.replace(/^[¿¡]/, '') && next.trim()) {
          t = next.trim()
          again = true
        }
      }
    }
    t = t.replace(/[\s,;:]*\b(por favor|porfa|please)\b[\s.!?]*$/i, '') || t
  }
  t = t.replace(/[\s.,;:!?…]+$/, '')
  const words = t.split(' ').filter(Boolean)
  if (!words.length) return [title]
  const out: string[] = [words.join(' ')]
  const meaningful = words.filter((w, i) => i === 0 || !LITTLE.has(bare(w)))
  const kept = LITTLE.has(bare(meaningful[0])) && meaningful.length > 1 ? meaningful.slice(1) : meaningful
  for (let n = kept.length; n >= 1; n--) out.push(kept.slice(0, n).join(' '))
  return [...new Set(out.map(capital))]
}

export function fitTitle(candidates: string[], width: number, measure: (s: string) => number): string {
  for (const c of candidates) if (measure(c) <= width) return c
  return candidates[candidates.length - 1]
}
