/**
 * JavaScript run inside the page in the preview pane, on an agent's behalf. Kept as strings: the
 * main process ships as bytecode, so a function's source is not there to stringify at run time.
 * Each script is an expression that evaluates (through a promise) to a JSON-friendly value, or
 * throws with a message a person can read.
 */

const CLIP = 40_000

/** Who is at the page: the agent's name and color, for the cursor that shows the person what it does. */
export interface Who {
  name: string
  color: string
}

/**
 * `find(target)`: a ref from the page's outline (`e12`), a CSS selector, or `text=…` for the visible
 * text of an element (the shortest match wins). A ref names one element for as long as it is on the
 * page; one from a page that has since changed matches nothing, rather than something else.
 */
const FIND = `
const visible = (el) => el.getClientRects().length > 0
const REF = /^(?:ref=)?(e\\d+)$/
const words = (el) => ((el.innerText != null ? el.innerText : el.textContent) || el.value || '').replace(/\\s+/g, ' ').trim()
const find = (target) => {
  if (!target) return null
  const ref = REF.exec(target.trim())
  if (ref) return document.querySelector('[data-step-ref="' + ref[1] + '"]')
  if (target.startsWith('text=')) {
    const want = target.slice(5).replace(/\\s+/g, ' ').trim().toLowerCase()
    if (!want) return null
    const all = Array.from(document.querySelectorAll('a, button, [role=button], input, textarea, select, label, summary, [onclick], h1, h2, h3, h4, li, td, th, span, p, div')).filter(visible)
    const exact = all.filter((el) => words(el).toLowerCase() === want)
    if (exact.length) return exact[0]
    const loose = all.filter((el) => words(el).toLowerCase().includes(want))
    loose.sort((a, b) => words(a).length - words(b).length)
    return loose[0] || null
  }
  return document.querySelector(target)
}
const must = (target) => {
  const el = find(target)
  if (el) return el
  if (REF.test(target.trim())) throw new Error('"' + target + '" is not on the page any more: it changed since it was read. Its outline, read again, has the refs as they are now.')
  throw new Error('Nothing on the page matches "' + target + '".')
}
const clip = (s, n) => (s.length > n ? s.slice(0, n) + '\\n…[' + (s.length - n) + ' more characters not shown]' : s)
const pause = (ms) => new Promise((r) => setTimeout(r, ms))
`

/**
 * The agent's presence on the page, drawn the way a person would move: a cursor in its color with
 * its name on a tag that travels in a slight arc at a pace that depends on the distance, pauses
 * over what it is about to use, presses down with a ripple when it clicks, and lights the element
 * up with a ring. It remembers where it was across page loads, fades when nothing has happened
 * for a while, and never takes pointer events: the person can keep using the page. Styles go
 * through the CSSOM so a page's Content-Security-Policy does not stop them.
 */
