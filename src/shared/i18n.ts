import { es } from './i18n.es'

/**
 * The app's language. English is the source: every string in the code is written in English
 * and doubles as its own key; the other languages map those strings to their translation and
 * fall back to English for anything missing. Placeholders look like {name}.
 */
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

/** Every English string a language table knows, for checking that nothing is left untranslated. */
export function knownKeys(lang: Language): Set<string> {
  return new Set(Object.keys(TABLES[lang] ?? {}))
}
