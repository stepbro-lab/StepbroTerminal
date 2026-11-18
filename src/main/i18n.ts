import { translate, type Language } from '@shared/i18n'

let language: Language = 'en'

export function setLanguage(lang: Language): void {
  language = lang
}

export function currentLanguage(): Language {
  return language
}

export function t(key: string, params?: Record<string, string | number>): string {
  return translate(language, key, params)
}
