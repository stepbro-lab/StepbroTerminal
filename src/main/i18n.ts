import { translate, type Language } from '@shared/i18n'

let language: Language = 'en'

/** Set from the preferences at startup and whenever they change; menus and notices read it. */
export function setLanguage(lang: Language): void {
  language = lang
}

export function currentLanguage(): Language {
  return language
}

/** A string in the app's language. The English text is the key; placeholders look like {name}. */
export function t(key: string, params?: Record<string, string | number>): string {
  return translate(language, key, params)
}
