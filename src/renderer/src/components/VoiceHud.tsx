import { useEffect, useRef, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { displayChord, resolveBindings } from '@shared/keybindings'
import { usePrefs } from '@/stores/prefs'
import { LOGOS, logoOf } from '@/lib/logos'
import { t } from '@/lib/i18n'
import { isMac } from '@/lib/format'

/**
 * The pill that floats while you talk to the terminal. Its own little window, with no App around
 * it: no sessions, no terminals, no host — the logo, a line of text, and a row of bars that move
 * with whoever is speaking.
 *
 * Drag it anywhere and it stays there. Fold it down to a bead when it is in the way: folding is a
 * matter of how much room it takes on screen and nothing else, so it goes on listening either way.
 */
type HudState = 'connecting' | 'talking' | 'answering'

const SAID: Record<HudState, string> = {
  connecting: 'Getting ready…',
  talking: 'Listening',
  answering: 'On it'
}

/**
 * How loud each side is, as last reported. Kept here rather than in state: it arrives twenty times
 * a second and is read sixty times a second, and neither has any business re-rendering anything.
 */
const level = { mine: 0, theirs: 0 }

export function VoiceHud() {
  const [state, setState] = useState<HudState>('connecting')
  const prefs = usePrefs((s) => s.prefs)
  const folded = !!prefs?.voiceHudFolded

  useEffect(() => {
    // Its own window, so it loads the preferences itself: the theme, the accent, the logo and the
    // language all come from there, and it follows them as they change.
    void usePrefs.getState().load()
    const offHud = window.step.on('voice:hud', (next) => setState(next as HudState))
    const offLevel = window.step.on('voice:hudLevel', (mine, theirs) => {
      level.mine = mine
      level.theirs = theirs
    })
    const offPrefs = window.step.on('prefs:update', (p) => usePrefs.getState().applyRemote(p))
    return () => {
      offHud()
      offLevel()
      offPrefs()
    }
  }, [])

  const fold = (next: boolean): void => {
    // Written to the preferences rather than kept here, so the window is resized to match and it
    // comes back the way you left it. Nothing about the conversation is touched.
    void usePrefs.getState().set({ voiceHudFolded: next })
  }

  const chord = prefs ? resolveBindings(prefs.keybindings, isMac)['voice-anywhere'] : null
  const logo = LOGOS[logoOf(prefs?.logo)]
  if (folded) {
    return (
      <div className="voice-hud voice-hud-folded" data-state={state} onDoubleClick={() => fold(false)}>
        <img className="voice-hud-logo" src={logo.src} alt="" draggable={false} />
        <Bars state={state} count={7} />
        <button className="voice-hud-fold" title={t('Unfold')} onClick={() => fold(false)}>
          <ChevronRight size={13} />
        </button>
      </div>
    )
  }
  // One line and nothing else. The keys that end the turn belong in the tooltip: spelled out in
  // the pill they take more room than the words do, and crowd out the bars.
  const hint = state === 'talking' && chord ? t('Press {keys} again to send', { keys: displayChord(chord, isMac) }) : undefined
  return (
    <div className="voice-hud" data-state={state} title={hint}>
      <img className="voice-hud-logo" src={logo.src} alt="" draggable={false} />
      <span className="voice-hud-said">{t(SAID[state] ?? SAID.talking)}</span>
      <Bars state={state} count={16} />
      <button className="voice-hud-fold" title={t('Fold it away; it keeps listening')} onClick={() => fold(true)}>
        <ChevronRight size={13} />
      </button>
    </div>
  )
}

/** How loud a voice has to be to fill the bars; ordinary speech sits low. */
const FULL = 0.22
/** The height a bar keeps when nobody is speaking, so the row never reads as frozen. */
const REST = 0.12
/** How quickly a bar rises towards the sound, and how slowly it falls back. */
const RISE = 0.34
const FALL = 0.12

/**
 * The bars, Whisper Flow's way: a row that leans towards the middle, breathing while it waits and
 * jumping with the voice when there is one. Each bar runs on its own phase, so the row ripples
 * rather than pumping as one block, and rises fast and falls slow, which is how sound behaves and
 * what makes the difference between lively and twitchy.
 *
 * Drawn on a canvas from an animation frame, reading two plain numbers. Nothing here goes near
 * React, which is the whole reason it can run at sixty frames a second without the app feeling it.
 */
function Bars({ state, count }: { state: HudState; count: number }) {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const el = canvas.current
    const ctx = el?.getContext('2d')
    if (!el || !ctx) return
    const dpr = window.devicePixelRatio || 1
    const w = el.clientWidth
    const h = el.clientHeight
    el.width = Math.round(w * dpr)
    el.height = Math.round(h * dpr)
    ctx.scale(dpr, dpr)
    // Read once per state: it comes from the stylesheet, which cannot change between two frames
    // without the pill being rebuilt anyway.
    const styles = getComputedStyle(el)
    const color = styles.getPropertyValue(state === 'answering' ? '--voice-them' : state === 'talking' ? '--voice-me' : '--voice-idle').trim()

    const gap = 2.6
    const bar = Math.max(2, (w - gap * (count - 1)) / count)
    const heights = new Array<number>(count).fill(REST)
    // A phase each, spread unevenly so no two bars ever quite agree.
    const phases = Array.from({ length: count }, (_, i) => i * 0.7 + Math.sin(i * 2.3) * 1.4)
    let frame = 0
    let tick = 0

    const paint = (): void => {
      tick += state === 'connecting' ? 0.04 : 0.09
      const loud = state === 'answering' ? level.theirs : state === 'talking' ? level.mine : 0
      const reach = Math.min(1, loud / FULL)

      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = color
      for (let i = 0; i < count; i++) {
        // Tallest in the middle, tapering to the ends, the way a voice reads on a meter.
        const middle = 1 - Math.abs(i / (count - 1) - 0.5) * 2
        const shape = 0.45 + 0.55 * Math.pow(middle, 0.7)
        const ripple = 0.5 + 0.5 * Math.sin(tick + phases[i])
        const want = REST + (1 - REST) * reach * shape * (0.55 + 0.45 * ripple)
        // Breathing while it waits: small, slow, and never still.
        const idle = REST * (1 + 0.85 * ripple)
        const target = Math.max(idle, want)
        heights[i] += (target - heights[i]) * (target > heights[i] ? RISE : FALL)

        const tall = Math.max(bar, heights[i] * h)
        const x = i * (bar + gap)
        const y = (h - tall) / 2
        ctx.beginPath()
        ctx.roundRect(x, y, bar, tall, bar / 2)
        ctx.fill()
      }
      frame = requestAnimationFrame(paint)
    }
    frame = requestAnimationFrame(paint)
    return () => cancelAnimationFrame(frame)
  }, [state, count])

  return <canvas ref={canvas} className="voice-hud-bars" data-count={count} />
}
