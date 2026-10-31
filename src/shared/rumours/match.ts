// Слухи: поиск по началу строки на языке клиента и разбор текста журнала из буфера (S65; чистый модуль,
// tests/rumours/match.test.ts).
//
// Поиск — для ручного выбора трёх видимых слухов: игрок набирает первые буквы того, что видит в игре.
// Разбор — для хоткея над журналом: одно нажатие = одно копирование (Ctrl+C игры), дальше ищем в тексте строки
// слухов. Есть ли они в тексте журнала вообще — проверить в игре (docs/check-ingame.md); если нет, разбор просто
// ничего не находит, и окно предлагает выбрать вручную.

import type { RumourRecord } from './schema'

export type RumourLang = 'ru' | 'en'

/** Видно в игре 3 слуха; пул журнала — до 6 (переложить предмет — покажутся другие 3). */
export const RUMOURS_VISIBLE = 3
export const RUMOURS_POOL_MAX = 6

/** Нормальная форма для сравнения: регистр, ё/е, многоточие, апострофы, пробелы. */
export function normText(s: string): string {
  return s
    .normalize('NFC')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/…/g, '...')
    .replace(/[’‘ʼ`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/** Без знаков в конце: «Fallen stars...» и «fallen stars» — одно и то же. */
export function coreText(s: string): string {
  return normText(s).replace(/[\s.!?…,:;]+$/u, '')
}

/** Строка слуха на языке клиента; RU ещё не записана — английская. */
export function rumourText(r: RumourRecord, lang: RumourLang): string {
  return (lang === 'ru' ? r.text.ru : r.text.en) ?? r.text.en
}

export function islandName(r: RumourRecord, lang: RumourLang): string {
  return (lang === 'ru' ? r.island.ru : r.island.en) ?? r.island.en
}

/** Начало какого-нибудь слова строки (после пробела, дефиса, кавычки). */
function wordStarts(hay: string, q: string): boolean {
  for (let i = hay.indexOf(q); i >= 0; i = hay.indexOf(q, i + 1)) {
    if (i === 0 || /[\s\-'"«(]/.test(hay[i - 1])) return true
  }
  return false
}

/**
 * Слухи по набранному началу. Порядок: строка на языке клиента начинается с набранного → слово строки начинается
 * с него → остров → строка на другом языке (если клиент другой, чем думает настройка). Пустой запрос — все по
 * алфавиту строки на языке клиента.
 */
export function searchRumours(list: readonly RumourRecord[], query: string, lang: RumourLang): RumourRecord[] {
  const q = coreText(query)
  const other: RumourLang = lang === 'ru' ? 'en' : 'ru'
  const byText = (a: RumourRecord, b: RumourRecord): number => rumourText(a, lang).localeCompare(rumourText(b, lang), lang)
  if (!q) return [...list].sort(byText)
  const ranked: { r: RumourRecord; rank: number }[] = []
  for (const r of list) {
    const t = normText(rumourText(r, lang))
    const isl = normText(islandName(r, lang))
    const alt = normText((other === 'ru' ? r.text.ru : r.text.en) ?? '')
    let rank = -1
    if (t.startsWith(q)) rank = 0
    else if (wordStarts(t, q)) rank = 1
    else if (isl.startsWith(q) || wordStarts(isl, q)) rank = 2
    else if (alt && (alt.startsWith(q) || wordStarts(alt, q))) rank = 3
    if (rank >= 0) ranked.push({ r, rank })
  }
  return ranked.sort((a, b) => a.rank - b.rank || byText(a.r, b.r)).map((x) => x.r)
}

export interface RumoursRead {
  /** найденные слухи в порядке строк текста, без повторов, не больше RUMOURS_POOL_MAX */
  ids: string[]
  /** язык найденных строк; null — ничего не нашли */
  lang: RumourLang | null
}

/**
 * Найти строки слухов в тексте предмета (Ctrl+C игры над журналом). Строка совпадает целиком (без знаков в конце)
 * или содержит слух после двоеточия или тире («Слух: Упавшие звёзды...»). Короткие слухи (меньше 5 букв) — только
 * целой строкой, чтобы не цеплять случайные слова.
 */
export function readRumoursFromText(list: readonly RumourRecord[], text: string): RumoursRead {
  const keys: { id: string; key: string; lang: RumourLang }[] = []
  for (const r of list) {
    keys.push({ id: r.id, key: coreText(r.text.en), lang: 'en' })
    if (r.text.ru) keys.push({ id: r.id, key: coreText(r.text.ru), lang: 'ru' })
  }
  const ids: string[] = []
  const langs: RumourLang[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = coreText(raw)
    if (line.length < 3) continue
    const hit =
      keys.find((k) => k.key === line) ??
      keys.find((k) => k.key.length >= 5 && line.length <= k.key.length + 24 && /[:\-—–]\s*$/.test(line.slice(0, line.length - k.key.length)) && line.endsWith(k.key))
    if (!hit || ids.includes(hit.id)) continue
    ids.push(hit.id)
    langs.push(hit.lang)
    if (ids.length >= RUMOURS_POOL_MAX) break
  }
  const lang = !langs.length ? null : langs.filter((l) => l === 'ru').length * 2 >= langs.length ? 'ru' : 'en'
  return { ids, lang }
}
