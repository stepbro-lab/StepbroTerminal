import { describe, expect, it } from 'vitest'
import { closesToTray } from './closeToTray'

describe('closesToTray', () => {
  it('keeps the app in the tray on Windows when the window is closed', () => {
    expect(closesToTray('win32', {}, true, false)).toBe(true)
    expect(closesToTray('win32', { closeToTray: true }, true, false)).toBe(true)
  })

  it('lets it quit when it really is quitting, or was told to', () => {
    expect(closesToTray('win32', {}, true, true)).toBe(false)
    expect(closesToTray('win32', { closeToTray: false }, true, false)).toBe(false)
  })

  it('never hides the window where there is no tray to bring it back from', () => {
    expect(closesToTray('win32', {}, false, false)).toBe(false)
    expect(closesToTray('linux', {}, true, false)).toBe(false)
  })

  it('leaves the Mac as it was: the app stays in the Dock by itself', () => {
    expect(closesToTray('darwin', {}, true, false)).toBe(false)
  })
})
