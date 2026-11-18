// node-pty 1.1.0 publishes its macOS spawn-helper without the executable bit.
const fs = require('node:fs')
const path = require('node:path')

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
