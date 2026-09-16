/**
 * The one key the system holds for us rather than the window: talking. Pressing it while another
 * program is in front starts a turn, and pressing it again ends it, so a prompt can be dictated
 * without leaving whatever you were doing.
 *
 * It is a press, not a hold: a system-wide key reports only that it went down, never that it came
 * up, on any platform. Inside the window talking is still held, which is what the `voice` shortcut
 * is for; this is its counterpart for everywhere else, and it has a key of its own so the two never
 * fight over the same one.
 */
import { globalShortcut } from 'electron'
import { resolveBindings, toAccelerator } from '@shared/keybindings'
import type { Ctx } from './context'

/** What is registered right now, so nothing is taken twice or left behind. */
let held: string | null = null

/**
 * The accelerator the system should hold, or null for none. Without a Gemini key there is nothing
 * to talk to, and taking a key from every program on the machine for a feature that cannot run
 * would be rude, so the key is only held once talking is set up.
 */
function wanted(ctx: Ctx): string | null {
  if (ctx.prefs.voiceAnywhere === false) return null
  if (!ctx.prefs.geminiApiKey?.trim()) return null
  const chord = resolveBindings(ctx.prefs.keybindings, process.platform === 'darwin')['voice-anywhere']
  return toAccelerator(chord) ?? null
}

/** Takes the key the preferences ask for, gives back the one they no longer do. Safe to call often. */
export function applyGlobalKeys(ctx: Ctx): void {
  const accelerator = wanted(ctx)
  if (accelerator === held) return
  if (held) {
    globalShortcut.unregister(held)
    held = null
  }
  if (!accelerator) return
  try {
    // Another program may already hold it, in which case there is nothing to be done about it
    // here: the Voice page says so, and the shortcut can be changed for one that is free.
    if (globalShortcut.register(accelerator, () => talk(ctx))) {
      held = accelerator
      ctx.log('talk key', accelerator, 'is ours')
    } else ctx.log('talk key', accelerator, 'is already taken by something else')
  } catch (e) {
    ctx.log('talk key', accelerator, 'could not be taken:', String((e as Error)?.message ?? e))
  }
}

/** Whether the system is holding the talk key right now; the Voice page shows when it is not. */
export function globalKeyHeld(): string | null {
  return held
}

export function releaseGlobalKeys(): void {
  globalShortcut.unregisterAll()
  held = null
}

function talk(ctx: Ctx): void {
  // The window is where the microphone and the conversation live. On a Mac it can be closed with
  // the app still running, and then there is nobody to listen; the Dock icon brings it back.
  if (!ctx.win || ctx.win.isDestroyed()) {
    ctx.log('talk key pressed with no window open')
    return
  }
  ctx.emit('ui:voiceToggle')
}
