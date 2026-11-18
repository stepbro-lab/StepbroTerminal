import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { log } from './log'

// A downloaded app can't run its bundled spawn-helper: no executable bit, quarantine, and a
// read-only translocated volume. So a signed copy is kept in the Step directory.
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

function describe(file: string | undefined): string {
  if (!file) return '(unset)'
  try {
    const st = fs.statSync(file)
    return `${file} (mode=${(st.mode & 0o777).toString(8)} size=${st.size})`
  } catch {
    return `${file} (missing)`
  }
}

export function describeSpawnEnv(): string {
  const lines = [`platform=${process.platform} arch=${process.arch}`, `NODE_PTY_SPAWN_HELPER=${describe(process.env['NODE_PTY_SPAWN_HELPER'])}`]
  if (process.platform === 'darwin') lines.push(`shipped helper=${describe(findHelper() ?? undefined)}`)
  return lines.join('\n')
}

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
  } catch {}
  fs.copyFileSync(source, dest)
}

function stripQuarantine(file: string): void {
  try {
    execFileSync('xattr', ['-c', file], { stdio: 'ignore', timeout: 3000 })
  } catch {}
}

function adhocSign(file: string): void {
  try {
    execFileSync('/usr/bin/codesign', ['--force', '--sign', '-', file], { stdio: 'ignore', timeout: 8000 })
  } catch {}
}
