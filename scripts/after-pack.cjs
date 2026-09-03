// electron-builder afterPack hook: flips Electron's fuses on the packed binary.
// RunAsNode stays on because the session host runs the same binary in Node mode; the
// debugger and NODE_OPTIONS doors close so nobody can attach to a running app to read it.
const path = require('node:path')

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
}
