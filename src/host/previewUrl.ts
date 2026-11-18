const LOCAL = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\])(?::\d{2,5})?(?:\/[^\s"'<>)\]]*)?/

export function previewUrlIn(data: string, ownPort?: number): string | null {
  if (!/localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\]/.test(data)) return null
  const m = LOCAL.exec(data)
  if (!m) return null
  const url = m[0].replace(/0\.0\.0\.0|\[::1?\]/, 'localhost').replace(/[.,;:]+$/, '')
  if (isOwnEndpoint(url, ownPort)) return null
  return url
}

export function isOwnEndpoint(url: string, ownPort?: number): boolean {
  if (/\/(?:mcp|hooks)\/[0-9a-f]{8,}/i.test(url) || url.includes('$')) return true
  if (!ownPort) return false
  try {
    return Number(new URL(url).port) === ownPort
  } catch {
    return true
  }
}
