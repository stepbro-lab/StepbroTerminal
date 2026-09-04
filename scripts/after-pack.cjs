// electron-builder afterPack hook.
// 1. Flips Electron's fuses on the packed binary. RunAsNode stays on because the session host
//    runs the same binary in Node mode; the debugger and NODE_OPTIONS doors close so nobody can
//    attach to a running app to read it.
// 2. Makes node-pty's spawn-helper executable in the unpacked app on macOS and Linux. node-pty
//    ships it without the bit, and without it every shell fails with "posix_spawnp failed".
const fs = require('node:fs')
const path = require('node:path')
const { makeExecutable, notExecutable } = require('./pty-helper-exec.cjs')

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
}
