const LOCAL = /^(localhost|127(\.\d{1,3}){3}|0\.0\.0\.0|\[::1\]|10(\.\d{1,3}){3}|192\.168(\.\d{1,3}){2}|172\.(1[6-9]|2\d|3[01])(\.\d{1,3}){2})(:\d+)?([/?#]|$)/i

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
