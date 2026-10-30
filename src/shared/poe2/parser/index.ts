// Парсер текста предмета PoE2 (порт Exiled Exchange 2, чистый TS) — EN и RU клиент.
//
//   const store = getDefaultPoe2DataStore()          // renderer: данные по poeth://data/poe2/<lang>/…
//   const d = await store.ensureLanguage(detectItemLang(text)!)
//   const res = parseClipboard(text, d)
//   if (res.ok) res.value.info.refName  // английское имя → в запрос трейда
//
// Язык определяется по первой строке (`Item Class:` / `Класс предмета:`, detectItemLang); у мета-камней строки
// класса нет — для них язык выбирает вызывающий. Разбирается и расширенный Ctrl+Alt+C (строки `{ … }`, роллы
// `57(41-60)`), и обычный Ctrl+C (суффиксы `(implicit)`, `(rune)`, `(enchant)`, `(desecrated)`…).

import { detectItemLang } from '../../poe1/data/lang'
import { Poe2Data } from '../data/Poe2Data'
import type { Poe2Lang } from '../data/interfaces'
import type { Poe2DataStore } from '../data/store'
import { parseClipboard, type ParseResult, type Poe2ParseOptions } from './Parser'

export type { ParsedItem, EditorItem } from './ParsedItem'
export { ItemRarity, ItemInfluence, IncursionRoom, createVirtualItem, itemIsModifiable } from './ParsedItem'
export {
  parseClipboard,
  parseModifiersPoe2,
  parseStatsFromMod,
  getMaxSockets,
  isArmourOrWeaponOrCaster,
  type ParseResult,
  type ParseErrorCode,
  type Poe2ParseOptions,
  type ParserState
} from './Parser'
export * from './meta'
export {
  ModifierType,
  EXPLICIT_MOD_TYPES,
  INTERNAL_AUGMENT_TYPES,
  sumStatsByModType,
  statSourcesTotal,
  translateStatWithRoll,
  modsEqual,
  type StatCalculated,
  type StatSource,
  type StatRoll
} from './modifiers'
export { type ParsedModifier, type ModifierInfo } from './advanced-mod-desc'
export { tryParseTranslation, matchStatLine, getRollOrMinmaxAvg, type ParsedStat } from './stat-translations'
export { magicBasetype } from './magic-name'
export * from './calc-q20'
export * from './calc-base'
export {
  buildEditorItems,
  selectAugmentEffectByItemCategory,
  getSavedAugments,
  type SavedAugments
} from './augment-builder'
export { summarizeItem, type ItemSummary } from './summary'
export { stat, registeredStatRefs } from './statRef'

/** Синхронный разбор: данные нужного языка уже загружены (один объект или по языкам). */
export function parseItem(
  text: string,
  data: Poe2Data | Partial<Record<Poe2Lang, Poe2Data>>,
  opts?: Poe2ParseOptions
): ParseResult {
  const lang = detectItemLang(text)
  if (!lang) {
    // мета-камни копируются без строки класса — пробуем данными, если они одни
    if (data instanceof Poe2Data) return parseClipboard(text, data, opts)
    return { ok: false, error: 'item.unknown_lang' }
  }
  const d = data instanceof Poe2Data ? (data.lang === lang ? data : undefined) : data[lang]
  if (!d) return { ok: false, error: 'item.unknown_lang', detail: `данные ${lang} не загружены` }
  return parseClipboard(text, d, opts)
}

/** Разбор с автозагрузкой данных языка текста. */
export async function parseItemText(text: string, store: Poe2DataStore, opts?: Poe2ParseOptions): Promise<ParseResult> {
  const lang = detectItemLang(text)
  if (!lang) return { ok: false, error: 'item.unknown_lang' }
  return parseClipboard(text, await store.ensureLanguage(lang), opts)
}