const PRESENCE = `
const presence = (who) => {
  const old = window.__stepAgent
  if (old && old.root && old.root.isConnected) { old.retag(who); old.wake(); return old }
  const tr = (px, py) => 'translate(' + px + 'px,' + py + 'px)'
  const root = document.createElement('div')
  root.id = '__step_presence'
  Object.assign(root.style, { position: 'fixed', left: '0', top: '0', width: '0', height: '0', zIndex: '2147483647', pointerEvents: 'none', transition: 'opacity 500ms' })
  const cur = document.createElement('div')
  Object.assign(cur.style, { position: 'fixed', left: '0', top: '0', pointerEvents: 'none', willChange: 'transform' })
  cur.innerHTML = '<svg width="22" height="26" viewBox="0 0 22 26" style="display:block;filter:drop-shadow(0 1px 2px rgba(0,0,0,.4))"><path d="M2 2 L2 20 L7 15.5 L10.5 23 L14 21.5 L10.5 14 L17 14 Z" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>'
  const tag = document.createElement('div')
  Object.assign(tag.style, { position: 'absolute', left: '18px', top: '20px', color: '#fff', font: '500 12px/1.4 system-ui, sans-serif', padding: '2px 8px', borderRadius: '999px', whiteSpace: 'nowrap', boxShadow: '0 1px 3px rgba(0,0,0,.3)' })
  cur.appendChild(tag)
  const ring = document.createElement('div')
  Object.assign(ring.style, { position: 'fixed', left: '0', top: '0', width: '0', height: '0', borderWidth: '2px', borderStyle: 'solid', borderRadius: '6px', opacity: '0', pointerEvents: 'none', transition: 'opacity 180ms, left 200ms, top 200ms, width 200ms, height 200ms' })
  root.append(ring, cur)
  ;(document.body || document.documentElement).appendChild(root)
  let x = window.innerWidth / 2, y = window.innerHeight / 2
  try { const m = JSON.parse(sessionStorage.getItem('__step_cursor') || 'null'); if (m && m.x >= 0 && m.y >= 0 && m.x <= window.innerWidth && m.y <= window.innerHeight) { x = m.x; y = m.y } } catch {}
  cur.style.transform = tr(x, y)
  const remember = () => { try { sessionStorage.setItem('__step_cursor', JSON.stringify({ x, y })) } catch {} }
  let ringTimer = 0, idleTimer = 0, color = who.color
  const agent = {
    root,
    retag(w) { color = w.color; tag.textContent = w.name; tag.style.background = w.color; ring.style.borderColor = w.color; ring.style.boxShadow = '0 0 0 4px ' + w.color + '33'; cur.querySelector('path').setAttribute('fill', w.color) },
    wake() { root.style.opacity = '1'; clearTimeout(idleTimer); idleTimer = setTimeout(() => { root.style.opacity = '0' }, 9000) },
    /** Travels to the element along a slight arc, slower the farther it is; a small pause once there, the way a hand settles. */
    moveTo(el) {
      agent.wake()
      const r = el.getBoundingClientRect()
      const tx = r.left + Math.min(r.width / 2, 140), ty = r.top + r.height / 2
      const dx = tx - x, dy = ty - y, d = Math.hypot(dx, dy)
      if (d < 2) { x = tx; y = ty; return pause(40) }
      const dur = Math.min(620, 200 + d * 0.5)
      const bend = Math.min(56, d * 0.18), nx = -dy / d, ny = dx / d
      const mx = x + dx / 2 + nx * bend, my = y + dy / 2 + ny * bend
      const anim = cur.animate([{ transform: tr(x, y) }, { transform: tr(mx, my), offset: 0.5 }, { transform: tr(tx, ty) }], { duration: dur, easing: 'cubic-bezier(.3,.7,.25,1)' })
      return new Promise((res) => { anim.onfinish = () => { x = tx; y = ty; cur.style.transform = tr(x, y); remember(); setTimeout(res, 60) } })
    },
    /** Presses down and lets a ripple out at the tip, so a click can be seen. */
    press() {
      agent.wake()
      cur.animate([{ transform: tr(x, y) + ' scale(1)' }, { transform: tr(x, y) + ' scale(0.8)', offset: 0.4 }, { transform: tr(x, y) + ' scale(1)' }], { duration: 260, easing: 'ease-out' })
      const rp = document.createElement('div')
      Object.assign(rp.style, { position: 'fixed', left: (x - 7) + 'px', top: (y - 7) + 'px', width: '14px', height: '14px', borderRadius: '50%', borderWidth: '2px', borderStyle: 'solid', borderColor: color, background: color + '55', pointerEvents: 'none' })
      root.appendChild(rp)
      rp.animate([{ transform: 'scale(0.6)', opacity: 0.95 }, { transform: 'scale(5)', opacity: 0 }], { duration: 560, easing: 'ease-out' }).onfinish = () => rp.remove()
      return pause(50)
    },
    /** Lights the element up; stays lit while something goes on with it. */
    ring(el, ms) {
      agent.wake()
      const r = el.getBoundingClientRect()
      Object.assign(ring.style, { left: (r.left - 3) + 'px', top: (r.top - 3) + 'px', width: (r.width + 6) + 'px', height: (r.height + 6) + 'px', opacity: '1' })
      clearTimeout(ringTimer)
      ringTimer = setTimeout(() => { ring.style.opacity = '0' }, ms || 1500)
    },
    /** The cursor drifts with the page as it scrolls, the way a hand on a wheel would. */
    drift(dy) {
      agent.wake()
      const ty = Math.max(24, Math.min(window.innerHeight - 24, y + dy))
      const anim = cur.animate([{ transform: tr(x, y) }, { transform: tr(x, ty) }], { duration: 260, easing: 'ease-in-out' })
      return new Promise((res) => { anim.onfinish = () => { y = ty; cur.style.transform = tr(x, y); remember(); res() } })
    },
    hide() { root.style.visibility = 'hidden' },
    show() { root.style.visibility = ''; agent.wake() },
    flash() {
      const f = document.createElement('div')
      Object.assign(f.style, { position: 'fixed', inset: '0', background: '#fff', opacity: '0.35', pointerEvents: 'none', zIndex: '2147483646', transition: 'opacity 260ms' })
      ;(document.body || document.documentElement).appendChild(f)
      requestAnimationFrame(() => { f.style.opacity = '0' })
      setTimeout(() => f.remove(), 320)
    }
  }
  agent.retag(who)
  agent.wake()
  window.__stepAgent = agent
  return agent
}
`

