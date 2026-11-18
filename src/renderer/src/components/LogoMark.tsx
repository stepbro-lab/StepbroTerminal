import { usePrefs } from '@/stores/prefs'
import { LOGOS, logoOf } from '@/lib/logos'

export function LogoMark({ size = 72 }: { size?: number }) {
  const logo = LOGOS[logoOf(usePrefs((s) => s.prefs?.logo))]
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <div className="pointer-events-none absolute rounded-full" style={{ inset: -size * 0.35, background: logo.glow, filter: 'blur(10px)', opacity: 0.6 }} />
      <img src={logo.src} alt="" draggable={false} className="relative block select-none" style={{ width: size, height: size, borderRadius: size * 0.22 }} />
    </div>
  )
}
