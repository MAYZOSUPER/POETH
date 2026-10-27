// Портировано из Awakened PoE Trade (https://github.com/SnosMe/awakened-poe-trade),
// main/src/shortcuts/HostClipboard.ts (LANGUAGE_DETECTOR, isPoeItem), коммит 3188208957.
// MIT License, Copyright (c) SnosMe and contributors. Изменения POETH: отдельный чистый
// модуль; добавлены первые строки старого формата «Rarity:»/«Редкость:»; язык — только en/ru.

import type { ItemLang } from '@shared/types'

// Детектор «в буфере — текст предмета PoE» по первой строке. Чистый модуль —
// tests/overlay/itemText.test.ts. Узнаём и чужие языки клиента, чтобы опрос буфера
// сразу заканчивался, но поддерживаем (возвращаем) только en/ru.

interface FirstLine {
  prefix: string
  lang: ItemLang | null
}

const FIRST_LINES: readonly FirstLine[] = [
  { prefix: 'Item Class: ', lang: 'en' },
  { prefix: 'Класс предмета: ', lang: 'ru' },
  // старый формат копирования (до «Item Class») и некоторые служебные предметы
  { prefix: 'Rarity: ', lang: 'en' },
  { prefix: 'Редкость: ', lang: 'ru' },
  // клиенты, которые POETH пока не поддерживает
  { prefix: "Classe d'objet: ", lang: null },
  { prefix: 'Gegenstandsklasse: ', lang: null },
  { prefix: 'Classe do Item: ', lang: null },
  { prefix: 'Clase de objeto: ', lang: null },
  { prefix: 'ชนิดไอเทม: ', lang: null },
  { prefix: '아이템 종류: ', lang: null },
  { prefix: '物品種類: ', lang: null },
  { prefix: '物品类别: ', lang: null }
]

function match(text: string): FirstLine | undefined {
  if (typeof text !== 'string' || !text) return undefined
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  return FIRST_LINES.find((l) => s.startsWith(l.prefix))
}

/** В буфере текст предмета PoE (любого языка клиента). */
export function isItemText(text: string): boolean {
  return match(text) !== undefined
}

/** Язык клиента по тексту предмета: 'en' | 'ru'; null — не предмет или язык не поддерживается. */
export function detectItemLang(text: string): ItemLang | null {
  return match(text)?.lang ?? null
}
