import fs from 'node:fs'
import path from 'node:path'

/** Of the given paths, those that exist and are folders, resolved against `cwd`, without repeats. */
export function onlyFolders(paths: string[], cwd: string, ignore: string[] = []): string[] {
  const skip = new Set(ignore.map((p) => path.resolve(p).toLowerCase()))
  const out: string[] = []
  for (const raw of paths) {
    if (!raw) continue
    const p = path.resolve(cwd, raw)
    const key = p.toLowerCase()
    if (skip.has(key) || out.some((x) => x.toLowerCase() === key)) continue
    try {
      if (fs.statSync(p).isDirectory()) out.push(p)
    } catch {
      /* not a path at all */
    }
  }
  return out
}

/**
 * Folders handed to the app on its command line: a folder dropped on the app icon (Windows,
 * Linux) or `stepbro <dir>` from a shell. Flags, step:// links and the app's own paths are not.
 */
export function folderArgs(argv: string[], cwd: string, ignore: string[]): string[] {
  const candidates = argv.slice(1).filter((a) => !a.startsWith('-') && !a.startsWith('step://'))
  return onlyFolders(candidates, cwd, ignore)
}
