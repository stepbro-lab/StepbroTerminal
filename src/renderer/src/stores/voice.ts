import { create } from 'zustand'
import { usePrefs } from './prefs'
import { liveApp } from '@/lib/voice/app'
import { DEFAULT_VOICE_MODEL } from '@/lib/voice/protocol'
import { VoiceConversation, type VoiceState } from '@/lib/voice/session'
import type { ToolOutcome } from '@/lib/voice/tools'

/** The voice that is speaking now, if any. Kept beside the store: it is a thing, not a value. */
let live: VoiceConversation | null = null

export interface VoiceStore {
  /** Whether the bubble is on screen at all. */
  open: boolean
  state: VoiceState
  /** Why it stopped, when it stopped badly. */
  detail: string
  /** What the person is saying and what the voice is answering, for the caption under the bubble. */
  heard: string
  said: string
  level: number
  muted: boolean
  /** The last thing the voice did in the app, to show for a moment. */
  did: NonNullable<ToolOutcome['did']> | null
  toggle: () => void
  show: () => void
  hide: () => void
  setMuted: (muted: boolean) => void
  /** Says something to it in writing, for when speaking out loud is not on. */
  say: (text: string) => void
}

export const useVoice = create<VoiceStore>((set, get) => ({
  open: false,
  state: 'off',
  detail: '',
  heard: '',
  said: '',
  level: 0,
  muted: false,
  did: null,

  toggle: () => (get().open ? get().hide() : get().show()),

  show: () => {
    if (get().open) return
    const prefs = usePrefs.getState().prefs
    const apiKey = prefs?.geminiApiKey?.trim() ?? ''
    set({ open: true, heard: '', said: '', did: null, detail: '', muted: false, level: 0 })
    if (!apiKey) {
      // Nothing to connect with: the bubble opens anyway and says so, with the way to fix it.
      set({ state: 'error', detail: 'no-key' })
      return
    }
    live?.stop(true)
    live = new VoiceConversation({
      apiKey,
      model: prefs?.voiceModel?.trim() || DEFAULT_VOICE_MODEL,
      language: prefs?.language ?? 'en',
      voiceName: prefs?.voiceName?.trim() || 'Puck',
      deviceId: prefs?.voiceInput || undefined,
      app: liveApp(),
      on: {
        state: (state, detail) => set({ state, detail: detail ?? '' }),
        // Each turn is spoken afresh: the caption shows this turn, not the whole conversation.
        heard: (text) => set((s) => ({ heard: s.said ? text : s.heard + text, said: '' })),
        said: (text) => set((s) => ({ said: s.said + text })),
        did: (did) => set({ did }),
        level: (level) => set({ level })
      }
    })
    void live.start()
  },

  hide: () => {
    live?.stop()
    live = null
    set({ open: false, state: 'off', heard: '', said: '', did: null, detail: '', level: 0 })
  },

  setMuted: (muted) => {
    live?.setMuted(muted)
    set({ muted })
  },

  say: (text) => {
    const said = text.trim()
    if (!said) return
    live?.say(said)
    set({ heard: said, said: '' })
  }
}))
