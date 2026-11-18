export const BLOCK = 'block'
export const REVIEW = 'review'

const finding = (level, file, message, line) => ({ level, file, message, ...(line ? { line } : {}) })

const EXECUTABLE = /\.(exe|dll|so|dylib|node|bin|msi|dmg|pkg|deb|rpm|appimage|jar|class|wasm|pyc|o|a|lib|apk|scr|com)$/i
const ARCHIVE = /\.(zip|tar|gz|tgz|7z|rar|xz|bz2|asar)$/i
const SCRIPT = /\.(sh|bash|zsh|ps1|psm1|bat|cmd|vbs|applescript|command)$/i
const FOREIGN_LOCK = /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|bun\.lockb?)$/
const AUTO_RUN = /^(\.vscode|\.idea|\.devcontainer|\.husky|\.claude|\.cursor|\.codex|\.gemini|\.windsurf)\/|(^|\/)(CLAUDE|AGENTS|GEMINI)\.md$|^\.(envrc|gitmodules|gitattributes|pnpmfile\.cjs|npmrc|yarnrc\.yml)$|^pnpm-workspace\.yaml$/
const SECRETS_FILE = /(^|\/)(\.env(\.[^/]*)?|id_rsa|id_ed25519|[^/]+\.(pem|p12|pfx|key))$/
const PIPELINE = /^\.github\/|^scripts\/|^patches\/|^build\/linux\/|^electron-builder\.yml$|^electron\.vite\.config\.ts$/
const PRIVILEGED = /^src\/preload\/|^src\/main\/(index|updates|window|ipc|preview)\.ts$|^src\/host\/(HookServer|HostServer|mcp|launch)\.ts$/
const SCANNED_ELSEWHERE = /^\.github\/guard\/|^pnpm-lock\.yaml$/

export function checkPath(file, status, trusted) {
  if (status === 'removed') return []
  const sensitive = trusted ? REVIEW : BLOCK
  if (EXECUTABLE.test(file)) return [finding(BLOCK, file, 'Compiled binary. Source code only.')]
  if (ARCHIVE.test(file)) return [finding(BLOCK, file, 'Archive whose contents cannot be reviewed.')]
  if (FOREIGN_LOCK.test(file)) return [finding(BLOCK, file, 'Lockfile from another package manager. This project uses pnpm.')]
  if (SECRETS_FILE.test(file)) return [finding(BLOCK, file, 'Credentials file.')]
  if (AUTO_RUN.test(file)) return [finding(sensitive, file, 'Configuration that tools load or run automatically.')]
  if (PIPELINE.test(file)) return [finding(sensitive, file, 'Changes the build, release or CI pipeline.')]
  if (SCRIPT.test(file)) return [finding(REVIEW, file, 'Shell script.')]
  if (PRIVILEGED.test(file)) return [finding(REVIEW, file, 'Privileged code: read this change closely.')]
  return []
}

export function checkModes(files, modes) {
  const out = []
  for (const file of files) {
    const mode = modes.get(file)
    if (mode === '120000') out.push(finding(BLOCK, file, 'Symbolic link.'))
    if (mode === '160000') out.push(finding(BLOCK, file, 'Git submodule.'))
    if (mode === '100755') out.push(finding(REVIEW, file, 'Marked as executable.'))
  }
  return out
}

const MAGIC = [
  ['Windows executable', [0x4d, 0x5a]],
  ['Linux executable', [0x7f, 0x45, 0x4c, 0x46]],
  ['macOS executable', [0xcf, 0xfa, 0xed, 0xfe]],
  ['macOS executable', [0xce, 0xfa, 0xed, 0xfe]],
  ['macOS executable', [0xca, 0xfe, 0xba, 0xbe]],
  ['WebAssembly module', [0x00, 0x61, 0x73, 0x6d]],
  ['ZIP archive', [0x50, 0x4b, 0x03, 0x04]],
  ['gzip archive', [0x1f, 0x8b]],
  ['7-Zip archive', [0x37, 0x7a, 0xbc, 0xaf]],
  ['RAR archive', [0x52, 0x61, 0x72, 0x21]]
]

