import { TOPITO_CLIPS, TOPITO_COLS, TOPITO_FRAMES, TOPITO_ROWS, type TopitoClipName } from './frames'

export type { TopitoClipName }

export type TopitoInk = 'W' | 'S' | 'D' | 'K' | 'A'

export function decodeFrame(code: string): string {
  let out = ''
  for (const m of code.matchAll(/(\d*)([.WSDKA])/g)) out += m[2].repeat(m[1] ? Number(m[1]) : 1)
  return out
}

const decoded = new Map<number, string>()

export function frameCells(index: number): string {
  let cells = decoded.get(index)
  if (cells === undefined) {
    cells = decodeFrame(TOPITO_FRAMES[index] ?? '')
    decoded.set(index, cells)
  }
  return cells
}

export function clip(name: TopitoClipName): { intro: number; frames: Array<[number, number]> } {
  return TOPITO_CLIPS[name]
}

export { TOPITO_COLS, TOPITO_ROWS }
