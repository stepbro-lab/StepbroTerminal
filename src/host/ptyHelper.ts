import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { log } from './log'

/**
 * node-pty opens every shell on macOS through a small `spawn-helper` binary. Getting that binary
 * to actually run on a downloaded app is the whole battle behind "posix_spawnp failed":
 *
 *  - The npm package ships the helper without the executable bit.
 *  - A download carries `com.apple.quarantine`, and Gatekeeper refuses to run a quarantined,
 *    unsigned nested binary.
 *  - An app opened from the Downloads folder or a mounted disk image runs read-only under App
 *    Translocation, so its own copy of the helper cannot be fixed in place at all.
 *
 * So instead of trusting the copy inside the app, we place our own copy in the user's writable
 * Step directory, clear its quarantine, make it executable, give it a fresh ad-hoc signature, and
 * point node-pty at it through NODE_PTY_SPAWN_HELPER (see the node-pty patch). Copying a Mach-O
 * keeps its embedded signature, so even if `codesign` is unavailable the arm64 helper still runs.
 *
 * `binDir` is a writable directory the host owns (~/.step/bin). Safe to call once at startup.
 */
export function prepareSpawnHelper(binDir: string): void {
  if (process.platform !== 'darwin') return
  const source = findHelper()
  if (!source) return

  try {
    fs.mkdirSync(binDir, { recursive: true })
    const dest = path.join(binDir, 'spawn-helper')
    copyIfChanged(source, dest)
    fs.chmodSync(dest, 0o755)
    stripQuarantine(dest)
    adhocSign(dest)
    process.env['NODE_PTY_SPAWN_HELPER'] = dest
    log('spawn-helper ready at', dest)
    return
  } catch (e) {
    log('could not stage spawn-helper, falling back to fixing it in place', e)
  }

  // Fallback: the app is in a writable place (e.g. /Applications). Fix the shipped copy directly.
  try {
    const mode = fs.statSync(source).mode
    if ((mode & 0o111) !== 0o111) fs.chmodSync(source, mode | 0o755)
    stripQuarantine(source)
    adhocSign(source)
    log('spawn-helper fixed in place at', source)
  } catch (e) {
    log('spawn-helper in-place fix failed', source, e)
  }
}

/** A short description of a file for the log: whether it exists, its mode and size. */
function describe(file: string | undefined): string {
  if (!file) return '(unset)'
  try {
    const st = fs.statSync(file)
    return `${file} (mode=${(st.mode & 0o777).toString(8)} size=${st.size})`
  } catch {
    return `${file} (missing)`
  }
}

/** Everything relevant to a shell that would not start on macOS, for the failure log. */
export function describeSpawnEnv(): string {
  const lines = [`platform=${process.platform} arch=${process.arch}`, `NODE_PTY_SPAWN_HELPER=${describe(process.env['NODE_PTY_SPAWN_HELPER'])}`]
  if (process.platform === 'darwin') lines.push(`shipped helper=${describe(findHelper() ?? undefined)}`)
  return lines.join('\n')
}

/** The spawn-helper for this architecture inside the shipped node-pty, or null if not found. */
function findHelper(): string | null {
  let root: string
  try {
    root = path.dirname(createRequire(__filename).resolve('node-pty/package.json'))
  } catch (e) {
    log('node-pty not found for the spawn-helper check', e)
    return null
  }
  const candidates = [
    path.join(root, 'build', 'Release', 'spawn-helper'),
    path.join(root, 'prebuilds', `${process.platform}-${process.arch}`, 'spawn-helper')
  ]
  const found = candidates.find((f) => fs.existsSync(f))
  if (!found) log('spawn-helper missing under', root)
  return found ?? null
}

function copyIfChanged(source: string, dest: string): void {
  try {
    const a = fs.statSync(source)
    const b = fs.statSync(dest)
    if (a.size === b.size && a.mtimeMs <= b.mtimeMs) return
  } catch {
    /* dest missing: copy it */
  }
  fs.copyFileSync(source, dest)
}

function stripQuarantine(file: string): void {
  try {
    execFileSync('xattr', ['-c', file], { stdio: 'ignore', timeout: 3000 })
  } catch {
    /* nothing to clear, or not ours to change */
  }
}

function adhocSign(file: string): void {
  try {
    execFileSync('/usr/bin/codesign', ['--force', '--sign', '-', file], { stdio: 'ignore', timeout: 8000 })
  } catch {
    // codesign missing or refused. A copied Mach-O keeps its own embedded signature, so this is
    // only a last polish; the helper can still run without it.
  }
}