/**
 * The page as an agent needs it, in one read: in the order it reads, its headings, the text on it
 * and every element that can be used, each of those with a ref (`[e12]`) to pass back as a target.
 * Refs count on from `start` for the whole session, so one from an earlier page never names an
 * element on this one. Returns JSON: the outline, and the next ref number.
 */
const SNAPSHOT = `
const INTERACTIVE = 'a[href],button,input:not([type=hidden]),textarea,select,summary,[role=button],[role=link],[role=tab],[role=menuitem],[role=checkbox],[role=radio],[role=switch],[role=option],[role=combobox],[role=textbox],[contenteditable=""],[contenteditable=true]'
const short = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
const refOf = (el) => {
  let r = el.getAttribute('data-step-ref')
  if (!r) { r = 'e' + window.__stepRefN++; el.setAttribute('data-step-ref', r) }
  return r
}
const nameOf = (el) => {
  const aria = el.getAttribute('aria-label')
  if (aria && aria.trim()) return aria.trim()
  const by = el.getAttribute('aria-labelledby')
  if (by) { const t = by.split(/\\s+/).map((id) => { const n = document.getElementById(id); return n ? words(n) : '' }).join(' ').trim(); if (t) return t }
  if (el.labels && el.labels[0]) return words(el.labels[0])
  if (el.tagName !== 'INPUT' && el.tagName !== 'SELECT' && el.tagName !== 'TEXTAREA') { const w = words(el); if (w) return w }
  const img = el.querySelector && el.querySelector('img[alt]')
  if (img && img.alt) return img.alt
  return (el.title || el.placeholder || (el.type === 'submit' || el.type === 'button' ? el.value : '') || '').trim()
}
const where = (a) => { try { const u = new URL(a.href); return u.origin === location.origin ? u.pathname + u.search + u.hash : u.href } catch { return a.getAttribute('href') || '' } }
const describe = (el) => {
  const tag = el.tagName.toLowerCase(), role = el.getAttribute('role'), type = (el.getAttribute('type') || '').toLowerCase()
  let kind
  if (tag === 'a') kind = 'link'
  else if (tag === 'button' || role === 'button' || (tag === 'input' && (type === 'submit' || type === 'button' || type === 'reset'))) kind = 'button'
  else if (tag === 'select' || tag === 'textarea' || tag === 'summary') kind = tag
  else if (tag === 'input') kind = type === 'checkbox' || type === 'radio' ? type : 'field' + (type && type !== 'text' ? '[' + type + ']' : '')
  else kind = role || (el.isContentEditable ? 'editable' : tag)
  let line = '[' + refOf(el) + '] ' + kind
  const name = short(nameOf(el).replace(/\\s+/g, ' '), 80)
  if (name) line += ' "' + name + '"'
  if (tag === 'a') line += ' -> ' + short(where(el), 100)
  const bits = []
  if (tag === 'input' || tag === 'textarea') {
    if (el.name) bits.push('name=' + el.name)
    if (el.placeholder && el.placeholder !== name) bits.push('placeholder="' + short(el.placeholder, 40) + '"')
    if (type !== 'password' && el.value && !['checkbox', 'radio', 'submit', 'button', 'reset'].includes(type)) bits.push('value="' + short(String(el.value), 60) + '"')
    if (el.required) bits.push('required')
  }
  if (tag === 'select') { const o = el.selectedOptions && el.selectedOptions[0]; if (o) bits.push('selected="' + short(o.text.trim(), 40) + '"'); bits.push(el.options.length + ' options') }
  if (el.checked || el.getAttribute('aria-checked') === 'true' || el.getAttribute('aria-selected') === 'true' || el.getAttribute('aria-pressed') === 'true') bits.push('checked')
  if (el.disabled || el.getAttribute('aria-disabled') === 'true') bits.push('disabled')
  const ex = el.getAttribute('aria-expanded')
  if (ex) bits.push(ex === 'true' ? 'expanded' : 'collapsed')
  const r = el.getBoundingClientRect()
  if (r.bottom < 0 || r.top > innerHeight) bits.push('offscreen')
  return line + (bits.length ? ' ' + bits.join(' ') : '')
}
const snapshot = (root, max) => {
  const lines = ['title: ' + document.title, 'url: ' + location.href]
  const dialog = document.querySelector('dialog[open], [aria-modal=true]')
  if (dialog) lines.push('dialog open: "' + short(nameOf(dialog) || words(dialog), 80) + '"')
  let size = 0, full = false, run = '', mute = 0
  const add = (l) => {
    if (full) return
    if (size + l.length > max) { full = true; lines.push('…[more below: read one part of the page with a target]'); return }
    lines.push(l)
    size += l.length + 1
  }
  const flush = () => { const t = run.replace(/\\s+/g, ' ').trim(); run = ''; if (t) add('text: ' + short(t, 160)) }
  const walk = (node) => {
    for (const ch of node.childNodes) {
      if (full) return
      if (ch.nodeType === 3) { if (!mute) run += ch.textContent; continue }
      if (ch.nodeType !== 1) continue
      const el = ch
      if (el.id === '__step_presence' || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|IFRAME|svg|SVG)$/.test(el.tagName)) continue
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden') continue
      if (el.matches(INTERACTIVE)) { flush(); if (visible(el)) add(describe(el)); continue }
      if (/^H[1-6]$/.test(el.tagName)) { flush(); const t = words(el); if (t) add(el.tagName.toLowerCase() + ' ' + short(t, 120)); walk(el); run = ''; continue }
      if (el.tagName === 'IMG') { if (el.alt && !mute) run += ' [image: ' + el.alt + '] '; continue }
      // A field's label is already its name on the field's own line; said again it is only noise.
      if (el.tagName === 'LABEL' && el.control) { mute++; walk(el); mute--; continue }
      const block = !cs.display.startsWith('inline') && cs.display !== 'contents'
      if (block) flush()
      walk(el)
      if (block) flush()
    }
  }
  walk(root)
  flush()
  lines.push('scroll: ' + Math.round(window.scrollY) + ' of ' + Math.max(0, document.documentElement.scrollHeight - window.innerHeight) + ' (viewport ' + window.innerWidth + 'x' + window.innerHeight + ')')
  return lines.join('\\n')
}
/** Resolves once the page has stopped changing for \`idle\` ms, or after \`cap\` ms whatever it does. */
const quiet = (idle, cap) => new Promise((res) => {
  let t = 0
  const done = () => { mo.disconnect(); clearTimeout(t); clearTimeout(c); res() }
  const mo = new MutationObserver((list) => {
    if (list.every((m) => m.target.closest && m.target.closest('#__step_presence'))) return
    clearTimeout(t)
    t = setTimeout(done, idle)
  })
  mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true })
  t = setTimeout(done, idle)
  const c = setTimeout(done, cap)
})
`

