// Dev helper: evaluate JavaScript inside the running Step renderer via the Chrome DevTools Protocol.
// Usage: node scripts/cdp.mjs "<expression>"   (expression may return a promise)
//        node scripts/cdp.mjs --shot out.png [x y w h [scale]]   (screenshot, optionally a zoomed clip)
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

function devtoolsPort() {
  if (process.env.STEP_CDP_PORT) return process.env.STEP_CDP_PORT
  const userData =
    process.platform === 'win32'
      ? path.join(process.env.APPDATA, 'StepbroTerminal')
      : process.platform === 'darwin'
        ? path.join(os.homedir(), 'Library', 'Application Support', 'StepbroTerminal')
        : path.join(os.homedir(), '.config', 'StepbroTerminal')
  return fs.readFileSync(path.join(userData, 'DevToolsActivePort'), 'utf8').split(/\r?\n/)[0].trim()
}
const PORT = devtoolsPort()

const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
const page = targets.find((t) => t.type === 'page')
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
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg)
    pending.delete(msg.id)
  }
}
const send = (method, params = {}) =>
  new Promise((res) => {
    const id = ++seq
    pending.set(id, res)
    ws.send(JSON.stringify({ id, method, params }))
  })

let [arg, extra, ...rest] = process.argv.slice(2)
// --file <path>: read the expression from a file, for shells that mangle quotes in arguments.
if (arg === '--file') {
  arg = fs.readFileSync(extra, 'utf8')
  extra = undefined
}
if (arg === '--shot') {
  // --shot out.png [x y w h [scale]]: optional clip, enlarged by scale for a close look.
  const [x, y, width, height, scale] = rest.map(Number)
  const clip = rest.length >= 4 ? { clip: { x, y, width, height, scale: scale || 1 } } : {}
  const r = await send('Page.captureScreenshot', { format: 'png', ...clip })
  fs.writeFileSync(extra || 'shot.png', Buffer.from(r.result.data, 'base64'))
  console.log('saved', extra || 'shot.png')
} else if (arg === '--drag') {
  // Real mouse drag through Chromium: --drag x1 y1 x2 y2 [shift]
  const [x1, y1, x2, y2] = [extra, ...rest].map(Number)
  const modifiers = rest.includes('shift') ? 8 : 0
  const step = (type, x, y) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, modifiers })
  await step('mousePressed', x1, y1)
  for (let i = 1; i <= 8; i++) await step('mouseMoved', x1 + ((x2 - x1) * i) / 8, y1 + ((y2 - y1) * i) / 8)
  await step('mouseReleased', x2, y2)
  console.log('dragged')
} else {
  const r = await send('Runtime.evaluate', { expression: arg, awaitPromise: true, returnByValue: true })
  if (r.result?.exceptionDetails) console.error('EXC', JSON.stringify(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails, null, 1))
  else console.log(JSON.stringify(r.result?.result?.value, null, 1))
}
ws.close()
