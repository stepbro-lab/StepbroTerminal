import { describe, expect, it } from 'vitest'
import { pacePieces } from './pace'

const bytes = (s: string): number => Buffer.byteLength(s, 'utf8')

describe('pacePieces', () => {
  it('keeps a short text whole', () => {
    expect(pacePieces('hola', 100)).toEqual(['hola'])
    expect(pacePieces('', 100)).toEqual([])
  })

  it('never exceeds the limit, never splits a character, and joins back to the text', () => {
    const text = Array.from({ length: 40 }, (_, i) => `línea ${i}: canción, año, ñandú — “comillas” y 日本語 ${'x'.repeat(i % 7)}`).join('\n')
    for (const max of [50, 97, 300, 1000]) {
      const pieces = pacePieces(text, max)
      expect(pieces.join('')).toBe(text)
      for (const p of pieces) {
        expect(bytes(p)).toBeLessThanOrEqual(max)
        expect(p.length).toBeGreaterThan(0)
        expect(Buffer.from(p, 'utf8').toString('utf8')).toBe(p)
      }
    }
  })

  it('prefers to end a piece at a line break when one is near the end', () => {
    const line = 'a'.repeat(120) + '\n'
    const pieces = pacePieces(line.repeat(10), 300)
    expect(pieces.length).toBeGreaterThan(3)
    for (const p of pieces.slice(0, -1)) expect(p.endsWith('\n')).toBe(true)
  })

  it('cuts between characters when the only line break is far back', () => {
    const text = 'x\n' + 'y'.repeat(2000)
    const pieces = pacePieces(text, 500)
    expect(pieces.join('')).toBe(text)
    expect(pieces.every((p) => bytes(p) <= 500)).toBe(true)
  })
})
