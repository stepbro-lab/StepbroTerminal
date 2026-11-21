import { CHANGELOG } from '../src/shared/changelog.ts'

const [version] = process.argv.slice(2)
if (!version) {
  console.error('usage: release-notes.mjs <version>')
  process.exit(1)
}
const entry = CHANGELOG.find((e) => e.version === version)

const file = (arch, ext) => `StepbroTerminal-${version}-${arch}.${ext}`

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
const ubuntu = 'On Ubuntu 23.10 and later, install the .deb: Ubuntu does not let an AppImage start the sandbox Chromium runs in, so the AppImage closes before it opens. The .deb sets up what it needs as it installs.'
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

process.stdout.write(notes())
