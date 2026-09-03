// Renders resources/icon.svg into the app icon and the tray icons. Run with `pnpm icons`.
import fs from 'node:fs'
import path from 'node:path'
import { Resvg } from '@resvg/resvg-js'

const root = path.resolve(import.meta.dirname, '..')
const iconsDir = path.join(root, 'resources', 'icons')
const buildDir = path.join(root, 'build')
fs.mkdirSync(iconsDir, { recursive: true })
fs.mkdirSync(buildDir, { recursive: true })

const appSvg = fs.readFileSync(path.join(root, 'resources', 'icon.svg'), 'utf8')

function render(svg, size, file) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng()
  fs.writeFileSync(file, png)
  console.log('wrote', path.relative(root, file), `${size}px`)
}

// App icon: electron-builder derives .ico and .icns from a 512px PNG.
render(appSvg, 512, path.join(buildDir, 'icon.png'))
render(appSvg, 256, path.join(iconsDir, 'app-256.png'))

// Tray icons: a small chevron whose color reflects the aggregate state.
const tray = (color, dot) => `
<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <path d="M9 8 L18 16 L9 24" fill="none" stroke="${color}" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>
  ${dot ? `<circle cx="24" cy="9" r="4.5" fill="${dot}"/>` : ''}
</svg>`

const moods = {
  idle: { color: '#c8c8cc', dot: null },
  working: { color: '#6e9cff', dot: '#6e9cff' },
  attention: { color: '#c8c8cc', dot: '#f5b640' }
}
for (const [mood, { color, dot }] of Object.entries(moods)) {
  render(tray(color, dot), 32, path.join(iconsDir, `tray-${mood}.png`))
  // macOS template images are monochrome; the dot still reads as "something changed".
  render(tray('#000000', dot ? '#000000' : null), 32, path.join(iconsDir, `tray-${mood}Template@2x.png`))
  render(tray('#000000', dot ? '#000000' : null), 16, path.join(iconsDir, `tray-${mood}Template.png`))
}
