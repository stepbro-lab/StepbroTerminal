// Renders the app icon from resources/icons/StepbroLogo.png and the tray icons from inline SVG.
// Run with `pnpm icons`; CI runs it before every build so the checked-in files only matter in dev.
import fs from 'node:fs'
import path from 'node:path'
import { Resvg } from '@resvg/resvg-js'
import pngToIco from 'png-to-ico'

const root = path.resolve(import.meta.dirname, '..')
const iconsDir = path.join(root, 'resources', 'icons')
const buildDir = path.join(root, 'build')
fs.mkdirSync(iconsDir, { recursive: true })
fs.mkdirSync(buildDir, { recursive: true })

const logoFile = path.join(iconsDir, 'StepbroLogo.png')
const logo = `data:image/png;base64,${fs.readFileSync(logoFile).toString('base64')}`

/**
 * The logo scaled onto a square canvas; `inset` leaves transparent room around it, as a share
 * of the canvas. resvg resamples the embedded PNG cleanly at any size.
 */
function logoSvg(size, inset = 0) {
  const pad = Math.round(size * inset)
  const side = size - pad * 2
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <image x="${pad}" y="${pad}" width="${side}" height="${side}" xlink:href="${logo}"/>
</svg>`
}

function render(svg, size, file) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng()
  fs.writeFileSync(file, png)
  console.log('wrote', path.relative(root, file), `${size}px`)
  return png
}

// App icon. Windows and Linux take the full square; electron-builder derives the sizes it needs
// from the 1024px PNG. The .ico also serves the dev Start Menu shortcut so Windows shows name and
// logo in notifications, so it carries the small sizes explicitly.
render(logoSvg(1024), 1024, path.join(buildDir, 'icon.png'))
const icoSizes = [16, 24, 32, 48, 64, 128, 256].map((s) => new Resvg(logoSvg(s), { fitTo: { mode: 'width', value: s } }).render().asPng())
fs.writeFileSync(path.join(buildDir, 'icon.ico'), await pngToIco(icoSizes))
console.log('wrote build/icon.ico')

// macOS does not mask app icons, and the Dock expects artwork with room around it: Apple's own
// icons fill about 80% of the canvas. This variant keeps the same look at the same visual size
// as its neighbours.
render(logoSvg(1024, 0.1), 1024, path.join(buildDir, 'icon-mac.png'))

// The logo inside notifications.
render(logoSvg(256), 256, path.join(iconsDir, 'app-256.png'))

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
