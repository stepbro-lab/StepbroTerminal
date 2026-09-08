import { describe, expect, it } from 'vitest'
import { clickScript, evalScript, focusScript, readScript, scrollScript } from './previewScripts'

/** The scripts run in a page, not here; this checks they at least parse and carry their arguments safely. */
const parses = (js: string): boolean => {
  new Function(`return ${js}`)
  return true
}

describe('preview scripts', () => {
  it('are valid JavaScript for every shape of request', () => {
    expect(parses(readScript('outline'))).toBe(true)
    expect(parses(readScript('text', 'main'))).toBe(true)
    expect(parses(readScript('html', 'text=Sign in'))).toBe(true)
    expect(parses(scrollScript('down'))).toBe(true)
    expect(parses(scrollScript(-300, undefined))).toBe(true)
    expect(parses(scrollScript('top', '#footer'))).toBe(true)
    expect(parses(clickScript('text=Log in'))).toBe(true)
    expect(parses(focusScript('input[name=q]'))).toBe(true)
    expect(parses(evalScript('document.title'))).toBe(true)
  })

  it('quotes a target that tries to break out of the script', () => {
    const nasty = `'); alert(1); ('`
    expect(parses(clickScript(nasty))).toBe(true)
    expect(clickScript(nasty)).toContain(JSON.stringify(nasty))
    expect(parses(evalScript('"\\n" + `x` + \'y\''))).toBe(true)
  })

  it('finds by visible text as well as by selector', () => {
    const js = readScript('outline')
    expect(js).toContain("target.startsWith('text=')")
    expect(js).toContain('document.querySelector(target)')
  })
})
