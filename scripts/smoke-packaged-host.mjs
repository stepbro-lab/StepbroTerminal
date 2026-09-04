// Exercises the session host from an unpacked electron-builder output (release/*-unpacked or the
// .app on macOS) the way the packaged app does. Two checks, both through the packaged binary in
// Node mode: the host must report "listening", and node-pty must be able to open a real shell.
// The host runs outside the asar as plain Node, so a missing unpacked file, or a native helper
// without its executable bit, only shows up here.
// Usage: node scripts/smoke-packaged-host.mjs [release-dir]
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'

const releaseDir = path.resolve(process.argv[2] ?? 'release')

function findApp() {
  for (const entry of fs.readdirSync(releaseDir)) {
    const dir = path.join(releaseDir, entry)
    if (!fs.statSync(dir).isDirectory()) continue
    if (process.platform === 'darwin') {
      const app = fs.readdirSync(dir).find((f) => f.endsWith('.app'))
      if (!app) continue
      const bundle = path.join(dir, app)
      const exe = path.join(bundle, 'Contents', 'MacOS', fs.readdirSync(path.join(bundle, 'Contents', 'MacOS'))[0])
      return { exe, resources: path.join(bundle, 'Contents', 'Resources') }
    }
    if (!entry.endsWith('-unpacked')) continue
    const files = fs.readdirSync(dir)
    // Windows names the binary after the product; Linux after the package. Match either, then fall
    // back to any executable next to resources/ that is not one of Chromium's helpers.
    const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'))
    const wanted = [pkg.productName, pkg.name].filter(Boolean).map((n) => String(n).toLowerCase())
    const exe =
      files.find((f) => wanted.includes(f.replace(/\.exe$/i, '').toLowerCase())) ??
      files.find((f) => {
        if (/^chrome|^uninstall|\./i.test(f)) return false
        try {
          const st = fs.statSync(path.join(dir, f))
          return st.isFile() && (process.platform === 'win32' || (st.mode & 0o111) !== 0)
        } catch {
          return false
        }
      })
    if (exe) return { exe: path.join(dir, exe), resources: path.join(dir, 'resources') }
  }
  throw new Error(`no unpacked app found under ${releaseDir}`)
}

const { exe, resources } = findApp()
const unpacked = path.join(resources, 'app.asar.unpacked')
const host = path.join(unpacked, 'out', 'main', 'host.js')
if (!fs.existsSync(host)) {
  console.error(`host entry missing: ${host}`)
  process.exit(1)
}
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'step-smoke-'))
const nodeEnv = { ...process.env, ELECTRON_RUN_AS_NODE: '1' }

/** Opens a shell through the packaged node-pty and waits for it to print; this is what a new session does. */
function ptyCheck() {
  const script = path.join(home, 'pty-check.cjs')
  const nodePty = path.join(unpacked, 'node_modules', 'node-pty')
  fs.writeFileSync(
    script,
    [
      `const pty = require(${JSON.stringify(nodePty)})`,
      `const win = process.platform === 'win32'`,
      `const p = pty.spawn(win ? 'cmd.exe' : '/bin/sh', win ? ['/c', 'echo smoke-ok'] : ['-c', 'echo smoke-ok'], { cols: 80, rows: 24, cwd: process.cwd(), env: process.env })`,
      `let out = ''`,
      `p.onData((d) => { out += d; if (out.includes('smoke-ok')) { console.log('shell printed through node-pty; ok'); process.exit(0) } })`,
      `p.onExit(({ exitCode }) => { console.error('shell exited with ' + exitCode + ' before printing; output: ' + JSON.stringify(out)); process.exit(1) })`,
      `setTimeout(() => { console.error('shell printed nothing in 10s; output: ' + JSON.stringify(out)); process.exit(1) }, 10000)`
    ].join('\n')
  )
  const r = spawnSync(exe, [script], { cwd: home, env: nodeEnv, encoding: 'utf8', timeout: 30000 })
  const text = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim()
  if (text) console[r.status === 0 ? 'log' : 'error'](text)
  if (r.status !== 0) console.error(`pty check failed (exit ${r.status}${r.error ? `, ${r.error.message}` : ''})`)
  return r.status === 0
}

function finish(ok) {
  try {
    fs.rmSync(home, { recursive: true, force: true })
  } catch {
    /* leave it to the runner */
  }
  process.exit(ok ? 0 : 1)
}

console.log(`starting ${host}\nwith STEP_HOME=${home}`)
const child = spawn(exe, [host], {
  env: { ...nodeEnv, STEP_HOME: home, STEP_VERSION: 'smoke' },
  stdio: ['ignore', 'pipe', 'pipe']
})
let output = ''
child.stdout.on('data', (d) => (output += d))
child.stderr.on('data', (d) => (output += d))

const started = Date.now()
const timer = setInterval(() => {
  const log = path.join(home, 'host.log')
  const text = fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : ''
  if (text.includes('listening')) {
    clearInterval(timer)
    console.log('host is listening; ok')
    const ok = ptyCheck()
    // Tidy up only once the host is gone; a failure to remove the temp dir is not a failed test.
    child.once('exit', () => finish(ok))
    child.kill()
    setTimeout(() => finish(ok), 3000)
    return
  }
  if (child.exitCode !== null || Date.now() - started > 15000) {
    clearInterval(timer)
    console.error(child.exitCode !== null ? `host exited with code ${child.exitCode}` : 'host did not report listening in 15s')
    if (output.trim()) console.error(output.trim())
    if (text.trim()) console.error(text.trim())
    child.kill()
    process.exit(1)
  }
}, 200)
