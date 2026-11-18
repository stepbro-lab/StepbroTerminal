export function workspaceKeyFromUrl(url: string): string | null {
  const m = /^step:\/\/workspace\/([^?#]+)/i.exec(url.trim())
  if (!m) return null
  let key = m[1]
  try {
    key = decodeURIComponent(key)
  } catch {}
  key = key.replace(/\/+$/, '').trim()
  return key || null
}
