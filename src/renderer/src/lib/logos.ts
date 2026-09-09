import type { LogoId } from '@shared/types'
import mono from '@/assets/logo-mono.png'
import color from '@/assets/logo-color.png'

/** The two looks of the logo, as the window draws them; the same files the icon script renders. */
export const LOGOS: Record<LogoId, { src: string; name: string; glow: string }> = {
  mono: { src: mono, name: 'Black and white', glow: 'radial-gradient(circle, rgba(255, 255, 255, 0.22) 0%, rgba(255, 255, 255, 0.1) 45%, transparent 70%)' },
  color: { src: color, name: 'Color', glow: 'radial-gradient(circle, rgba(255, 79, 196, 0.32) 0%, rgba(79, 123, 255, 0.28) 45%, transparent 70%)' }
}

export const DEFAULT_LOGO: LogoId = 'mono'
