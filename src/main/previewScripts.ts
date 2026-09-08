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
`

/**
 * The agent's presence on the page: a cursor in its color with its name on a tag, that glides to
 * whatever it is about to click or type into, and a ring that lights that element up. Styles go
 * through the CSSOM so a page's Content-Security-Policy does not stop them. Nothing here takes
 * pointer events; the person can keep using the page.
 */
const PRESENCE = `
const presence = (who) => {
  const old = window.__stepAgent
  if (old && old.root && old.root.isConnected) { old.retag(who); return old }
  const root = document.createElement('div')
  root.id = '__step_presence'
  Object.assign(root.style, { position: 'fixed', left: '0', top: '0', width: '0', height: '0', zIndex: '2147483647', pointerEvents: 'none' })
  const cur = document.createElement('div')
  Object.assign(cur.style, { position: 'fixed', left: '0', top: '0', pointerEvents: 'none', transition: 'transform 380ms cubic-bezier(.2,.8,.2,1)', willChange: 'transform' })
  cur.innerHTML = '<svg width="22" height="26" viewBox="0 0 22 26" style="display:block;filter:drop-shadow(0 1px 2px rgba(0,0,0,.4))"><path d="M2 2 L2 20 L7 15.5 L10.5 23 L14 21.5 L10.5 14 L17 14 Z" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>'
  const tag = document.createElement('div')
  Object.assign(tag.style, { position: 'absolute', left: '18px', top: '20px', color: '#fff', font: '500 12px/1.4 system-ui, sans-serif', padding: '2px 8px', borderRadius: '999px', whiteSpace: 'nowrap', boxShadow: '0 1px 3px rgba(0,0,0,.3)' })
  cur.appendChild(tag)
  const ring = document.createElement('div')
  Object.assign(ring.style, { position: 'fixed', left: '0', top: '0', width: '0', height: '0', borderWidth: '2px', borderStyle: 'solid', borderRadius: '6px', opacity: '0', pointerEvents: 'none', transition: 'opacity 180ms, left 200ms, top 200ms, width 200ms, height 200ms' })
  root.append(ring, cur)
  ;(document.body || document.documentElement).appendChild(root)
  let x = window.innerWidth / 2, y = window.innerHeight / 2
  cur.style.transform = 'translate(' + x + 'px,' + y + 'px)'
  let ringTimer = 0
  const agent = {
    root,
    retag(w) { tag.textContent = w.name; tag.style.background = w.color; ring.style.borderColor = w.color; ring.style.boxShadow = '0 0 0 4px ' + w.color + '33'; cur.querySelector('path').setAttribute('fill', w.color) },
    moveTo(el) {
      const r = el.getBoundingClientRect()
      x = r.left + Math.min(r.width / 2, 140)
      y = r.top + r.height / 2
      cur.style.transform = 'translate(' + x + 'px,' + y + 'px)'
      return new Promise((res) => setTimeout(res, 400))
    },
    ring(el) {
      const r = el.getBoundingClientRect()
      Object.assign(ring.style, { left: (r.left - 3) + 'px', top: (r.top - 3) + 'px', width: (r.width + 6) + 'px', height: (r.height + 6) + 'px', opacity: '1' })
      clearTimeout(ringTimer)
      ringTimer = setTimeout(() => { ring.style.opacity = '0' }, 1500)
    },
    hide() { root.style.visibility = 'hidden' },
    show() { root.style.visibility = '' },
    flash() {
      const f = document.createElement('div')
      Object.assign(f.style, { position: 'fixed', inset: '0', background: '#fff', opacity: '0.35', pointerEvents: 'none', zIndex: '2147483646', transition: 'opacity 260ms' })
      ;(document.body || document.documentElement).appendChild(f)
      requestAnimationFrame(() => { f.style.opacity = '0' })
      setTimeout(() => f.remove(), 320)
    }
  }
  agent.retag(who)
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

/** Puts the agent's cursor on the page, at rest, so the person sees who is there. */
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
if (target) { const el = must(target); el.scrollIntoView({ block: 'center', inline: 'nearest' }); await agent.moveTo(el); agent.ring(el) }
else if (to === 'top') window.scrollTo(0, 0)
else if (to === 'bottom') window.scrollTo(0, max())
else if (to === 'up') window.scrollBy(0, -Math.round(window.innerHeight * 0.85))
else if (to === 'down') window.scrollBy(0, Math.round(window.innerHeight * 0.85))
else if (typeof to === 'number') window.scrollBy(0, to)
return 'Scrolled to ' + Math.round(window.scrollY) + ' of ' + max() + ' (viewport ' + window.innerWidth + 'x' + window.innerHeight + ').'`)
}

export function clickScript(target: string, who: Who): string {
  return wrap(`
const el = must(${arg(target)})
el.scrollIntoView({ block: 'center', inline: 'nearest' })
const agent = presence(${arg(who)})
await agent.moveTo(el)
agent.ring(el)
if (typeof el.focus === 'function') el.focus()
el.click()
return 'Clicked <' + el.tagName.toLowerCase() + '> "' + words(el).slice(0, 80) + '".'`)
}

/** Brings the cursor to the field, focuses it and selects what is in it, so what is typed next replaces it. */
export function focusScript(target: string, who: Who): string {
  return wrap(`
const el = must(${arg(target)})
el.scrollIntoView({ block: 'center', inline: 'nearest' })
const agent = presence(${arg(who)})
await agent.moveTo(el)
agent.ring(el)
el.focus()
if (typeof el.select === 'function') el.select()
else if (el.isContentEditable) { const r = document.createRange(); r.selectNodeContents(el); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r) }
else throw new Error('"' + ${arg(target)} + '" is a <' + el.tagName.toLowerCase() + '>, not a field to type into.')
return '<' + el.tagName.toLowerCase() + '>' + (el.name ? ' name=' + el.name : '') + (el.id ? ' #' + el.id : '')`)
}

/** Hides the cursor and ring for a picture of the page alone; `show` brings them back with a flash, the way a camera would. */
export const hidePresenceScript = `(() => { const a = window.__stepAgent; if (a) a.hide(); return true })()`
export const showPresenceScript = `(() => { const a = window.__stepAgent; if (a) { a.show(); a.flash() } return true })()`

/** The value of the agent's own expression, made printable. */
export function evalScript(js: string): string {
  return `(async () => {
  const v = await (async () => { return eval(${arg(js)}) })()
  if (typeof v === 'string') return v
  if (v === undefined) return '(undefined)'
  try { return JSON.stringify(v, null, 1) } catch { return String(v) }
})()`
}