const wrap = (body: string): string => `(async () => {${FIND}${PRESENCE}${SNAPSHOT}\n${body}\n})()`
const arg = (v: unknown): string => JSON.stringify(v ?? null)

/** Puts the agent's cursor on the page, where it last was, so the person sees who is there. */
export function arriveScript(who: Who): string {
  return wrap(`presence(${arg(who)})\nreturn true`)
}

/**
 * The page's outline (see SNAPSHOT), refs counting on from `start`: JSON of `{ text, next }`.
 * With `settle`, first waits for the page to stop changing, as it does after a click.
 */
export function outlineScript(start: number, target?: string, max = CLIP, settle = false): string {
  return wrap(`
const target = ${arg(target)}
${settle ? 'await quiet(80, 700)' : ''}
if (!window.__stepRefN || window.__stepRefN < ${Math.max(1, Math.floor(start))}) window.__stepRefN = ${Math.max(1, Math.floor(start))}
const text = snapshot(target ? must(target) : (document.body || document.documentElement), ${max})
return JSON.stringify({ text, next: window.__stepRefN })`)
}

export function readScript(what: 'text' | 'html', target?: string): string {
  const t = `const target = ${arg(target)}`
  if (what === 'html') return wrap(`${t}\nconst el = target ? must(target) : document.documentElement\nreturn clip(el.outerHTML, ${CLIP})`)
  return wrap(`${t}\nconst el = target ? must(target) : document.body\nreturn clip(words(el), ${CLIP})`)
}

