import fs from 'node:fs'
import path from 'node:path'

export function writeFileAtomic(file: string, data: string, mode?: number): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, data, mode === undefined ? undefined : { mode })
  fs.renameSync(tmp, file)
}
