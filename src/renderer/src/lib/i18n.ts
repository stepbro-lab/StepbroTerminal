import { translate, type Language } from '@shared/i18n'

// Kept here rather than read from the preferences store, so plain library modules (and their
// tests) can translate without pulling the store, and the window, in. The store sets it.
let language: Language = 'en'

export function setCurrentLanguage(lang: Language | undefined): void {
  language = lang ?? 'en'
}

export function currentLanguage(): Language {
  return language
}

/** A string in the app's language. The English text is the key; placeholders look like {name}. */
export function t(key: string, params?: Record<string, string | number>): string {
  return translate(language, key, params)
}