const ASSETS = {
  png: [[0x89, 0x50, 0x4e, 0x47]],
  jpg: [[0xff, 0xd8, 0xff]],
  jpeg: [[0xff, 0xd8, 0xff]],
  gif: [[0x47, 0x49, 0x46, 0x38]],
  webp: [[0x52, 0x49, 0x46, 0x46]],
  ico: [[0x00, 0x00, 0x01, 0x00]],
  icns: [[0x69, 0x63, 0x6e, 0x73]],
  mp3: [[0x49, 0x44, 0x33], [0xff, 0xfb], [0xff, 0xf3], [0xff, 0xf2]],
  woff: [[0x77, 0x4f, 0x46, 0x46]],
  woff2: [[0x77, 0x4f, 0x46, 0x32]],
  ttf: [[0x00, 0x01, 0x00, 0x00]],
  otf: [[0x4f, 0x54, 0x54, 0x4f]]
}

const startsWith = (bytes, magic) => magic.every((b, i) => bytes[i] === b)

export function sniff(file, bytes) {
  const executable = MAGIC.find(([, magic]) => startsWith(bytes, magic))
  if (executable) return [finding(BLOCK, file, `Contains a ${executable[0]}.`)]
  const ext = file.split('.').pop().toLowerCase()
  if (ASSETS[ext]) {
    if (ASSETS[ext].some((magic) => startsWith(bytes, magic))) return [finding(REVIEW, file, 'Binary asset: check it is what it claims to be.')]
    return [finding(BLOCK, file, `Content does not match its .${ext} extension.`)]
  }
  if (bytes.subarray(0, 8000).includes(0)) return [finding(BLOCK, file, 'Binary content in a file that should be text.')]
  return []
}

const TRUSTED_HOSTS = /(^|\.)(github\.com|githubusercontent\.com|githubassets\.com|npmjs\.(com|org)|nodejs\.org|pnpm\.io|electronjs\.org|w3\.org|localhost|example\.(com|org)|conventionalcommits\.org|contributor-covenant\.org|deepseek\.com|shields\.io)$/i

