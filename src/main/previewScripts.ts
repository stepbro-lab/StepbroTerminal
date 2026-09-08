/**
 * JavaScript run inside the page in the preview pane, on an agent's behalf. Kept as strings: the
 * main process ships as bytecode, so a function's source is not there to stringify at run time.
 * Each script is an expression that evaluates to a JSON-friendly value, or throws with a message
 * a person can read.
 */

const CLIP = 40_000

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

const wrap = (body: string): string => `(() => {${FIND}\n${body}\n})()`
const arg = (v: unknown): string => JSON.stringify(v ?? null)

export function readScript(what: 'text' | 'outline' | 'html', target?: string): string {
  const t = `const target = ${arg(target)}`
  if (what === 'outline') return wrap(`${t}\n${OUTLINE}`)
  if (what === 'html') return wrap(`${t}\nconst el = target ? must(target) : document.documentElement\nreturn clip(el.outerHTML, ${CLIP})`)
  return wrap(`${t}\nconst el = target ? must(target) : document.body\nreturn clip(words(el), ${CLIP})`)
}

export function scrollScript(to: 'top' | 'bottom' | 'up' | 'down' | number, target?: string): string {
  return wrap(`
const target = ${arg(target)}
const to = ${arg(to)}
const max = () => Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
if (target) must(target).scrollIntoView({ block: 'center', inline: 'nearest' })
else if (to === 'top') window.scrollTo(0, 0)
else if (to === 'bottom') window.scrollTo(0, max())
else if (to === 'up') window.scrollBy(0, -Math.round(window.innerHeight * 0.85))
else if (to === 'down') window.scrollBy(0, Math.round(window.innerHeight * 0.85))
else if (typeof to === 'number') window.scrollBy(0, to)
return 'Scrolled to ' + Math.round(window.scrollY) + ' of ' + max() + ' (viewport ' + window.innerWidth + 'x' + window.innerHeight + ').'`)
}

export function clickScript(target: string): string {
  return wrap(`
const el = must(${arg(target)})
el.scrollIntoView({ block: 'center', inline: 'nearest' })
if (typeof el.focus === 'function') el.focus()
el.click()
return 'Clicked <' + el.tagName.toLowerCase() + '> "' + words(el).slice(0, 80) + '".'`)
}

/** Focuses the field and selects what is in it, so what is typed next replaces it. Returns what was focused. */
export function focusScript(target: string): string {
  return wrap(`
const el = must(${arg(target)})
el.scrollIntoView({ block: 'center', inline: 'nearest' })
el.focus()
if (typeof el.select === 'function') el.select()
else if (el.isContentEditable) { const r = document.createRange(); r.selectNodeContents(el); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r) }
else throw new Error('"' + ${arg(target)} + '" is a <' + el.tagName.toLowerCase() + '>, not a field to type into.')
return '<' + el.tagName.toLowerCase() + '>' + (el.name ? ' name=' + el.name : '') + (el.id ? ' #' + el.id : '')`)
}

/** The value of the agent's own expression, made printable. */
export function evalScript(js: string): string {
  return `(async () => {
  const v = await (async () => { return eval(${arg(js)}) })()
  if (typeof v === 'string') return v
  if (v === undefined) return '(undefined)'
  try { return JSON.stringify(v, null, 1) } catch { return String(v) }
})()`
}
