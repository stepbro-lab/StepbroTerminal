/**
 * The workspace a `step://workspace/<name-or-id>` link asks for, or null for any other link.
 * A query string (`?new_window=true`, say) is ignored: there is one window, and it comes forward.
 */
export function workspaceKeyFromUrl(url: string): string | null {
  const m = /^step:\/\/workspace\/([^?#]+)/i.exec(url.trim())
  if (!m) return null
  let key = m[1]
  try {
    key = decodeURIComponent(key)
  } catch {
    /* keep it raw */
  }
  key = key.replace(/\/+$/, '').trim()
  return key || null
}