const LINE_RULES = [
  [BLOCK, /[‪-‮⁦-⁩]/, 'Hidden bidirectional characters can make code read differently from what runs.'],
  [BLOCK, /\b(curl|wget|iwr|irm|invoke-webrequest|invoke-restmethod)\b[^|\n]*\|\s*(sudo\s+)?((ba|z|da|fi)?sh|python\d?|node|perl|ruby|iex|invoke-expression)\b/i, 'Downloads something and runs it.'],
  [BLOCK, /\b(powershell|pwsh)(\.exe)?\b[^\n]*\s-e(nc|ncodedcommand)?\s+[a-z0-9+/=]{16,}/i, 'Runs an encoded PowerShell command.'],
  [BLOCK, /\/dev\/(tcp|udp)\/|\bnc(at)?\s+(-\w+\s+)*-e\b|\bbash\s+-i\s+>&/i, 'Looks like a reverse shell.'],
  [BLOCK, /\b(eval|Function)\s*\(\s*(atob|unescape|decodeURIComponent|String\.fromCharCode|Buffer\.from)\b/, 'Runs decoded text as code.'],
  [BLOCK, /discord(app)?\.com\/api\/webhooks|api\.telegram\.org\/bot|pastebin\.com\/raw|webhook\.site|requestbin|pipedream\.net|ngrok(-free)?\.(io|app)|transfer\.sh|interact\.sh|oast\.(fun|live|me|pro|site)/i, 'Sends data to or loads code from a throwaway service.'],
  [BLOCK, /\.ssh\/|\bid_(rsa|ed25519)\b|\.aws\/credentials|\.netrc\b|\.git-credentials|Login Data|Local State|find-generic-password|wallet\.dat|\.config\/gh\/hosts/, 'Reaches for credentials stored on the machine.'],
  [BLOCK, /stratum\+(tcp|ssl)|\bxmrig\b|\bcoinhive\b/i, 'Cryptocurrency miner.'],
  [BLOCK, /-----BEGIN [A-Z ]*PRIVATE KEY|\bgh[pousr]_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{40,}|\bsk-ant-[A-Za-z0-9_-]{20,}|\bAKIA[0-9A-Z]{16}\b|\bnpm_[A-Za-z0-9]{36}\b/, 'Contains a secret.'],
  [REVIEW, /[​-‍⁠]/, 'Invisible characters.'],
  [REVIEW, /\beval\s*\(|\bnew Function\s*\(/, 'Runs text as code.'],
  [REVIEW, /\bchild_process\b|\b(execSync|execFileSync|spawnSync)\s*\(/, 'Starts other programs.'],
  [REVIEW, /nodeIntegration:\s*true|contextIsolation:\s*false|webSecurity:\s*false|allowRunningInsecureContent:\s*true|dangerouslySetInnerHTML/, 'Weakens the app\'s isolation.'],
  [REVIEW, /process\.env(\.|\[['"])\w*(TOKEN|SECRET|PASSWORD|API_?KEY)\b/i, 'Reads a secret from the environment.'],
  [REVIEW, /[A-Za-z0-9+/]{160,}={0,2}/, 'Long encoded blob.'],
  [REVIEW, /(\\x[0-9a-f]{2}){8,}|(\\u[0-9a-f]{4}){8,}/i, 'Obfuscated string.'],
  [REVIEW, /\b(?!10\.|127\.|192\.168\.|0\.0\.0\.0|255\.)(?:\d{1,3}\.){3}\d{1,3}:\d{2,5}\b/, 'Connects to a raw IP address.']
]

export function addedLines(patch) {
  const out = []
  let line = 0
  for (const row of patch.split('\n')) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(row)
    if (hunk) line = Number(hunk[1])
    else if (row.startsWith('+')) out.push({ line: line++, text: row.slice(1) })
    else if (!row.startsWith('-') && !row.startsWith('\\')) line++
  }
  return out
}

function externalHost(text) {
  for (const [, host] of text.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) if (!TRUSTED_HOSTS.test(host)) return host
  return null
}

export function scanLines(file, lines) {
  if (SCANNED_ELSEWHERE.test(file)) return []
  const seen = new Set()
  const out = []
  const add = (level, message, line) => {
    if (seen.has(message)) return
    seen.add(message)
    out.push(finding(level, file, message, line))
  }
  for (const { line, text } of lines) {
    for (const [level, rule, message] of LINE_RULES) if (rule.test(text)) add(level, message, line)
    if (text.length > 2000) add(REVIEW, 'Very long line, possibly minified code.', line)
    const host = externalHost(text)
    if (host) add(REVIEW, `Talks to an outside host: ${host}.`, line)
  }
  return out
}

const LIFECYCLE = new Set(['preinstall', 'install', 'postinstall', 'preuninstall', 'uninstall', 'postuninstall', 'prepare', 'prepack', 'postpack', 'prepublish', 'prepublishOnly'])
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']
const REGISTRY_SPEC = /^(workspace:|catalog:)?[\^~<>=* ]*\d*[\w.*+-]*( *\|\| *[\^~<>=* ]*[\w.*+-]+)*$/

function distance(a, b) {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const next = [i]
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    row = next
  }
  return row[b.length]
}

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

export function checkPackageJson(baseText, headText) {
  const file = 'package.json'
  let base, head
  try {
    base = JSON.parse(baseText)
    head = JSON.parse(headText)
  } catch {
    return [finding(BLOCK, file, 'Cannot be parsed.')]
  }
  const out = []
  const known = DEPENDENCY_FIELDS.flatMap((field) => Object.keys(base[field] ?? {}))
  for (const [name, command] of Object.entries(head.scripts ?? {})) {
    if (base.scripts?.[name] === command) continue
    out.push(finding(LIFECYCLE.has(name) ? BLOCK : REVIEW, file, LIFECYCLE.has(name) ? `Install script "${name}" runs on every machine that installs the project.` : `Script "${name}" changed.`))
  }
  for (const field of DEPENDENCY_FIELDS) {
    for (const [name, spec] of Object.entries(head[field] ?? {})) {
      if (base[field]?.[name] === spec) continue
      if (!REGISTRY_SPEC.test(spec)) out.push(finding(BLOCK, file, `"${name}" does not come from the npm registry.`))
      if (known.includes(name)) continue
      const twin = known.find((other) => other !== name && distance(other, name) <= 1)
      out.push(twin ? finding(BLOCK, file, `New dependency "${name}" is one letter away from "${twin}".`) : finding(REVIEW, file, `New dependency "${name}".`))
    }
  }
  if (!same(base.pnpm?.onlyBuiltDependencies, head.pnpm?.onlyBuiltDependencies)) out.push(finding(BLOCK, file, 'Changes which packages may run install scripts.'))
  if (!same(base.pnpm?.patchedDependencies, head.pnpm?.patchedDependencies)) out.push(finding(BLOCK, file, 'Changes which packages are patched.'))
  if (!same(base.pnpm?.overrides, head.pnpm?.overrides)) out.push(finding(REVIEW, file, 'Changes dependency overrides.'))
  if (base.main !== head.main) out.push(finding(BLOCK, file, 'Changes the app\'s entry point.'))
  if (base.packageManager !== head.packageManager) out.push(finding(REVIEW, file, 'Changes the package manager version.'))
  return out
}

export function parseLock(text) {
  const packages = new Map()
  let inPackages = false
  let current = null
  for (const row of text.split('\n')) {
    if (/^\S/.test(row)) {
      inPackages = row.startsWith('packages:')
      current = null
      continue
    }
    if (!inPackages) continue
    const key = /^ {2}'?((?:@[^/@']+\/)?[^@'\s]+)@([^':]+)'?:\s*$/.exec(row)
    if (key) {
      current = { name: key[1], version: key[2], resolution: '' }
      packages.set(`${key[1]}@${key[2]}`, current)
    } else if (current && row.startsWith('    resolution:')) {
      current.resolution = row.trim()
    }
  }
  return packages
}

const integrityOf = (resolution) => /integrity: (sha\d+-[A-Za-z0-9+/=]+)/.exec(resolution)?.[1] ?? null

export function compareLocks(baseText, headText) {
  const file = 'pnpm-lock.yaml'
  const base = parseLock(baseText)
  const head = parseLock(headText)
  const findings = []
  const added = []
  for (const [key, entry] of head) {
    const integrity = integrityOf(entry.resolution)
    const before = base.get(key)
    if (before && integrityOf(before.resolution) !== integrity) findings.push(finding(BLOCK, file, `Checksum of ${key} changed for the same version.`))
    if (before) continue
    if (!integrity || /tarball:|repo:|commit:/.test(entry.resolution)) findings.push(finding(BLOCK, file, `${key} does not come from the npm registry.`))
    else added.push({ name: entry.name, version: entry.version, integrity })
  }
  return { findings, added }
}

const WEEK = 7 * 24 * 60 * 60 * 1000

export function checkPublished(pkg, meta, now = Date.now()) {
  const file = 'pnpm-lock.yaml'
  const key = `${pkg.name}@${pkg.version}`
  const version = meta?.versions?.[pkg.version]
  if (!version) return [finding(BLOCK, file, `${key} is not published on npm.`)]
  const out = []
  if (version.dist?.integrity && version.dist.integrity !== pkg.integrity) out.push(finding(BLOCK, file, `Checksum of ${key} does not match npm.`))
  if (version.deprecated && /malware|compromised|security/i.test(version.deprecated)) out.push(finding(BLOCK, file, `${key} is flagged on npm as unsafe.`))
  const hooks = ['preinstall', 'install', 'postinstall'].filter((hook) => version.scripts?.[hook])
  if (hooks.length) out.push(finding(REVIEW, file, `${key} has an install script (${hooks.join(', ')}).`))
  const published = Date.parse(meta.time?.[pkg.version] ?? '')
  if (published && now - published < WEEK) out.push(finding(REVIEW, file, `${key} was published less than a week ago.`))
  return out
}

export const verdict = (findings) => (findings.some((f) => f.level === BLOCK) ? BLOCK : findings.length ? REVIEW : 'clear')

const safe = (text) => String(text).replace(/[`<>\r\n|]/g, '').replace(/@/g, '@​').slice(0, 200)

export function render(findings, marker) {
  const state = verdict(findings)
  const title = { [BLOCK]: '🔴 Blocked', [REVIEW]: '🟡 Needs a closer look', clear: '🟢 Nothing suspicious found' }[state]
  const rows = (level) =>
    findings
      .filter((f) => f.level === level)
      .slice(0, 40)
      .map((f) => `- \`${safe(f.file)}${f.line ? `:${f.line}` : ''}\`: ${safe(f.message)}`)
  const section = (name, list) => (list.length ? [`### ${name}`, '', ...list, ''] : [])
  return [
    marker,
    `## PR guard: ${title}`,
    '',
    ...section('Must be resolved', rows(BLOCK)),
    ...section('Worth reading', rows(REVIEW)),
    '<sub>Automated checks of the diff and its dependencies. They do not replace a maintainer\'s review.</sub>'
  ].join('\n')
}
