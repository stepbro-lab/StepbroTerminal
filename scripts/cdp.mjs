// Dev helper: evaluate JavaScript inside the running Step renderer via the Chrome DevTools Protocol.
// Usage: node scripts/cdp.mjs "<expression>"   (expression may return a promise)
//        node scripts/cdp.mjs --shot out.png    (screenshot of the page)
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

function devtoolsPort() {
  if (process.env.STEP_CDP_PORT) return process.env.STEP_CDP_PORT
  const userData =
    process.platform === 'win32'
      ? path.join(process.env.APPDATA, 'Step')
      : process.platform === 'darwin'
        ? path.join(os.homedir(), 'Library', 'Application Support', 'Step')
        : path.join(os.homedir(), '.config', 'Step')
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

const [arg, extra] = process.argv.slice(2)
if (arg === '--shot') {
  const r = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync(extra || 'shot.png', Buffer.from(r.result.data, 'base64'))
  console.log('saved', extra || 'shot.png')
} else {
  const r = await send('Runtime.evaluate', { expression: arg, awaitPromise: true, returnByValue: true })
  if (r.result?.exceptionDetails) console.error('EXC', JSON.stringify(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails, null, 1))
  else console.log(JSON.stringify(r.result?.result?.value, null, 1))
}
ws.close()
