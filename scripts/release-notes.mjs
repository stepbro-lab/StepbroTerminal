// The words that go with a release on the public releases repository, out of the app's own
// changelog (src/shared/changelog.ts), so the page and "What's new" in the app say the same thing.
//   node --experimental-strip-types scripts/release-notes.mjs 0.1.0-beta.25            the release's notes
//   node --experimental-strip-types scripts/release-notes.mjs 0.1.0-beta.25 --readme   the repository's README
import { CHANGELOG } from '../src/shared/changelog.ts'

const REPO = 'kevin9038440334/StepbroTerminal-releases'
const [version, flag] = process.argv.slice(2)
if (!version) {
  console.error('usage: release-notes.mjs <version> [--readme]')
  process.exit(1)
}
const entry = CHANGELOG.find((e) => e.version === version)

const file = (arch, ext) => `StepbroTerminal-${version}-${arch}.${ext}`
const link = (name) => `https://github.com/${REPO}/releases/download/v${version}/${name}`

function changes() {
  if (!entry) return ''
  const groups = [
    ['new', 'New'],
    ['improved', 'Improved'],
    ['fixed', 'Fixed']
  ]
  const out = []
  for (const [kind, title] of groups) {
    const items = entry.changes.filter((c) => c.kind === kind)
    if (!items.length) continue
    out.push(`### ${title}`, '', ...items.map((c) => `- ${c.text}`), '')
  }
  return out.join('\n')
}

const unsigned = 'The builds are not signed yet, so Windows and macOS warn the first time you open them. On Windows click "More info" and then "Run anyway"; on macOS right-click the app and choose "Open".'
// Since 23.10 Ubuntu keeps unconfined programs from making the namespaces Chromium's sandbox runs
// in, and an AppImage cannot carry the setuid helper Chromium falls back on, so it stops before
// it opens. The .deb installs an AppArmor profile that lets it (build/linux/after-install.tpl).
const ubuntu = 'On Ubuntu 23.10 and later, install the .deb: Ubuntu does not let an AppImage start the sandbox Chromium runs in, so the AppImage closes before it opens. The .deb sets up what it needs as it installs.'
// What src/main/updates.ts does on each: only the Windows installer and the AppImage replace themselves.
const updates = 'Already installed? On Windows and in the AppImage the app updates itself; on macOS and with the .deb it tells you when there is a new version and brings you here.'

function notes() {
  return [
    entry ? `**${entry.headline}**` : '',
    '',
    changes(),
    '### Download',
    '',
    `- **Windows**: \`${file('win-x64', 'exe')}\``,
    `- **macOS**: \`${file('mac-arm64', 'dmg')}\` for Apple Silicon, \`${file('mac-x64', 'dmg')}\` for Intel`,
    `- **Linux**: \`${file('linux-amd64', 'deb')}\` for Ubuntu and Debian, \`${file('linux-x86_64', 'AppImage')}\` for other distributions`,
    '',
    ubuntu,
    '',
    updates,
    '',
    unsigned
  ].join('\n')
}

function readme() {
  return [
    '# stepbro terminal (beta)',
    '',
    'A terminal built for running coding agents like Claude Code, Codex and OpenCode, with sessions that keep running when you close the window.',
    '',
    // The picture lives in the releases repository itself, next to this README.
    '![stepbro terminal on macOS, a folder open and Topito waiting for a new session](assets/stepbro-terminal.png)',
    '',
    `## Latest: ${version}`,
    '',
    entry ? `${entry.headline}` : '',
    '',
    `- **Windows**: [${file('win-x64', 'exe')}](${link(file('win-x64', 'exe'))})`,
    `- **macOS (Apple Silicon)**: [${file('mac-arm64', 'dmg')}](${link(file('mac-arm64', 'dmg'))})`,
    `- **macOS (Intel)**: [${file('mac-x64', 'dmg')}](${link(file('mac-x64', 'dmg'))})`,
    `- **Linux**: [.deb](${link(file('linux-amd64', 'deb'))}) for Ubuntu and Debian, [AppImage](${link(file('linux-x86_64', 'AppImage'))}) for other distributions`,
    '',
    ubuntu,
    '',
    `What changed in each version is on the [Releases](https://github.com/${REPO}/releases) page. ${updates}`,
    '',
    unsigned,
    '',
    'It is early and things will change. If something breaks, open an issue here and tell me what you were doing.',
    ''
  ].join('\n')
}

process.stdout.write(flag === '--readme' ? readme() : notes())
