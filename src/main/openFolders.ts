import fs from 'node:fs'
import path from 'node:path'

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
    } catch {}
  }
  return out
}

export function folderArgs(argv: string[], cwd: string, ignore: string[]): string[] {
  if (argv.some((a) => a.startsWith('step://'))) return []
  const candidates = argv.slice(1).filter((a) => !a.startsWith('-'))
  return onlyFolders(candidates, cwd, ignore)
}
