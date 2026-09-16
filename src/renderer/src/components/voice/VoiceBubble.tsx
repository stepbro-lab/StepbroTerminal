import { useEffect, useRef, useState } from 'react'
import { MicOff, TriangleAlert, X } from 'lucide-react'
import { ThinkingOrb, type OrbState } from 'thinking-orbs'
import { useUi } from '@/stores/ui'
import { useVoice } from '@/stores/voice'
import { t } from '@/lib/i18n'

const SIZE = 72
const ORB = 64
const EDGE = 20

/**
 * The voice, as a bubble over the terminal. It listens while it is open, swells with what it
 * hears, glows while it answers, and says underneath what it understood and what it did. Drag it
 * anywhere; it stays out of the way of the corner and the rail by starting at the bottom.
 */
export function VoiceBubble() {
  const { open, state, detail, heard, said, level, muted, did } = useVoice()
  const hide = useVoice((s) => s.hide)
  const setMuted = useVoice((s) => s.setMuted)
  const setSettingsOpen = useUi((s) => s.setSettingsOpen)
  const setSettingsPage = useUi((s) => s.setSettingsPage)
  const [at, setAt] = useState<{ x: number; y: number } | null>(null)
  const drag = useRef<{ dx: number; dy: number } | null>(null)

  // Bottom right to begin with, and back inside the window if it is made smaller.
  useEffect(() => {
    const place = (): void =>
      setAt((prev) => {
        const x = Math.min(prev?.x ?? window.innerWidth - SIZE - EDGE, window.innerWidth - SIZE - 8)
        const y = Math.min(prev?.y ?? window.innerHeight - SIZE - EDGE, window.innerHeight - SIZE - 8)
        return { x: Math.max(8, x), y: Math.max(8, y) }
      })
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [])

  useEffect(() => {
    if (!drag.current) return
    const move = (e: MouseEvent): void => {
      const d = drag.current
      if (!d) return
      setAt({
        x: Math.max(8, Math.min(window.innerWidth - SIZE - 8, e.clientX - d.dx)),
        y: Math.max(8, Math.min(window.innerHeight - SIZE - 8, e.clientY - d.dy))
      })
    }
    const up = (): void => {
      drag.current = null
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
  })

  if (!open || !at) return null

  const failed = state === 'error'
  const caption = failed ? errorText(detail) : said || heard || hint(state)
  const doneText = did ? doneLine(did) : ''
  // The orb answers to the microphone while listening: quicker as the voice rises.
  const speed = state === 'listening' && !muted ? 0.8 + level * 1.6 : 1

  return (
    <div
      className="voice no-drag"
      style={{ left: at.x, top: at.y }}
      data-side={at.x + SIZE / 2 > window.innerWidth / 2 ? 'right' : 'left'}
      data-vside={at.y + SIZE > window.innerHeight - 180 ? 'up' : 'down'}
      role="dialog"
      aria-label={t('Voice')}
    >
      <div className="voice-body">
        <button
          className="voice-orb"
          data-state={failed ? 'error' : state}
          data-muted={muted}
          title={t(muted ? 'Listen again' : 'Stop listening')}
          onMouseDown={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top }
          }}
          onClick={() => {
            if (!failed) setMuted(!muted)
          }}
        >
          {failed ? <TriangleAlert size={20} /> : <ThinkingOrb size={ORB} state={orbState(state)} speed={speed} paused={muted} />}
          {muted && !failed && (
            <span className="voice-muted">
              <MicOff size={16} />
            </span>
          )}
        </button>
        <button className="voice-close" title={t('Close')} onClick={hide}>
          <X size={12} />
        </button>
      </div>
      {(caption || doneText) && (
        <div className="voice-caption" data-error={failed}>
          {doneText && <div className="voice-did">{doneText}</div>}
          {caption && <div className="voice-text">{caption}</div>}
          {detail === 'no-key' && (
            <button
              className="voice-fix"
              onClick={() => {
                setSettingsPage('agents')
                setSettingsOpen(true)
                hide()
              }}
            >
              {t('Open settings')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/** Which of the orb's nine moods fits what the voice is doing. */
function orbState(state: string): OrbState {
  if (state === 'connecting') return 'connecting'
  if (state === 'speaking') return 'composing'
  return 'listening'
}

function hint(state: string): string {
  if (state === 'connecting') return t('Connecting…')
  if (state === 'listening') return t('Listening')
  return ''
}

/** What went wrong, in words worth reading; anything unexpected is repeated as it came. */
function errorText(detail: string): string {
  if (detail === 'no-key') return t('Add a Gemini key in Settings to talk.')
  if (detail === 'microphone-denied') return t('stepbro terminal needs the microphone to hear you.')
  return detail || t('The voice stopped.')
}

function doneLine(did: NonNullable<ReturnType<typeof useVoice.getState>['did']>): string {
  switch (did.kind) {
    case 'wrote':
      return t('Written on {session}. Read it and press Enter.', { session: did.session })
    case 'sent':
      return t('Sent to {session}.', { session: did.session })
    case 'read':
      return t('Read {session}.', { session: did.session })
    case 'focused':
      return t('{session} is in front.', { session: did.session })
    default:
      return ''
  }
}
