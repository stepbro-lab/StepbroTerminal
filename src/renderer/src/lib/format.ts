import { t } from './i18n'
export function shortPath(p: string, home?: string): string {
  let out = p
  if (home && out.toLowerCase().startsWith(home.toLowerCase())) out = '~' + out.slice(home.length)
  return out.replace(/\\/g, window.step.platform === 'win32' ? '\\' : '/')
}

export function formatTokens(n: number | undefined): string {
  if (!n) return ''
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M tokens`
  if (n >= 10_000) return `${Math.round(n / 1000)}k tokens`
  return `${n.toLocaleString('en-US')} tokens`
}

export function formatCost(usd: number | undefined): string {
  if (usd === undefined || usd === null) return ''
  if (usd < 0.01) return '<$0.01'
  return `$${usd.toFixed(2)}`
}

export function timeAgo(ts: number): string {
  if (!ts) return ''
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60_000)
  if (m < 1) return t('now')
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d`
  return new Date(ts).toLocaleDateString()
}

export function shortModel(model: string | undefined): string {
  if (!model) return ''
  return model
    .replace(/^claude-/, '')
    .replace(/-\d{8}$/, '')
    .replace(/-/g, ' ')
}

export const isMac = window.step.platform === 'darwin'
export const modKey = isMac ? '⌘' : 'Ctrl'
