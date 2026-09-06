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
 * Linux) or `stepbro <dir>` from a shell. Flags and the app's own paths are not. A step:// link
 * means the app was opened by a notification or a workspace link, and whatever else Windows put
 * on that command line is the protocol registration talking, not a folder anyone asked for: a
 * development build registers itself with its project folder as an argument, and the installed
 * app once took that folder as one to open, and started a shell in it, on every notification click.
 */
export function folderArgs(argv: string[], cwd: string, ignore: string[]): string[] {
  if (argv.some((a) => a.startsWith('step://'))) return []
  const candidates = argv.slice(1).filter((a) => !a.startsWith('-'))
  return onlyFolders(candidates, cwd, ignore)
}