export function scrollScript(to: 'top' | 'bottom' | 'up' | 'down' | number, target: string | undefined, who: Who): string {
  return wrap(`
const target = ${arg(target)}
const to = ${arg(to)}
const agent = presence(${arg(who)})
const max = () => Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
// Done when the page stops moving: two frames at the same place, however long the smooth scroll takes.
const still = () => new Promise((res) => { let last = -1, same = 0; const t0 = performance.now(); const tick = () => { const y = window.scrollY; same = y === last ? same + 1 : 0; last = y; if (same >= 2 || performance.now() - t0 > 900) res(); else requestAnimationFrame(tick) }; requestAnimationFrame(tick) })
const by = (px) => { window.scrollBy({ top: px, behavior: 'smooth' }); return Promise.all([agent.drift(px > 0 ? 40 : -40), still()]) }
if (target) { const el = must(target); el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' }); await still(); await agent.moveTo(el); agent.ring(el) }
else if (to === 'top') { window.scrollTo({ top: 0, behavior: 'smooth' }); await Promise.all([agent.drift(-40), still()]) }
else if (to === 'bottom') { window.scrollTo({ top: max(), behavior: 'smooth' }); await Promise.all([agent.drift(40), still()]) }
else if (to === 'up') await by(-Math.round(window.innerHeight * 0.85))
else if (to === 'down') await by(Math.round(window.innerHeight * 0.85))
else if (typeof to === 'number') await by(to)
return 'Scrolled to ' + Math.round(window.scrollY) + ' of ' + max() + ' (viewport ' + window.innerWidth + 'x' + window.innerHeight + ').'`)
}

export function clickScript(target: string, who: Who): string {
  return wrap(`
const el = must(${arg(target)})
el.scrollIntoView({ block: 'center', inline: 'nearest' })
const agent = presence(${arg(who)})
await agent.moveTo(el)
agent.ring(el)
await agent.press()
if (typeof el.focus === 'function') el.focus()
el.click()
return 'Clicked <' + el.tagName.toLowerCase() + '> "' + words(el).slice(0, 80) + '".'`)
}

/** Brings the cursor to the field, clicks into it and selects what is in it, so what is typed next replaces it. */
export function focusScript(target: string, who: Who): string {
  return wrap(`
const el = must(${arg(target)})
el.scrollIntoView({ block: 'center', inline: 'nearest' })
const agent = presence(${arg(who)})
await agent.moveTo(el)
agent.ring(el, 6000)
await agent.press()
el.focus()
if (typeof el.select === 'function') el.select()
else if (el.isContentEditable) { const r = document.createRange(); r.selectNodeContents(el); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r) }
else throw new Error('"' + ${arg(target)} + '" is a <' + el.tagName.toLowerCase() + '>, not a field to type into.')
return '<' + el.tagName.toLowerCase() + '>' + (el.name ? ' name=' + el.name : '') + (el.id ? ' #' + el.id : '')`)
}

/** Once the typing is over: the ring lets go. */
export const typedScript = `(() => { const a = window.__stepAgent; if (a && document.activeElement) a.ring(document.activeElement, 600); return true })()`

/** Hides the cursor and ring for a picture of the page alone; `show` brings them back with a flash, the way a camera would. */
export const hidePresenceScript = `(() => { const a = window.__stepAgent; if (a) a.hide(); return true })()`
export const showPresenceScript = `(() => { const a = window.__stepAgent; if (a) { a.show(); a.flash() } return true })()`
/** Whether the agent's cursor is on the page right now (it goes with the page on navigation). */
export const hasPresenceScript = `(() => !!(window.__stepAgent && window.__stepAgent.root && window.__stepAgent.root.isConnected))()`

/** The value of the agent's own expression, made printable. */
export function evalScript(js: string): string {
  return `(async () => {
  const v = await (async () => { return eval(${arg(js)}) })()
  if (typeof v === 'string') return v
  if (v === undefined) return '(undefined)'
  try { return JSON.stringify(v, null, 1) } catch { return String(v) }
})()`
}
