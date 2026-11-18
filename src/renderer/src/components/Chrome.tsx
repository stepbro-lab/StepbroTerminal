import { useEffect, useRef, useState } from 'react'
import { Copy, Minus, PanelLeft, Settings, Square, X } from 'lucide-react'
import { useUi } from '@/stores/ui'
import { usePrefs } from '@/stores/prefs'
import { ActivityPulse } from './ActivityPulse'
import { UpdatePill } from './UpdatePill'
import { NotesButton } from './notes/NotesButton'
import { titled } from '@/lib/shortcuts'
import { Spring, type SpringConfig } from '@/lib/spring'
import { sincePointerOnRail } from '@/lib/rail'
import { registry } from '@/terminal/TerminalRegistry'
import { t } from '@/lib/i18n'

const platform = window.step.platform
const mac = platform === 'darwin'
const BAR_H = 36
const FRAME = 8
const LIGHTS_AT = 0.55
const LINGER_MS = 220
const RAIL_GRACE_MS = 600
const RAIL_REACH = 48
const EDGE_REST_MS = 400

function edgeRest(x: number | null): number {
  if (sincePointerOnRail() < RAIL_GRACE_MS) return EDGE_REST_MS
  const rail = mac && x !== null ? document.querySelector('.rail')?.getBoundingClientRect() : undefined
  return rail && x! >= rail.left - RAIL_REACH ? EDGE_REST_MS : 0
}

export const OPEN_BAR = 'step:open-bar'
const OPEN: SpringConfig = { stiffness: 520, damping: 44 }
const CLOSE: SpringConfig = { stiffness: 420, damping: 42 }

function windowCorner(maximized: boolean, fullscreen: boolean): { radius: number; squircle: boolean } {
  if (fullscreen) return { radius: 0, squircle: false }
  const version = window.step.osVersion.split('.').map(Number)
  if (mac) return version[0] >= 26 ? { radius: 30, squircle: true } : { radius: 10, squircle: false }
  if (platform === 'win32') return { radius: !maximized && version[2] >= 22000 ? 8 : 0, squircle: false }
  return { radius: 0, squircle: false }
}

export function useWindowCorners(): void {
  const maximized = useUi((s) => s.maximized)
  const fullscreen = useUi((s) => s.fullscreen)
  useEffect(() => {
    const root = document.documentElement
    const corner = windowCorner(maximized, fullscreen)
    root.style.setProperty('--window-radius', `${corner.radius}px`)
    root.toggleAttribute('data-squircle', corner.squircle)
    const zoom = (): void => root.style.setProperty('--zoom', String(window.outerWidth / window.innerWidth || 1))
    zoom()
    window.addEventListener('resize', zoom)
    return () => window.removeEventListener('resize', zoom)
  }, [maximized, fullscreen])
}

function SidebarToggle() {
  const collapsed = usePrefs((s) => s.prefs?.sidebarCollapsed ?? false)
  const setPrefs = usePrefs((s) => s.set)
  return (
    <button className="icon-btn no-drag" data-on={!collapsed} title={titled(t('Toggle sidebar'), 'toggle-sidebar')} onClick={() => void setPrefs({ sidebarCollapsed: !collapsed })}>
      <PanelLeft size={15} />
    </button>
  )
}

function ChromeButtons() {
  const folded = usePrefs((s) => s.prefs?.sidebarCollapsed ?? false)
  const settingsOpen = useUi((s) => s.settingsOpen)
  const setSettingsOpen = useUi((s) => s.setSettingsOpen)
  return (
    <div className="no-drag flex items-center gap-0.5">
      <ActivityPulse />
      <UpdatePill />
      <NotesButton />
      {folded && (
        <button className="icon-btn" data-on={settingsOpen} title={titled(t('Settings'), 'settings')} onClick={() => setSettingsOpen(!settingsOpen)}>
          <Settings size={15} />
        </button>
      )}
    </div>
  )
}

function CaptionButtons() {
  const maximized = useUi((s) => s.maximized)
  const win = platform === 'win32'
  return (
    <div className="caption no-drag" data-os={win ? 'win' : 'linux'}>
      <button className="caption-btn" title={t('Minimize')} onClick={() => window.step.send('win:minimize')}>
        {win ? '\uE921' : <Minus size={14} />}
      </button>
      <button className="caption-btn" title={t(maximized ? 'Restore' : 'Maximize')} onClick={() => window.step.send('win:maximize')}>
        {win ? (maximized ? '\uE923' : '\uE922') : maximized ? <Copy size={11} /> : <Square size={11} />}
      </button>
      <button className="caption-btn" data-k="close" title={t('Close')} onClick={() => window.step.send('win:close')}>
        {win ? '\uE8BB' : <X size={14} />}
      </button>
    </div>
  )
}

