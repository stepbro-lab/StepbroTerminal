import type { LogoId } from '@shared/types'
import light from '@/assets/logo-light.png'
import dark from '@/assets/logo-dark.png'

export const LOGOS: Record<LogoId, { src: string; name: string; glow: string }> = {
  light: { src: light, name: 'Light', glow: 'radial-gradient(circle, rgba(255, 255, 255, 0.22) 0%, rgba(255, 255, 255, 0.1) 45%, transparent 70%)' },
  dark: { src: dark, name: 'Dark', glow: 'radial-gradient(circle, rgba(255, 255, 255, 0.16) 0%, rgba(255, 255, 255, 0.07) 45%, transparent 70%)' }
}

export const DEFAULT_LOGO: LogoId = 'light'

export function logoOf(id: string | undefined): LogoId {
  return id !== undefined && id in LOGOS ? (id as LogoId) : DEFAULT_LOGO
}
