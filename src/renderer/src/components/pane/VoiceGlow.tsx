import { useEffect, useRef, useState } from 'react'
import { usePrefs } from '@/stores/prefs'
import { useVoice, voiceAnswerLevel, voiceMicLevel } from '@/stores/voice'
import { VoiceGlowRenderer } from '@/lib/voice/glow'

/**
 * Once you let go of the talk key the model is working out its answer; if nothing has come after
 * this long (it was only a tool call, or nothing to say), the thinking sweep lets go too.
 */
const THINKING_MS = 12_000

/**
 * A colourful glow rising from the bottom edge of the terminal in front while you talk to the
 * voice agent, following your voice; it sweeps side to side while the agent works out its answer,
 * then follows the agent's voice as it speaks, and fades once the conversation goes quiet. It is
 * over the terminal but never in the way of the mouse, and costs nothing while the voice is off.
 */
export function VoiceGlow() {
  const state = useVoice((s) => s.state)
  const [thinking, setThinking] = useState(false)
  const was = useRef(state)

  useEffect(() => {
    const before = was.current
    was.current = state
    if (state === 'ready' && before === 'talking') {
      setThinking(true)
      const timer = window.setTimeout(() => setThinking(false), THINKING_MS)
      return () => window.clearTimeout(timer)
    }
    setThinking(false)
  }, [state])

  if (state === 'off') return null
  return <GlowLayer talking={state === 'talking'} answering={state === 'answering'} processing={state === 'connecting' || thinking} />
}

function GlowLayer({ talking, answering, processing }: { talking: boolean; answering: boolean; processing: boolean }) {
  const dark = usePrefs((s) => s.dark)
  const host = useRef<HTMLDivElement>(null)
  const renderer = useRef<VoiceGlowRenderer | null>(null)
  // Read by the renderer on every frame it draws, so nothing here re-renders while it runs.
  const now = useRef({ talking, answering, processing, dark })
  now.current = { talking, answering, processing, dark }

  useEffect(() => {
    const r = new VoiceGlowRenderer(host.current!, () => {
      const n = now.current
      return {
        active: n.talking || n.answering || n.processing,
        processing: n.processing && !n.talking && !n.answering,
        level: n.talking ? voiceMicLevel() : n.answering ? voiceAnswerLevel() : 0,
        light: !n.dark
      }
    })
    renderer.current = r
    return () => {
      r.dispose()
      renderer.current = null
    }
  }, [])

  useEffect(() => {
    if (talking || answering || processing) renderer.current?.wake()
  }, [talking, answering, processing])

  return <div ref={host} className="voice-glow" aria-hidden />
}
