// Парсер текста предмета PoE1 (порт Awakened PoE Trade, чистый TS) — EN и RU клиент.
//
//   const store = getDefaultPoe1DataStore()          // renderer: данные по poeth://data/poe1/<lang>/…
//   const res = await parseItemText(clipboardText, store)
//   if (res.ok) res.value.info.refName  // английское имя → в запрос трейда
//
// Язык определяется по первой строке (`Item Class:` / `Класс предмета:`), данные нужного языка грузятся
// один раз и кэшируются стором.

import { detectItemLang } from '../data/lang'
import { Poe1Data } from '../data/Poe1Data'
import type { Poe1Lang } from '../data/interfaces'
import type { Poe1DataStore } from '../data/store'
import { parseClipboard, type ParseResult } from './Parser'

export type { ParsedItem } from './ParsedItem'
export { ItemRarity, ItemInfluence, IncursionRoom, createVirtualItem } from './ParsedItem'
export { parseClipboard, makeIdentifiedUnique, type ParseResult, type ParseErrorCode } from './Parser'
export * from './meta'
export {
  ModifierType,
  ModifierMechanic,
  sumStatsByModType,
  statSourcesTotal,
  translateStatWithRoll,
  type StatCalculated,
  type StatSource,
  type StatRoll
} from './modifiers'
export { type ParsedModifier, type ModifierInfo } from './advanced-mod-desc'
export { tryParseTranslation, matchStatLine, type ParsedStat } from './stat-translations'
export { magicBasetype } from './magic-name'
export * from './calc-q20'
export { detectTimelessJewel, type TimelessJewelInfo } from './timeless'
export { summarizeItem, type ItemSummary } from './summary'
export { EXTRA_STRINGS, type ExtraStrings } from './extra-strings'
export { stat, registeredStatRefs } from './statRef'

/** Синхронный разбор: данные нужного языка уже загружены (один объект или по языкам). */
export function parseItem(text: string, data: Poe1Data | Partial<Record<Poe1Lang, Poe1Data>>): ParseResult {
  const lang = detectItemLang(text)
  if (!lang) return { ok: false, error: 'item.unknown_lang' }
  const d = data instanceof Poe1Data ? (data.lang === lang ? data : undefined) : data[lang]
  if (!d) return { ok: false, error: 'item.unknown_lang', detail: `данные ${lang} не загружены` }
  return parseClipboard(text, d)
}

/** Разбор с автозагрузкой данных языка текста. */
export async function parseItemText(text: string, store: Poe1DataStore): Promise<ParseResult> {
  const lang = detectItemLang(text)
  if (!lang) return { ok: false, error: 'item.unknown_lang' }
  return parseClipboard(text, await store.ensureLanguage(lang))
}
