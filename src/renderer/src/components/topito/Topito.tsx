import { usePrefs } from '@/stores/prefs'
import { useTopito } from '@/stores/topito'
import { askTopito, openSession } from '@/lib/topito/director'
import { t } from '@/lib/i18n'
import { TopitoCanvas } from './TopitoCanvas'

/** Whether Topito is out at all; he is unless turned off in Settings. */
const useEnabled = (): boolean => usePrefs((s) => s.prefs?.topito !== false)

/**
 * Topito at the foot of the sidebar, doing whatever the agents are doing. Clicking him asks what is
 * going on, and he answers in a bubble whose lines take you to the sessions they name.
 */
export function TopitoDock() {
  const enabled = useEnabled()
  const ambient = useTopito((s) => s.ambient)
  const moment = useTopito((s) => s.moment)
  const finish = useTopito((s) => s.finish)
  const bubble = useTopito((s) => s.bubble)
  const hideBubble = useTopito((s) => s.hideBubble)
  if (!enabled) return null
  return (
    <div className="topito-dock">
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
      <button className="topito-dock-button" title={t('Topito · click to ask what is going on')} onClick={askTopito}>
        <TopitoCanvas key={moment ? `moment-${moment.key}` : ambient} clip={moment?.clip ?? ambient} once={!!moment} onDone={finish} cell={4} rows={16} />
      </button>
    </div>
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
