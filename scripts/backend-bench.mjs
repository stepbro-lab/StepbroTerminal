// Isolated backend microbenchmarks. No app/host is launched and no user data is read.
// Usage: node scripts/backend-bench.mjs [baseline git ref; default HEAD]
import ts from 'typescript'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { performance } from 'node:perf_hooks'
import assert from 'node:assert/strict'

const root = path.resolve(import.meta.dirname, '..')
const ref = process.argv[2] ?? 'HEAD'
async function load(file, baseline = false) {
  const source = baseline
    ? execFileSync('git', ['show', `${ref}:${file}`], { cwd: root, encoding: 'utf8', windowsHide: true })
    : fs.readFileSync(path.join(root, file), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } })
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
}
const before = await load('src/shared/protocol.ts', true)
const after = await load('src/shared/protocol.ts')
const oldProcs = await load('src/host/procStats.ts', true)
const newProcs = await load('src/host/procStats.ts')
const { SessionLog } = await load('src/host/SessionLog.ts')
const results = []
const median = (values) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)]
async function measure(fn, setup = async () => {}) {
  const times = [], cpus = [], stalls = []
  await setup()
  await fn() // warm-up
  for (let run = 0; run < 5; run++) {
    await new Promise((resolve) => setTimeout(resolve, 5))
    await setup()
    const start = performance.now(), cpu = process.cpuUsage()
    let firstTurn = 0
    const heartbeat = new Promise((resolve) => setImmediate(() => { firstTurn = performance.now() - start; resolve() }))
    await fn()
    times.push(performance.now() - start)
    const used = process.cpuUsage(cpu)
    cpus.push((used.user + used.system) / 1000)
    await heartbeat
    stalls.push(firstTurn)
  }
  return { wallMs: median(times), cpuMs: median(cpus), firstEventLoopTurnMs: median(stalls) }
}
async function compare(name, oldFn, newFn, setup) {
  const a = await measure(oldFn, setup), b = await measure(newFn, setup)
  results.push({ name, before: a, after: b, wallReductionPercent: (1 - b.wallMs / a.wallMs) * 100 })
}

for (const count of [1, 5, 20]) {
  const frame = before.encodeFrame({ t: 'replay', id: 'bench' }, Buffer.alloc(256 * 1024, 97))
  const chunks = []
  for (let i = 0; i < frame.length; i += 1024) chunks.push(frame.subarray(i, i + 1024))
  function decode(implementation) {
    let bytes = 0
    for (let session = 0; session < count; session++) {
      const parser = new implementation.FrameParser()
      parser.onFrame = (_, data) => { bytes += data.length }
      for (const chunk of chunks) parser.push(chunk)
    }
    assert.equal(bytes, count * 256 * 1024)
  }
  await compare(`fragmented replay, ${count} sessions, 256 KiB/session, 1 KiB chunks`, () => decode(before), () => decode(after))
}
const small = before.encodeFrame({ t: 'output', id: 's' }, Buffer.from('prompt> '))
function smallFrames(implementation) {
  const parser = new implementation.FrameParser()
  let n = 0
  parser.onFrame = () => n++
  for (let i = 0; i < 10000; i++) parser.push(small)
  assert.equal(n, 10000)
}
await compare('10000 small complete frames', () => smallFrames(before), () => smallFrames(after))

const procs = new Map(Array.from({ length: 2000 }, (_, i) => [i + 1, { pid: i + 1, ppid: i < 20 ? 0 : i % 20 + 1, rss: 1024, cpu: 0 }]))
await compare('100 process samples, 2000 processes, 20 session roots', () => {
  for (let i = 0; i < 100; i++) for (let root = 1; root <= 20; root++) oldProcs.subtree(procs, root)
}, () => {
  for (let i = 0; i < 100; i++) {
    const children = newProcs.processChildren(procs)
    for (let root = 1; root <= 20; root++) newProcs.subtree(procs, root, children)
  }
})

const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'step-backend-bench-'))
try {
  const data = Buffer.alloc(1024, 120)
  for (const count of [1, 5, 20]) {
    const files = Array.from({ length: count }, (_, i) => path.join(dir, `${i}.log`))
    await compare(`log burst, ${count} sessions, 128 KiB/session, 1 KiB chunks`, async () => {
      const fds = files.map((file) => fs.openSync(file, 'a'))
      try { for (let i = 0; i < 128; i++) for (const fd of fds) fs.writeSync(fd, data) }
      finally { for (const fd of fds) fs.closeSync(fd) }
    }, async () => {
      const logs = files.map((file) => new SessionLog(file))
      for (let i = 0; i < 128; i++) for (const log of logs) log.append(data)
      await Promise.all(logs.map((log) => log.finish()))
    }, async () => { await Promise.all(files.map((file) => fsp.writeFile(file, ''))) })
    for (const file of files) assert.equal((await fsp.stat(file)).size, 128 * 1024)
  }
} finally {
  // The only recursively removed directory is the unique temporary directory created above.
  await fsp.rm(dir, { recursive: true, force: true })
}
console.log(JSON.stringify({ platform: process.platform, arch: process.arch, node: process.version, baseline: ref,
  note: 'Synthetic component measurements, medians of five warm runs. Not whole-app CPU/RAM percentages or native PTY latency.', results }, null, 2))
