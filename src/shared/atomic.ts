import fs from 'node:fs'
import path from 'node:path'

/**
 * Writes a file whole or not at all: to a side file first, then moved over the real one. A crash
 * or a full disk in the middle leaves the last good copy, never half a file that reads as broken.
 */
export function writeFileAtomic(file: string, data: string, mode?: number): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, data, mode === undefined ? undefined : { mode })
  fs.renameSync(tmp, file)
}
