// Renders build/dmg/background.html into the Mac installer's background: build/dmg-background.png,
// 540 × 380, and build/dmg-background@2x.png for Retina screens, which electron-builder joins into
// one image. Run with Electron, since it has the browser to draw the page with:
//   pnpm dmg:background
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const WIDTH = 540
const HEIGHT = 380
const root = path.join(__dirname, '..')
const page = path.join(root, 'build', 'dmg', 'background.html')

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  try {
    // Drawn once, at twice the size; the ordinary one is that picture brought down to half.
    const win = new BrowserWindow({
      width: WIDTH * 2,
      height: HEIGHT * 2,
      useContentSize: true,
      show: false,
      webPreferences: { offscreen: true, zoomFactor: 2 }
    })
    await win.loadFile(page)
    await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)')
    // A frame or two for the page to settle once its font is in.
    await new Promise((r) => setTimeout(r, 500))
    const image = await win.webContents.capturePage()
    win.destroy()
    fs.writeFileSync(path.join(root, 'build', 'dmg-background@2x.png'), image.resize({ width: WIDTH * 2, height: HEIGHT * 2, quality: 'best' }).toPNG())
    fs.writeFileSync(path.join(root, 'build', 'dmg-background.png'), image.resize({ width: WIDTH, height: HEIGHT, quality: 'best' }).toPNG())
    console.log('wrote build/dmg-background.png and build/dmg-background@2x.png')
  } catch (e) {
    console.error('could not draw the background:', e)
    process.exitCode = 1
  }
  app.quit()
})
