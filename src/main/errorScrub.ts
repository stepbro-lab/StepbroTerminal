/**
 * What leaves this machine in an error report, cleaned of the person: their home folder, their user
 * name and their computer's name, which is often their own ("demo-mac"). A path in
 * their home keeps only its file name, so a folder or project name never goes out either. The app's
 * own files are named by the SDK as app:///…, which this leaves alone.
 */

export interface Person {
  home: string
  user: string
  host: string
}

/** Stops at what ends a path in a message: space, quotes, brackets, separators, line:column. */
const PATH_IN_HOME = /~[\\/](?:[^\s'"`()<>,;:]*[\\/])?([^\s'"`()<>,;:\\/]+)/g

function variants(home: string): string[] {
  if (!home || home.length < 3) return []
  const forward = home.replace(/\\/g, '/')
  const back = home.replace(/\//g, '\\')
  const all = [home, forward, back, encodeURI(forward), forward.replace(/^([A-Za-z]):/, (_, d: string) => d.toLowerCase() + ':')]
  return [...new Set(all)].sort((a, b) => b.length - a.length)
}

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function scrubText(text: string, p: Person): string {
  let s = text
  for (const h of variants(p.home)) s = s.split(h).join('~')
  s = s.replace(PATH_IN_HOME, (_m, file: string) => `~/…/${file}`)
  if (p.host && p.host.length >= 3) s = s.replace(new RegExp(escape(p.host), 'gi'), 'host')
  if (p.user && p.user.length >= 3) s = s.replace(new RegExp(`(?<![\\w-])${escape(p.user)}(?![\\w-])`, 'gi'), 'user')
  return s
}

function walk(value: unknown, p: Person, depth: number): unknown {
  if (typeof value === 'string') return scrubText(value, p)
  if (depth > 12 || value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map((v) => walk(v, p, depth + 1))
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value)) out[k] = walk(v, p, depth + 1)
  return out
}

/** The report as it may leave: every string cleaned, and what names the person or their machine gone. */
export function scrubEvent<T extends object>(event: T, p: Person): T {
  const e = walk(event, p, 0) as Record<string, any>
  delete e['server_name']
  delete e['user']
  delete e['request']
  if (e['contexts']?.device) delete e['contexts'].device.name
  return e as T
}

/** Breadcrumbs: only the app's own lifecycle (ready, a window focused), and never their data. */
export function keepBreadcrumb<T extends { category?: string; data?: unknown; message?: string }>(b: T, p: Person): T | null {
  if (b.category !== 'electron') return null
  return { ...b, data: undefined, message: b.message === undefined ? undefined : scrubText(b.message, p) }
}
