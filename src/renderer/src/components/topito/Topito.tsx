import { useEffect } from 'react'
import { usePrefs } from '@/stores/prefs'
import { useTopito } from '@/stores/topito'
import { askTopito, openSession } from '@/lib/topito/director'
import { t } from '@/lib/i18n'
import { TopitoCanvas } from './TopitoCanvas'

/**
 * For a Topito shown on his own somewhere else (the empty state, what is new): the sidebar's ducks
 * into his hole while that one is out, so there is only ever one of him.
 */
export function useTopitoElsewhere(): void {
  useEffect(() => {
    useTopito.getState().enter()
    return () => useTopito.getState().leave()
  }, [])
}

/** Whether Topito is out at all: he stays in until turned on in Settings. */
const useEnabled = (): boolean => usePrefs((s) => s.prefs?.topito === true)

/**
 * Topito between the two buttons at the foot of the sidebar, doing whatever the agents are doing.
 * He stands on that row instead of taking room of his own. Clicking him asks what is going on, and
 * he answers in a bubble whose lines take you to the sessions they name. While he is out somewhere
 * else, at the corner of the terminal or on a page of his own, he ducks into his hole here.
 */
export function TopitoDock() {
  const enabled = useEnabled()
  const ambient = useTopito((s) => s.ambient)
  const moment = useTopito((s) => s.moment)
  const away = useTopito((s) => !!s.corner || s.elsewhere > 0)
  const finish = useTopito((s) => s.finish)
  const bubble = useTopito((s) => s.bubble)
  const hideBubble = useTopito((s) => s.hideBubble)
  if (!enabled) return null
  const clip = away ? 'away' : (moment?.clip ?? ambient)
  return (
    <>
      {bubble && (
        <div key={bubble.key} className="topito-bubble fade-in">
          {bubble.lines.map((line, i) =>
            line.sessionId ? (
              <button
                key={i}
                className="topito-line topito-link"
                onClick={() => {
                  openSession(line.sessionId!)
                  hideBubble()
                }}
              >
                {line.text}
              </button>
            ) : (
              <span key={i} className="topito-line">
                {line.text}
              </span>
            )
          )}
        </div>
      )}
      <button className="topito-dock" title={t('Topito · click to ask what is going on')} onClick={askTopito}>
        <TopitoCanvas key={away ? 'away' : moment ? `moment-${moment.key}` : ambient} clip={clip} once={!away && !!moment} onDone={finish} cell={3} rows={15} />
      </button>
    </>
  )
}

/**
 * Topito popping out at the corner of the terminal: when an agent has something to tell you, or
 * when a session starts waiting on you. A click takes you to that session.
 */
export function TopitoCorner() {
  const enabled = useEnabled()
  const corner = useTopito((s) => s.corner)
  const hideCorner = useTopito((s) => s.hideCorner)
  if (!enabled || !corner) return null
  return (
    <button
      key={corner.key}
      className="topito-corner fade-in"
      onClick={() => {
        if (corner.sessionId) openSession(corner.sessionId)
        hideCorner()
      }}
    >
      <span className="topito-corner-bubble">
        {corner.from && <span className="topito-corner-from">{corner.from}</span>}
        {corner.text}
      </span>
      <TopitoCanvas clip={corner.clip} cell={4} rows={15} />
    </button>
  )
}
