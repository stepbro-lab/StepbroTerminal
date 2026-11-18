import { useEffect } from 'react'
import { usePrefs } from '@/stores/prefs'
import { useTopito } from '@/stores/topito'
import { askTopito, openSession } from '@/lib/topito/director'
import { t } from '@/lib/i18n'
import { TopitoCanvas } from './TopitoCanvas'

export function useTopitoElsewhere(): void {
  useEffect(() => {
    useTopito.getState().enter()
    return () => useTopito.getState().leave()
  }, [])
}

const useEnabled = (): boolean => usePrefs((s) => s.prefs?.topito === true)

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
