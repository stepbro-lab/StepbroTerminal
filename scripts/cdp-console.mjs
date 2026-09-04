// Captures live DevTools console lines that contain a marker while running an expression.
// Usage: node scripts/cdp-console.mjs <port> <marker> <expression>
const [port, marker, expr] = process.argv.slice(2)
const list = await (await fetch('http://127.0.0.1:' + port + '/json')).json()
const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
if (!page) {
  console.error('no page target')
  process.exit(1)
}
const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0
const send = (method, params = {}) => ws.send(JSON.stringify({ id: ++id, method, params }))
const hits = []
ws.onopen = () => {
  send('Runtime.enable')
  if (expr) setTimeout(() => send('Runtime.evaluate', { expression: expr }), 400)
}
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.method === 'Runtime.consoleAPICalled') {
    const text = (m.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ')
    if (!marker || text.includes(marker)) hits.push(text)
  }
}
setTimeout(() => {
  console.log('captured ' + hits.length + ' console line(s) with "' + marker + '":')
  hits.slice(0, 12).forEach((h) => console.log('  - ' + h.replace(/\s+/g, ' ').slice(0, 160)))
  ws.close()
  process.exit(0)
}, 6000)
