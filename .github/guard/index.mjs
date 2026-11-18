import fs from 'node:fs'
import { BLOCK, addedLines, checkModes, checkPackageJson, checkPath, checkPublished, compareLocks, render, scanLines, sniff, verdict } from './rules.mjs'

const { GH_TOKEN, REPO, PR_NUMBER, DRY_RUN, GITHUB_STEP_SUMMARY, BOT_LOGIN = 'github-actions[bot]' } = process.env
const API = `https://api.github.com/repos/${REPO}`
const MARKER = '<!-- pr-guard -->'
const TRUSTED = new Set(['OWNER', 'MEMBER', 'COLLABORATOR'])
const MAX_FILES = 3000
const MAX_REGISTRY_LOOKUPS = 60

const headers = (accept = 'application/vnd.github+json') => ({ accept, authorization: `Bearer ${GH_TOKEN}`, 'x-github-api-version': '2022-11-28', 'user-agent': 'pr-guard' })

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, { ...options, headers: headers() })
  if (!res.ok) throw new Error(`${options.method ?? 'GET'} ${path}: ${res.status}`)
  return res.json()
}

async function raw(file, ref) {
  const path = file.split('/').map(encodeURIComponent).join('/')
  const res = await fetch(`${API}/contents/${path}?ref=${ref}`, { headers: headers('application/vnd.github.raw+json') })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`raw ${file}: ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

async function listFiles() {
  const files = []
  for (let page = 1; page <= MAX_FILES / 100; page++) {
    const batch = await api(`/pulls/${PR_NUMBER}/files?per_page=100&page=${page}`)
    files.push(...batch)
    if (batch.length < 100) break
  }
  return files
}

async function checkFile(file, head, trusted) {
  const out = checkPath(file.filename, file.status, trusted)
  if (file.status === 'removed') return out
  if (file.patch) return [...out, ...scanLines(file.filename, addedLines(file.patch))]
  if (file.changes === 0 && file.status !== 'added') return out
  const bytes = await raw(file.filename, head)
  if (!bytes) return out
  const sniffed = sniff(file.filename, bytes)
  if (sniffed.length) return [...out, ...sniffed]
  const lines = bytes.toString('utf8').split('\n').map((text, i) => ({ line: i + 1, text }))
  return [...out, ...scanLines(file.filename, lines)]
}

async function lookUp({ name }) {
  try {
    const res = await fetch(`https://registry.npmjs.org/${name.replace('/', '%2f')}`, { signal: AbortSignal.timeout(20_000) })
    return res.ok ? res.json() : null
  } catch {
    return null
  }
}

async function checkDependencies(files, base, head) {
  const changed = new Set(files.map((f) => f.filename))
  const out = []
  const text = async (file, ref) => (await raw(file, ref))?.toString('utf8') ?? ''
  if (changed.has('package.json')) out.push(...checkPackageJson(await text('package.json', base), await text('package.json', head)))
  if (!changed.has('pnpm-lock.yaml')) return out
  const { findings, added } = compareLocks(await text('pnpm-lock.yaml', base), await text('pnpm-lock.yaml', head))
  out.push(...findings)
  for (const pkg of added.slice(0, MAX_REGISTRY_LOOKUPS)) out.push(...checkPublished(pkg, await lookUp(pkg)))
  if (added.length > MAX_REGISTRY_LOOKUPS) out.push({ level: 'review', file: 'pnpm-lock.yaml', message: `Only the first ${MAX_REGISTRY_LOOKUPS} of ${added.length} new packages were checked against npm.` })
  return out
}

async function publish(body) {
  const comments = await api(`/issues/${PR_NUMBER}/comments?per_page=100`)
  const mine = comments.find((c) => c.user?.login === BOT_LOGIN && c.body?.startsWith(MARKER))
  const request = { method: mine ? 'PATCH' : 'POST', body: JSON.stringify({ body }) }
  await api(mine ? `/issues/comments/${mine.id}` : `/issues/${PR_NUMBER}/comments`, request)
}

const pr = await api(`/pulls/${PR_NUMBER}`)
const trusted = TRUSTED.has(pr.author_association) || pr.user.login === 'dependabot[bot]'
const files = await listFiles()
const findings = []
if (pr.changed_files > MAX_FILES) findings.push({ level: BLOCK, file: 'pull request', message: 'Too many files to check.' })
for (const file of files) findings.push(...(await checkFile(file, pr.head.sha, trusted)))
const tree = await api(`/git/trees/${pr.head.sha}?recursive=1`)
const live = files.filter((f) => f.status !== 'removed').map((f) => f.filename)
findings.push(...checkModes(live, new Map(tree.tree.map((entry) => [entry.path, entry.mode]))))
findings.push(...(await checkDependencies(files, pr.base.sha, pr.head.sha)))

const body = render(findings, MARKER)
console.log(body)
if (GITHUB_STEP_SUMMARY) fs.appendFileSync(GITHUB_STEP_SUMMARY, body)
if (DRY_RUN !== 'true') {
  await publish(body)
  if (verdict(findings) === BLOCK) process.exitCode = 1
}
