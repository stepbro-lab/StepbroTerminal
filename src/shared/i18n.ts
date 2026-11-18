import { es } from './i18n.es'

export type Language = 'en' | 'es'

export const LANGUAGES: Array<{ id: Language; label: string }> = [
  { id: 'en', label: 'English' },
  { id: 'es', label: 'Español' }
]

const TABLES: Record<Language, Record<string, string>> = { en: {}, es }

export function translate(lang: Language, key: string, params?: Record<string, string | number>): string {
  const text = TABLES[lang]?.[key] ?? key
  if (!params) return text
  return text.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m))
}

export function knownKeys(lang: Language): Set<string> {
  return new Set(Object.keys(TABLES[lang] ?? {}))
}
