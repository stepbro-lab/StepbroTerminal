import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { log } from './log'

/**
 * node-pty opens every shell on macOS through its `spawn-helper` binary. Make sure the copy we
 * ship can actually run: the npm package leaves it without the executable bit, and a download
 * from the browser leaves it quarantined. Either one surfaces as "posix_spawnp failed".
 */
export function prepareSpawnHelper(): void {
  if (process.platform !== 'darwin') return
  let root: string
  try {
    root = path.dirname(createRequire(__filename).resolve('node-pty/package.json'))
  } catch (e) {
    log('node-pty not found for the spawn-helper check', e)
    return
  }
  const candidates = [
    path.join(root, 'build', 'Release', 'spawn-helper'),
    path.join(root, 'prebuilds', `${process.platform}-${process.arch}`, 'spawn-helper')
  ].filter((f) => fs.existsSync(f))
  if (candidates.length === 0) {
    log('spawn-helper missing under', root)
    return
  }
  for (const helper of candidates) {
    try {
      const mode = fs.statSync(helper).mode
      if ((mode & 0o111) !== 0o111) {
        fs.chmodSync(helper, mode | 0o755)
        log('spawn-helper made executable', helper)
      }
    } catch (e) {
      log('spawn-helper chmod failed', helper, e)
    }
    try {
      execFileSync('xattr', ['-d', 'com.apple.quarantine', helper], { stdio: 'ignore', timeout: 3000 })
      log('spawn-helper quarantine removed', helper)
    } catch {
      // No such attribute, or the file is not ours to change: nothing more to do here.
    }
  }
}
