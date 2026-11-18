const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { makeExecutable, notExecutable } = require('./pty-helper-exec.cjs')

function signAdHoc(app) {
  const r = spawnSync('codesign', ['--force', '--deep', '--sign', '-', app], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`ad-hoc codesign failed: ${r.stderr || r.stdout}`)
  const check = spawnSync('codesign', ['--verify', '--deep', '--strict', app], { encoding: 'utf8' })
  if (check.status !== 0) throw new Error(`ad-hoc signature does not verify: ${check.stderr || check.stdout}`)
  console.log(`  • ad-hoc signed ${path.relative(process.cwd(), app)}`)
}

exports.default = async function afterPack(context) {
  const { flipFuses, FuseVersion, FuseV1Options } = await import('@electron/fuses')
  const name = context.packager.appInfo.productFilename
  const platform = context.electronPlatformName
  const target =
    platform === 'win32'
      ? path.join(context.appOutDir, `${name}.exe`)
      : platform === 'darwin'
        ? path.join(context.appOutDir, `${name}.app`)
        : path.join(context.appOutDir, context.packager.executableName ?? name)
  await flipFuses(target, {
    version: FuseVersion.V1,
    resetAdHocDarwinSignature: platform === 'darwin',
    [FuseV1Options.RunAsNode]: true,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false
  })
  console.log(`  • fuses flipped on ${path.relative(process.cwd(), target)}`)

  if (platform === 'win32') return
  const resources = platform === 'darwin' ? path.join(target, 'Contents', 'Resources') : path.join(context.appOutDir, 'resources')
  const nodePty = path.join(resources, 'app.asar.unpacked', 'node_modules', 'node-pty')
  if (!fs.existsSync(nodePty)) throw new Error(`node-pty is not unpacked at ${nodePty}`)
  const fixed = makeExecutable(nodePty)
  const left = notExecutable(nodePty)
  if (left.length) throw new Error(`spawn-helper still not executable: ${left.join(', ')}`)
  console.log(`  • node-pty spawn-helper executable (${fixed.length} fixed)`)

  if (platform === 'darwin') signAdHoc(target)
}
