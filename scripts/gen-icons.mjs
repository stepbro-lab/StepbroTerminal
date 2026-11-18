import fs from 'node:fs'
import path from 'node:path'
import { Resvg } from '@resvg/resvg-js'
import pngToIco from 'png-to-ico'

const root = path.resolve(import.meta.dirname, '..')
const iconsDir = path.join(root, 'resources', 'icons')
const buildDir = path.join(root, 'build')
const assetsDir = path.join(root, 'src', 'renderer', 'src', 'assets')
fs.mkdirSync(iconsDir, { recursive: true })
fs.mkdirSync(buildDir, { recursive: true })
fs.mkdirSync(assetsDir, { recursive: true })

const masters = { light: 'StepbroLogoLight.png', dark: 'StepbroLogoDark.png' }
const logos = Object.fromEntries(Object.entries(masters).map(([id, file]) => [id, `data:image/png;base64,${fs.readFileSync(path.join(iconsDir, file)).toString('base64')}`]))
const DEFAULT = 'light'

function logoSvg(logo, size, inset = 0) {
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

render(logoSvg(logos[DEFAULT], 1024), 1024, path.join(buildDir, 'icon.png'))
const icoSizes = [16, 24, 32, 48, 64, 128, 256].map((s) => new Resvg(logoSvg(logos[DEFAULT], s), { fitTo: { mode: 'width', value: s } }).render().asPng())
fs.writeFileSync(path.join(buildDir, 'icon.ico'), await pngToIco(icoSizes))
console.log('wrote build/icon.ico')

const linuxIcons = path.join(buildDir, 'icons')
fs.mkdirSync(linuxIcons, { recursive: true })
for (const s of [16, 24, 32, 48, 64, 128, 256, 512]) render(logoSvg(logos[DEFAULT], s), s, path.join(linuxIcons, `${s}x${s}.png`))

render(logoSvg(logos[DEFAULT], 1024, 0.1), 1024, path.join(buildDir, 'icon-mac.png'))

const trayLogo = (logo, dot) => `
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="32" height="32" viewBox="0 0 32 32">
  <image x="1" y="1" width="30" height="30" xlink:href="${logo}"/>
  ${dot ? `<circle cx="25" cy="25" r="7" fill="#1c1b1b"/><circle cx="25" cy="25" r="5" fill="${dot}"/>` : ''}
</svg>`

const trayMac = (logo, dot) => `
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="36" height="36" viewBox="0 0 36 36">
  <image x="0" y="0" width="36" height="36" xlink:href="${logo}"/>
  ${dot ? `<circle cx="28" cy="28" r="7.5" fill="#1c1b1b"/><circle cx="28" cy="28" r="5.5" fill="${dot}"/>` : ''}
</svg>`

const moods = { idle: null, working: '#6e9cff', attention: '#f5b640' }
for (const [id, logo] of Object.entries(logos)) {
  render(logoSvg(logo, 256), 256, path.join(iconsDir, `app-256-${id}.png`))
  render(logoSvg(logo, 512, 0.1), 512, path.join(iconsDir, `dock-${id}.png`))
  render(logoSvg(logo, 256), 256, path.join(assetsDir, `logo-${id}.png`))
  const ico = await pngToIco([16, 24, 32, 48, 64, 128, 256].map((s) => new Resvg(logoSvg(logo, s), { fitTo: { mode: 'width', value: s } }).render().asPng()))
  fs.writeFileSync(path.join(iconsDir, `app-${id}.ico`), ico)
  console.log('wrote', path.relative(root, path.join(iconsDir, `app-${id}.ico`)))
  for (const [mood, dot] of Object.entries(moods)) {
    render(trayLogo(logo, dot), 32, path.join(iconsDir, `tray-${mood}-${id}.png`))
    render(trayMac(logo, dot), 36, path.join(iconsDir, `tray-${mood}-mac-${id}@2x.png`))
    render(trayMac(logo, dot), 18, path.join(iconsDir, `tray-${mood}-mac-${id}.png`))
  }
}
