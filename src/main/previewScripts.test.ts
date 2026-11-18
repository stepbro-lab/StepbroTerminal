import { describe, expect, it } from 'vitest'
import { arriveScript, clickScript, evalScript, focusScript, hasPresenceScript, hidePresenceScript, outlineScript, readScript, scrollScript, showPresenceScript, typedScript } from './previewScripts'

const who = { name: 'Codex', color: '#10a37f' }

const parses = (js: string): boolean => {
  new Function(`return ${js}`)
  return true
}

describe('preview scripts', () => {
  it('are valid JavaScript for every shape of request', () => {
    expect(parses(arriveScript(who))).toBe(true)
    expect(parses(outlineScript(1))).toBe(true)
    expect(parses(outlineScript(40, 'e12', 9000, true))).toBe(true)
    expect(parses(readScript('text', 'main'))).toBe(true)
    expect(parses(readScript('html', 'text=Sign in'))).toBe(true)
    expect(parses(scrollScript('down', undefined, who))).toBe(true)
    expect(parses(scrollScript(-300, undefined, who))).toBe(true)
    expect(parses(scrollScript('top', '#footer', who))).toBe(true)
    expect(parses(clickScript('text=Log in', who))).toBe(true)
    expect(parses(focusScript('input[name=q]', who))).toBe(true)
    expect(parses(evalScript('document.title'))).toBe(true)
    expect(parses(hidePresenceScript)).toBe(true)
    expect(parses(showPresenceScript)).toBe(true)
    expect(parses(typedScript)).toBe(true)
    expect(parses(hasPresenceScript)).toBe(true)
  })

  it('moves like a hand: an arc on the way, a pause on arrival, a press on the click', () => {
    const js = clickScript('text=Buy', who)
    expect(js).toContain('cur.animate(')
    expect(js).toContain('await agent.press()')
    expect(js).toContain('sessionStorage')
  })

  it('quotes a target or a name that tries to break out of the script', () => {
    const nasty = `'); alert(1); ('`
    expect(parses(clickScript(nasty, { name: nasty, color: nasty }))).toBe(true)
    expect(clickScript(nasty, who)).toContain(JSON.stringify(nasty))
    expect(parses(evalScript('"\\n" + `x` + \'y\''))).toBe(true)
  })

  it('puts the agent on the page before it clicks or types, by name and color', () => {
    expect(clickScript('text=Go', who)).toContain('agent.moveTo(el)')
    expect(focusScript('#q', who)).toContain('agent.ring(el')
    expect(arriveScript(who)).toContain('"Codex"')
    expect(arriveScript(who)).toContain('#10a37f')
  })

  it('finds by visible text as well as by selector', () => {
    const js = outlineScript(1)
    expect(js).toContain("target.startsWith('text=')")
    expect(js).toContain('document.querySelector(target)')
  })

  it('hands every usable element a ref, counting on from where the session is', () => {
    const js = outlineScript(40)
    expect(js).toContain('data-step-ref')
    expect(js).toContain('window.__stepRefN = 40')
    expect(clickScript('e12', who)).toContain('[data-step-ref=')
  })

  it('says so when a ref is from a page that has changed, instead of clicking something else', () => {
    expect(clickScript('e12', who)).toContain('is not on the page any more')
  })

  it('waits for the page to settle before an outline taken after an action', () => {
    expect(outlineScript(1, undefined, 9000, true)).toContain('await quiet(')
    expect(outlineScript(1)).not.toContain('await quiet(')
  })
})
