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

/** `find(target)`: a CSS selector, or `text=…` for the visible text of an element (the shortest match wins). */
const FIND = `
const visible = (el) => el.getClientRects().length > 0
const words = (el) => ((el.innerText != null ? el.innerText : el.textContent) || el.value || '').replace(/\\s+/g, ' ').trim()
const find = (target) => {
  if (!target) return null
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
  if (!el) throw new Error('Nothing on the page matches "' + target + '".')
  return el
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
      if (d < 2) { x = tx; y = ty; return pause(120) }
      const dur = Math.min(1200, 360 + d * 1.1)
      const bend = Math.min(56, d * 0.18), nx = -dy / d, ny = dx / d
      const mx = x + dx / 2 + nx * bend, my = y + dy / 2 + ny * bend
      const anim = cur.animate([{ transform: tr(x, y) }, { transform: tr(mx, my), offset: 0.5 }, { transform: tr(tx, ty) }], { duration: dur, easing: 'cubic-bezier(.3,.7,.25,1)' })
      return new Promise((res) => { anim.onfinish = () => { x = tx; y = ty; cur.style.transform = tr(x, y); remember(); setTimeout(res, 180) } })
    },
    /** Presses down and lets a ripple out at the tip, so a click can be seen. */
    press() {
      agent.wake()
      cur.animate([{ transform: tr(x, y) + ' scale(1)' }, { transform: tr(x, y) + ' scale(0.8)', offset: 0.4 }, { transform: tr(x, y) + ' scale(1)' }], { duration: 260, easing: 'ease-out' })
      const rp = document.createElement('div')
      Object.assign(rp.style, { position: 'fixed', left: (x - 7) + 'px', top: (y - 7) + 'px', width: '14px', height: '14px', borderRadius: '50%', borderWidth: '2px', borderStyle: 'solid', borderColor: color, background: color + '55', pointerEvents: 'none' })
      root.appendChild(rp)
      rp.animate([{ transform: 'scale(0.6)', opacity: 0.95 }, { transform: 'scale(5)', opacity: 0 }], { duration: 560, easing: 'ease-out' }).onfinish = () => rp.remove()
      return pause(110)
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
      const anim = cur.animate([{ transform: tr(x, y) }, { transform: tr(x, ty) }], { duration: 420, easing: 'ease-in-out' })
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

const OUTLINE = `
const lines = ['title: ' + document.title, 'url: ' + location.href]
const push = (label, list, show) => { for (const el of list) { const t = show(el); if (t) lines.push(label + ': ' + t) } }
const root = target ? must(target) : document
push('heading', Array.from(root.querySelectorAll('h1, h2, h3')).filter(visible).slice(0, 60), (h) => h.tagName.toLowerCase() + ' ' + words(h))
push('link', Array.from(root.querySelectorAll('a[href]')).filter(visible).slice(0, 120), (a) => '"' + words(a).slice(0, 80) + '" -> ' + a.href)
push('button', Array.from(root.querySelectorAll('button, [role=button], input[type=submit], input[type=button]')).filter(visible).slice(0, 60), (b) => '"' + (words(b) || b.getAttribute('aria-label') || b.title || '').slice(0, 80) + '"')
push('field', Array.from(root.querySelectorAll('input:not([type=hidden]), textarea, select')).filter(visible).slice(0, 60), (f) => {
  const bits = [f.tagName.toLowerCase() + (f.type ? '[' + f.type + ']' : '')]
  if (f.id) bits.push('#' + f.id)
  if (f.name) bits.push('name=' + f.name)
  if (f.placeholder) bits.push('placeholder="' + f.placeholder + '"')
  const label = f.labels && f.labels[0] ? words(f.labels[0]) : ''
  if (label) bits.push('label="' + label + '"')
  if (f.value && f.type !== 'password') bits.push('value="' + String(f.value).slice(0, 40) + '"')
  return bits.join(' ')
})
lines.push('scroll: ' + Math.round(window.scrollY) + ' of ' + Math.max(0, document.documentElement.scrollHeight - window.innerHeight) + ' (viewport ' + window.innerWidth + 'x' + window.innerHeight + ')')
return clip(lines.join('\\n'), ${CLIP})
`

const wrap = (body: string): string => `(async () => {${FIND}${PRESENCE}\n${body}\n})()`
const arg = (v: unknown): string => JSON.stringify(v ?? null)

/** Puts the agent's cursor on the page, where it last was, so the person sees who is there. */
export function arriveScript(who: Who): string {
  return wrap(`presence(${arg(who)})\nreturn true`)
}

export function readScript(what: 'text' | 'outline' | 'html', target?: string): string {
  const t = `const target = ${arg(target)}`
  if (what === 'outline') return wrap(`${t}\n${OUTLINE}`)
  if (what === 'html') return wrap(`${t}\nconst el = target ? must(target) : document.documentElement\nreturn clip(el.outerHTML, ${CLIP})`)
  return wrap(`${t}\nconst el = target ? must(target) : document.body\nreturn clip(words(el), ${CLIP})`)
}

export function scrollScript(to: 'top' | 'bottom' | 'up' | 'down' | number, target: string | undefined, who: Who): string {
  return wrap(`
const target = ${arg(target)}
const to = ${arg(to)}
const agent = presence(${arg(who)})
const max = () => Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
const by = (px) => { window.scrollBy({ top: px, behavior: 'smooth' }); return agent.drift(px > 0 ? 40 : -40) }
if (target) { const el = must(target); el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' }); await pause(450); await agent.moveTo(el); agent.ring(el) }
else if (to === 'top') { window.scrollTo({ top: 0, behavior: 'smooth' }); await agent.drift(-40) }
else if (to === 'bottom') { window.scrollTo({ top: max(), behavior: 'smooth' }); await agent.drift(40) }
else if (to === 'up') await by(-Math.round(window.innerHeight * 0.85))
else if (to === 'down') await by(Math.round(window.innerHeight * 0.85))
else if (typeof to === 'number') await by(to)
await pause(500)
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
