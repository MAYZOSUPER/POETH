import type { UiLang } from './types'

// Имена по умолчанию, которые main и сторы дают новым персонажам (S42): на языке интерфейса, а не всегда
// по-русски. Уже сохранённые имена не переименовываются — это только для новых.

const NAMES = {
  ru: { character: 'Персонаж {n}', newCharacter: 'Новый персонаж', imported: 'Импортированный' },
  en: { character: 'Character {n}', newCharacter: 'New character', imported: 'Imported' }
} as const

const names = (lang: UiLang | undefined) => NAMES[lang === 'en' ? 'en' : 'ru']

/** «Персонаж 1» / «Character 1». */
export function characterName(lang: UiLang | undefined, n: number): string {
  return names(lang).character.replace('{n}', String(n))
}

/** Пустое имя при создании персонажа. */
export function newCharacterName(lang: UiLang | undefined): string {
  return names(lang).newCharacter
}

/** Пустое имя в импортированном профиле. */
export function importedName(lang: UiLang | undefined): string {
  return names(lang).imported
}
