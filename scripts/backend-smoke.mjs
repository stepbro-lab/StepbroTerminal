// Native PTY + socket + persistence test, isolated from installed/running instances.
// Run after npm run build: node scripts/backend-smoke.mjs
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { once } from 'node:events'
import ts from 'typescript'
import assert from 'node:assert/strict'

const root = path.resolve(import.meta.dirname, '..')
const require = createRequire(import.meta.url)
const exe = require('electron')
const source = await fs.readFile(path.join(root, 'src/shared/protocol.ts'), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
const { encodeFrame, FrameParser } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'step-native-smoke-'))
const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1', STEP_HOME: dir, CLAUDE_CONFIG_DIR: path.join(dir, 'claude'), STEP_VERSION: 'backend-smoke', SMOKE_TOKEN: 'native-ok' }
let child, sock
let stderr = ''
let sessionId
let output = ''
let unacked = 0
let delayAck = false
let pausedClientExercised = false
let queuedAck
let messages = []
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function until(predicate, label, timeout = 20000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await predicate()) return
    if (child?.exitCode !== null && child?.exitCode !== undefined) throw new Error(`Host exited during ${label}: ${stderr}`)
    await sleep(25)
  }
  throw new Error(`Timed out: ${label}; bytes=${output.length}, unacked=${unacked}, slowClient=${pausedClientExercised}; tail=${JSON.stringify(output.slice(-800))}; ${stderr}`)
}
function send(msg, data) { sock.write(encodeFrame(msg, data)) }
function acknowledge() {
  if (unacked && sessionId) send({ t: 'ack', id: sessionId, bytes: unacked })
  unacked = 0
}
async function start() {
  child = spawn(exe, [path.join(root, 'out/main/host.js')], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
  child.stderr.on('data', (d) => { stderr += d })
  child.on('error', (e) => { stderr += String(e) })
  let info
  await until(async () => {
    try { info = JSON.parse(await fs.readFile(path.join(dir, 'host.json'), 'utf8')); return info.pid === child.pid } catch { return false }
  }, 'host startup')
  sock = net.connect(info.socketPath)
  const parser = new FrameParser()
  parser.onFrame = (msg, bin) => {
    messages.push(msg)
    if (msg.t !== 'output' && msg.t !== 'replay') return
    output += Buffer.from(bin).toString('utf8')
    unacked += bin.length
    if (!delayAck) acknowledge()
    else if (unacked > 1024 * 1024 && !queuedAck) {
      pausedClientExercised = true
      queuedAck = setTimeout(() => { delayAck = false; queuedAck = undefined; acknowledge() }, 150)
    }
  }
  sock.on('data', (data) => parser.push(data))
  await once(sock, 'connect')
  send({ t: 'hello', version: 'backend-smoke' })
}
async function shutdown() {
  const stopped = once(child, 'exit')
  send({ t: 'shutdown' })
  const timeout = setTimeout(() => child.kill(), 10000)
  const [code] = await stopped
  clearTimeout(timeout)
  sock.destroy()
  assert.equal(code, 0, 'host shutdown must flush successfully')
}

try {
  await start()
  const win = process.platform === 'win32'
  send({ t: 'new', reqId: 'new', opts: { projectPath: dir, presetId: 'shell', cols: 120, rows: 30,
    launch: { command: win ? 'cmd.exe' : '/bin/sh', args: win ? ['/Q'] : [], hooks: false } } })
  await until(() => messages.some((m) => m.t === 'created'), 'session creation')
  const created = messages.find((m) => m.t === 'created').session
  assert.equal(created.alive, true, JSON.stringify(created))
  sessionId = created.id
  send({ t: 'attach', id: sessionId })
  await until(() => messages.some((m) => m.t === 'replay'), 'initial snapshot')
  await sleep(500)
  const marker = win ? 'echo ready-%SMOKE_TOKEN%\r' : 'echo ready-$SMOKE_TOKEN\n'
  send({ t: 'input', id: sessionId }, Buffer.from(marker))
  await until(() => output.includes('ready-native-ok'), 'native shell command')
  console.log('native shell input/output: passed')

  // A program that takes the mouse the way Codex does: once, as it starts, with SGR reports. The
  // window must hear about the encoding through the PTY (ConPTY on Windows) and again when it
  // reconnects, or every move of the mouse is typed into the program as "[MC…".
  const setsMode = (text, mode) => new RegExp(`\\x1b\\[\\?(?:\\d+;)*${mode}(?:;\\d+)*h`).test(text)
  const app = path.join(dir, 'mouse-app.cjs')
  await fs.writeFile(app, [
    "process.stdout.write('\\x1b[?1000h\\x1b[?1002h\\x1b[?1003h\\x1b[?1006hmouse-app-ready\\r\\n')",
    "setTimeout(() => process.stdout.write('\\x1b[?1006l\\x1b[?1003l\\x1b[?1002l\\x1b[?1000lmouse-app-done\\r\\n'), 8000)"
  ].join('\n'))
  output = ''
  send({ t: 'input', id: sessionId }, Buffer.from(`"${process.execPath}" "${app}"${win ? '\r' : '\n'}`))
  await until(() => output.includes('mouse-app-ready'), 'mouse program start')
  assert.ok(setsMode(output, 1003) && setsMode(output, 1006), `the mouse mode and its SGR encoding must reach the window: ${JSON.stringify(output.slice(-400))}`)
  const replays = messages.filter((m) => m.t === 'replay').length
  output = ''
  send({ t: 'attach', id: sessionId })
  await until(() => messages.filter((m) => m.t === 'replay').length > replays, 'snapshot for a reconnecting window')
  assert.ok(setsMode(output, 1003) && setsMode(output, 1006), `a reconnecting window must get the mouse mode and its SGR encoding: ${JSON.stringify(output.slice(-400))}`)
  await until(() => output.includes('mouse-app-done'), 'mouse program end')
  console.log('a program that takes the mouse keeps its SGR reports across a reconnect: passed')

  output = ''
  delayAck = true
  const line = 'x'.repeat(100)
  const burst = win ? `for /L %i in (1,1,12000) do @echo %i-${line}\r` : `i=0; while [ "$i" -lt 12000 ]; do echo $i-${line}; i=$((i+1)); done\n`
  send({ t: 'input', id: sessionId }, Buffer.from(burst))
  send({ t: 'input', id: sessionId }, Buffer.from(win ? 'echo finished-%SMOKE_TOKEN%\r' : 'echo finished-$SMOKE_TOKEN\n'))
  await until(() => output.includes('finished-native-ok'), 'burst with delayed ACK', 45000)
  assert.ok(pausedClientExercised, 'test must exercise >1 MiB of unacknowledged output')
  console.log('output burst with slow client, then resume: passed')

  send({ t: 'kill', id: sessionId })
  await until(() => messages.some((m) => m.t === 'exit'), 'shell exit')
  await shutdown()
  const log = await fs.readFile(path.join(dir, 'sessions', `${sessionId}.log`), 'utf8')
  assert.ok(log.includes('finished-native-ok'), 'final terminal output must be persisted')
  console.log('normal host shutdown persisted final output: passed')

  messages = []
  output = ''
  await start()
  send({ t: 'attach', id: sessionId })
  await until(() => messages.some((m) => m.t === 'replay'), 'restored snapshot')
  assert.ok(output.includes('finished-native-ok'), 'restored screen must contain final output')
  console.log('host restart and lazy scrollback recovery: passed')
  send({ t: 'close', id: sessionId })
  await until(() => messages.some((m) => m.t === 'removed'), 'session close')
  await shutdown()
  await assert.rejects(fs.stat(path.join(dir, 'sessions', `${sessionId}.log`)), { code: 'ENOENT' })
  console.log('session removal with no log left behind: passed')
} finally {
  if (queuedAck) clearTimeout(queuedAck)
  sock?.destroy()
  if (child && child.exitCode === null) {
    const stopped = once(child, 'exit')
    child.kill()
    await Promise.race([stopped, sleep(3000)])
  }
  // Only the uniquely created temporary data directory is removed.
  await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
