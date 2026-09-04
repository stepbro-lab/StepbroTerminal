// node-pty 1.1.0 publishes its macOS `spawn-helper` without the executable bit. node-pty starts
// every shell through that helper with posix_spawnp, so on a Mac each new shell died with
// "posix_spawnp failed". This sets the bit on every spawn-helper under a node-pty directory.
// Runs after `pnpm install` for development and from the electron-builder afterPack hook for
// the packaged app. Usage: node scripts/pty-helper-exec.cjs [path/to/node-pty]
const fs = require('node:fs')
const path = require('node:path')

/** Makes every spawn-helper under `nodePtyDir` executable; returns the files it changed. */
function makeExecutable(nodePtyDir) {
  const candidates = [path.join(nodePtyDir, 'build', 'Release', 'spawn-helper')]
  const prebuilds = path.join(nodePtyDir, 'prebuilds')
  if (fs.existsSync(prebuilds)) {
    for (const arch of fs.readdirSync(prebuilds)) candidates.push(path.join(prebuilds, arch, 'spawn-helper'))
  }
  const fixed = []
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue
    const mode = fs.statSync(file).mode
    if ((mode & 0o111) === 0o111) continue
    fs.chmodSync(file, mode | 0o755)
    fixed.push(file)
  }
  return fixed
}

/** The spawn-helper files under `nodePtyDir` that still cannot be executed. */
function notExecutable(nodePtyDir) {
  const out = []
  const prebuilds = path.join(nodePtyDir, 'prebuilds')
  if (!fs.existsSync(prebuilds)) return out
  for (const arch of fs.readdirSync(prebuilds)) {
    const file = path.join(prebuilds, arch, 'spawn-helper')
    if (fs.existsSync(file) && (fs.statSync(file).mode & 0o111) !== 0o111) out.push(file)
  }
  return out
}

module.exports = { makeExecutable, notExecutable }

if (require.main === module) {
  if (process.platform !== 'win32') {
    const dir = path.resolve(process.argv[2] ?? path.join('node_modules', 'node-pty'))
    if (fs.existsSync(dir)) {
      const fixed = makeExecutable(dir)
      if (fixed.length) console.log(`node-pty: made executable ${fixed.map((f) => path.relative(process.cwd(), f)).join(', ')}`)
    }
  }
}
