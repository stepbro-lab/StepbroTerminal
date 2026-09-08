import { describe, expect, it } from 'vitest'
import { arriveScript, clickScript, evalScript, focusScript, hidePresenceScript, readScript, scrollScript, showPresenceScript } from './previewScripts'

const who = { name: 'Codex', color: '#10a37f' }

/** The scripts run in a page, not here; this checks they at least parse and carry their arguments safely. */
const parses = (js: string): boolean => {
  new Function(`return ${js}`)
  return true
}

describe('preview scripts', () => {
  it('are valid JavaScript for every shape of request', () => {
    expect(parses(arriveScript(who))).toBe(true)
    expect(parses(readScript('outline'))).toBe(true)
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
  })

  it('quotes a target or a name that tries to break out of the script', () => {
    const nasty = `'); alert(1); ('`
    expect(parses(clickScript(nasty, { name: nasty, color: nasty }))).toBe(true)
    expect(clickScript(nasty, who)).toContain(JSON.stringify(nasty))
    expect(parses(evalScript('"\\n" + `x` + \'y\''))).toBe(true)
  })

  it('puts the agent on the page before it clicks or types, by name and color', () => {
    expect(clickScript('text=Go', who)).toContain('agent.moveTo(el)')
    expect(focusScript('#q', who)).toContain('agent.ring(el)')
    expect(arriveScript(who)).toContain('"Codex"')
    expect(arriveScript(who)).toContain('#10a37f')
  })

  it('finds by visible text as well as by selector', () => {
    const js = readScript('outline')
    expect(js).toContain("target.startsWith('text=')")
    expect(js).toContain('document.querySelector(target)')
  })
})
