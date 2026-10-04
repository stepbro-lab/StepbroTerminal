/** A machine of one's own: a dev server is reached over plain http. */
const LOCAL = /^(localhost|127(\.\d{1,3}){3}|0\.0\.0\.0|\[::1\]|10(\.\d{1,3}){3}|192\.168(\.\d{1,3}){2}|172\.(1[6-9]|2\d|3[01])(\.\d{1,3}){2})(:\d+)?([/?#]|$)/i

/**
 * The page an address typed into the preview's bar means, or null when it is not one. The way a
 * browser's bar reads it: "localhost:3000/admin", "127.0.0.1:5173" or ":8080" are a dev server, over
 * http; "example.com" is a site, over https. Only web pages open there, as when an agent opens one:
 * file:, javascript: and the like are not addresses here.
 */
export function addressFrom(input: string): string | null {
  const t = input.trim()
  if (!t || /\s/.test(t)) return null
  let candidate: string
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) candidate = t
  else if (/^:\d+([/?#]|$)/.test(t)) candidate = `http://localhost${t}`
  else if (LOCAL.test(t)) candidate = `http://${t}`
  else if (/^[^/?#:]+\.[a-z]{2,}(:\d+)?([/?#]|$)/i.test(t)) candidate = `https://${t}`
  else return null
  try {
    const u = new URL(candidate)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null
  } catch {
    return null
  }
}