export function TopBar() {
  const fullscreen = useUi((s) => s.fullscreen)
  const hides = usePrefs((s) => s.prefs?.barHides !== false)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const openBar = useRef<() => void>(() => {})
  const edge = useRef<{ at: (x: number) => void; left: () => void }>({ at: () => {}, left: () => {} })

  useEffect(() => {
    const frame = ref.current?.parentElement
    if (!frame) return
    let isOpen = false
    let inside = false
    let lights = false
    let linger = 0
    let holding = false
    const holdFits = (): void => {
      if (holding) return
      holding = true
      registry.holdFits()
    }
    const releaseFits = (): void => {
      if (!holding) return
      holding = false
      registry.releaseFits()
    }
    const showLights = (v: boolean): void => {
      if (lights === v) return
      lights = v
      window.step.send('win:buttons', v)
    }
    const spring = new Spring(0, (v) => {
      const r = Math.max(0, v)
      const dpr = window.devicePixelRatio || 1
      frame.style.setProperty('--bar', r.toFixed(4))
      frame.style.setProperty('--bar-push', `${Math.round(r * (BAR_H - FRAME) * dpr) / dpr}px`)
      if (r > 0.001) frame.setAttribute('data-bar', '')
      else frame.removeAttribute('data-bar')
      if (isOpen && r >= LIGHTS_AT) showLights(true)
    }, releaseFits)
    const close = (): void => {
      if (!isOpen || !hides) return
      isOpen = false
      setOpen(false)
      window.step.send('win:bar', 0)
      showLights(false)
      holdFits()
      spring.to(0, CLOSE)
    }
    const closeSoon = (): void => {
      window.clearTimeout(linger)
      linger = window.setTimeout(() => {
        if (inside) return
        if (document.querySelector('[data-bar-keep]')) return closeSoon()
        close()
      }, LINGER_MS)
    }
    openBar.current = () => {
      window.clearTimeout(linger)
      if (isOpen) return
      isOpen = true
      inside = true
      setOpen(true)
      window.step.send('win:bar', BAR_H)
      holdFits()
      spring.to(1, OPEN)
    }
    if (!hides) openBar.current()
    const offs = [
      window.step.on('win:barPointer', (now) => {
        inside = now
        if (now) window.clearTimeout(linger)
        else if (isOpen) closeSoon()
      }),

      window.step.on('win:topEdge', () => {
        if (edgeRest(null) === 0) openBar.current()
      })
    ]
    let edgeTimer = 0
    edge.current = {
      at: (x) => {
        if (isOpen) return
        const rest = edgeRest(x)
        if (rest === 0) {
          window.clearTimeout(edgeTimer)
          edgeTimer = 0
          return openBar.current()
        }
        if (!edgeTimer) {
          edgeTimer = window.setTimeout(() => {
            edgeTimer = 0
            openBar.current()
          }, rest)
        }
      },
      left: () => {
        window.clearTimeout(edgeTimer)
        edgeTimer = 0
      }
    }
    const onOpenBar = (): void => openBar.current()
    window.addEventListener(OPEN_BAR, onOpenBar)
    return () => {
      offs.forEach((off) => off())
      window.removeEventListener(OPEN_BAR, onOpenBar)
      window.clearTimeout(edgeTimer)
      window.clearTimeout(linger)
      spring.stop()
      releaseFits()
      if (isOpen) window.step.send('win:bar', 0)
      showLights(false)
      setOpen(false)
      frame.style.setProperty('--bar', '0')
      frame.style.setProperty('--bar-push', '0px')
      frame.removeAttribute('data-bar')
    }
  }, [hides])

  return (
    <>
      {hides && !open && (
        <div
          className="bar-edge no-drag"
          onMouseEnter={(e) => e.buttons === 0 && edge.current.at(e.clientX)}
          onMouseMove={(e) => e.buttons === 0 && edge.current.at(e.clientX)}
          onMouseLeave={() => edge.current.left()}
        />
      )}
      <div ref={ref} className={open ? 'topbar drag' : 'topbar'} data-open={open}>
        {mac ? (
          <>
            <div className="topbar-buttons no-drag" style={{ paddingLeft: fullscreen ? 12 : 84 }}>
              <SidebarToggle />
            </div>
            <div className="topbar-buttons" style={{ marginLeft: 'auto', paddingRight: 10 }}>
              <ChromeButtons />
            </div>
          </>
        ) : (
          <>
            <div className="topbar-buttons gap-0.5" style={{ paddingLeft: 12 }}>
              <SidebarToggle />
              <ChromeButtons />
            </div>
            <CaptionButtons />
          </>
        )}
      </div>
    </>
  )
}
