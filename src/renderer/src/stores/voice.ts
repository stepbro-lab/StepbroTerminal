import { create } from 'zustand'
import { usePrefs } from './prefs'
import { useUi } from './ui'
import { liveApp } from '@/lib/voice/app'
import { DEFAULT_VOICE_MODEL } from '@/lib/voice/protocol'
import { readable, readRequest } from '@/lib/voice/readable'
import { VoiceConversation, type VoiceState } from '@/lib/voice/session'
import { t } from '@/lib/i18n'

/** The conversation that is open, if any. Kept beside the store: it is a thing, not a value. */
let live: VoiceConversation | null = null
/** Connecting takes a second, so a finished conversation is kept a while in case of a follow-up. */
let idle = 0
const IDLE_MS = 45_000

export interface VoiceStore {
  state: VoiceState
  /**
   * Press to talk, let go to send. Pressing connects if nothing is open yet, and holding through
   * the connection still works: the turn starts the moment it is ready.
   */
  press: () => void
  release: () => void
  /** Reads a passage out loud, at the pace set in Settings. Nothing is answered or summarized. */
  read: (text: string) => void
  /** Hang up now rather than waiting for the conversation to go cold. */
  stop: () => void
}

/** What went wrong, in words worth acting on; anything unexpected is repeated as it came. */
function reason(detail: string): string {
  if (detail === 'no-key') return t('Add a Gemini key in Settings to talk.')
  if (detail === 'microphone-denied') return t('stepbro terminal needs the microphone to hear you.')
  if (/denied access|permission_denied/i.test(detail)) return t('Google will not let this key talk: its project has no access. Make another one in AI Studio.')
  if (/api.?key|unauthenticated|invalid/i.test(detail)) return t('Google did not accept this key. Check it in Settings.')
  return detail || t('The voice stopped.')
}

export const useVoice = create<VoiceStore>((set) => ({
  state: 'off',

  press: () => {
    window.clearTimeout(idle)
    const conversation = connect(set)
    conversation?.beginTurn()
  },

  read: (text) => {
    const said = readable(text)
    if (!said) return
    window.clearTimeout(idle)
    const conversation = connect(set)
    if (!conversation) return
    conversation.say(readRequest(said, usePrefs.getState().prefs?.readSpeed ?? 'normal'))
    idle = window.setTimeout(() => useVoice.getState().stop(), IDLE_MS)
  },

  release: () => {
    live?.endTurn()
    window.clearTimeout(idle)
    // Kept warm for a follow-up, then hung up so nothing is billed for sitting there.
    idle = window.setTimeout(() => useVoice.getState().stop(), IDLE_MS)
  },

  stop: () => {
    window.clearTimeout(idle)
    live?.stop()
    live = null
    set({ state: 'off' })
  }
}))

/** The conversation that is open, started if there is none. Null when there is no key to start one with. */
function connect(set: (partial: Partial<VoiceStore>) => void): VoiceConversation | null {
  if (live) return live
  const prefs = usePrefs.getState().prefs
  const apiKey = prefs?.geminiApiKey?.trim() ?? ''
  if (!apiKey) {
    set({ state: 'error' })
    useUi.getState().toast(reason('no-key'), 'error')
    return null
  }
  const conversation = new VoiceConversation({
      apiKey,
      model: prefs?.voiceModel?.trim() || DEFAULT_VOICE_MODEL,
      language: prefs?.language ?? 'en',
      voiceName: prefs?.voiceName?.trim() || 'Puck',
      deviceId: prefs?.voiceInput || undefined,
      app: liveApp(),
      on: {
        state: (state, detail) => {
          set({ state })
          if (state === 'error') {
            useUi.getState().toast(reason(detail ?? ''), 'error')
            if (live === conversation) live = null
          }
        },
        // Nothing is drawn while it listens, so nothing here has to reach the screen.
        heard: () => {},
        did: () => {}
      }
    })
  live = conversation
  void conversation.start()
  return conversation
}
