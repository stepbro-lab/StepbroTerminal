// Drops real files or folders onto the page through Chromium's drag protocol, so drop handlers
// see genuine File objects with paths (a synthetic DragEvent cannot carry those).
// Usage: node scripts/cdp-drop.mjs <port> <x> <y> <path> [path...] [--peek out.png]
import fs from 'node:fs'
const [port, xs, ys, ...paths] = process.argv.slice(2)
if (!port || !xs || !ys || paths.length === 0) {
  console.error('usage: node scripts/cdp-drop.mjs <port> <x> <y> <path> [path...]')
  process.exit(1)
}
const x = Number(xs)
const y = Number(ys)
const list = await (await fetch('http://127.0.0.1:' + port + '/json')).json()
const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
if (!page) {
  console.error('no page target')
  process.exit(1)
}
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => {
  ws.onopen = res
  ws.onerror = rej
})
let seq = 0
const pending = new Map()
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m)
    pending.delete(m.id)
  }
}
const send = (method, params = {}) =>
  new Promise((res) => {
    const id = ++seq
    pending.set(id, res)
    ws.send(JSON.stringify({ id, method, params }))
  })
// `--peek out.png` as the last two arguments: hover only, save a screenshot, then cancel.
let peek = null
const pi = paths.indexOf('--peek')
if (pi >= 0) {
  peek = paths[pi + 1]
  paths.splice(pi, 2)
}
const data = { items: [], files: paths, dragOperationsMask: 1 }
const step = (type) => send('Input.dispatchDragEvent', { type, x, y, data })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const r1 = await step('dragEnter')
await sleep(60)
await step('dragOver')
await sleep(peek ? 250 : 60)
if (peek) {
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync(peek, Buffer.from(shot.result.data, 'base64'))
  await step('dragCancel')
  console.log('peeked at', x, y, '->', peek)
} else {
  const r3 = await step('drop')
  const err = r1.error ?? r3.error
  if (err) console.error('drag error:', JSON.stringify(err))
  else console.log('dropped', paths.length, 'item(s) at', x, y)
}
ws.close()
