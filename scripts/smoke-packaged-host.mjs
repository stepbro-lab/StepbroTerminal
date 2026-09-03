// Starts the session host from an unpacked electron-builder output (release/*-unpacked or the
// .app on macOS) the way the packaged app does, and fails unless it reports "listening".
// The host runs outside the asar as plain Node, so a missing unpacked file only shows up here.
// Usage: node scripts/smoke-packaged-host.mjs [release-dir]
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

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
    const exe = fs.readdirSync(dir).find((f) => (process.platform === 'win32' ? /\.exe$/i.test(f) && !/uninstall/i.test(f) : /^stepbro/i.test(f)))
    if (exe) return { exe: path.join(dir, exe), resources: path.join(dir, 'resources') }
  }
  throw new Error(`no unpacked app found under ${releaseDir}`)
}

const { exe, resources } = findApp()
const host = path.join(resources, 'app.asar.unpacked', 'out', 'main', 'host.js')
if (!fs.existsSync(host)) {
  console.error(`host entry missing: ${host}`)
  process.exit(1)
}
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'step-smoke-'))
console.log(`starting ${host}\nwith STEP_HOME=${home}`)
const child = spawn(exe, [host], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', STEP_HOME: home, STEP_VERSION: 'smoke' },
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
    child.kill()
    fs.rmSync(home, { recursive: true, force: true })
    process.exit(0)
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
