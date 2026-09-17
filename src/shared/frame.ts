import type { Prefs } from './types'

/**
 * Whether the system can blur what is behind a window: every macOS the app runs on, and Windows
 * 11 from 22H2 (build 22621), where a window can ask for a backdrop material. Linux has no such
 * thing a window can ask for.
 */
export function canBlurBehind(platform: string, osVersion: string): boolean {
  if (platform === 'darwin') return true
  if (platform === 'win32') return Number(osVersion.split('.')[2]) >= 22621
  return false
}

/**
 * Whether the window shows the blurred desktop behind it: the system can blur, and the frame or
 * the terminal is set to less than fully opaque. Both at 100% is an ordinary solid window.
 */
export function isTranslucent(prefs: Pick<Prefs, 'frameOpacity' | 'contentOpacity'>, platform: string, osVersion: string): boolean {
  return canBlurBehind(platform, osVersion) && (prefs.frameOpacity < 1 || prefs.contentOpacity < 1)
}
