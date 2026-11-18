import { describe, expect, it } from 'vitest'
import { fitTitle, titleCandidates } from './shortTitle'

const chars = (s: string): number => s.length * 7.5
const ROW = 175

describe('a session name told in fewer words', () => {
  it('keeps a name that fits as it is', () => {
    expect(fitTitle(titleCandidates('Status line mejora'), ROW, chars)).toBe('Status line mejora')
  })

  it('drops the little words first, then words off the end, never a word in half', () => {
    expect(fitTitle(titleCandidates('Sistema de facturación electrónica'), ROW, chars)).toBe('Sistema facturación')
    expect(fitTitle(titleCandidates('Refactoring de Facturas'), ROW, chars)).toBe('Refactoring de Facturas')
    expect(fitTitle(titleCandidates('Refactorización de la vista de facturas'), ROW, chars)).toBe('Refactorización vista')
    expect(fitTitle(titleCandidates('Terminal estilo Warp optimizada'), ROW, chars)).toBe('Terminal estilo Warp')
    for (const t of ['Refactorización de la vista de facturas', 'Sistema de facturación electrónica', 'InvoicePartyCard pulir estilos del modal']) {
      const shown = fitTitle(titleCandidates(t), ROW, chars)
      expect(shown.endsWith('…')).toBe(false)
      for (const w of shown.split(' ')) expect(t.toLowerCase().split(' ')).toContain(w.toLowerCase())
    }
  })

  it('uses the room a wider sidebar has', () => {
    expect(fitTitle(titleCandidates('Refactorización de la vista de facturas'), 320, chars)).toBe('Refactorización de la vista de facturas')
  })

  it('shows at least the first word, however narrow', () => {
    expect(fitTitle(titleCandidates('Internacionalización completa'), 40, chars)).toBe('Internacionalización')
  })

  it('takes a prompt\'s greeting, "please" and half-cut word off', () => {
    expect(titleCandidates('necesito que mejores mi status line mas bonita algo asi com…', true)[0]).toBe('Mejores mi status line mas bonita algo asi')
    expect(fitTitle(titleCandidates('necesito que mejores mi status line mas bonita algo asi com…', true), ROW, chars)).toBe('Mejores status line mas')
    expect(titleCandidates('hola, ¿puedes arreglar el login por favor?', true)[0]).toBe('Arreglar el login')
    expect(titleCandidates('¿Por qué falla el build?', true)[0]).toBe('¿Por qué falla el build')
    expect(titleCandidates('Can you fix the flaky tests please', true)[0]).toBe('Fix the flaky tests')
    expect(titleCandidates('por favor', true)[0]).toBe('Por favor')
  })

  it('does not lose a title made only of little words', () => {
    const c = titleCandidates('de la')
    expect(c[0]).toBe('De la')
    expect(c.every((x) => x.trim().length > 0)).toBe(true)
  })
})
