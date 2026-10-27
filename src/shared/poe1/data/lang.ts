// Язык текста предмета — по первой строке (`Item Class:` / `Класс предмета:`), до загрузки данных.
// Строки совпадают с ITEM_CLASS из client_strings (проверяет tests/poe1/data.test.ts).

import type { Poe1Lang } from './interfaces'

export const ITEM_CLASS_PREFIX: Readonly<Record<Poe1Lang, string>> = {
  en: 'Item Class: ',
  ru: 'Класс предмета: '
}

export function detectItemLang(text: string): Poe1Lang | undefined {
  const first = text.replace(/^﻿/, '').trimStart().split(/\r?\n/, 1)[0] ?? ''
  for (const lang of Object.keys(ITEM_CLASS_PREFIX) as Poe1Lang[]) {
    if (first.startsWith(ITEM_CLASS_PREFIX[lang])) return lang
  }
  return undefined
}
