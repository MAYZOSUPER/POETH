// Порт из Exiled Exchange 2 — https://github.com/Kvan7/Exiled-Exchange-2 (форк Awakened PoE Trade)
// Copyright (c) Alexander Drozdov (SnosMe), Kvan7 and contributors, MIT License.
// Исходник: renderer/src/assets/data/index.ts @ cca30662bf31eaf38bd711e2ec1a6b899a06c40e
// Изменения POETH: как у PoE1 (src/shared/poe1/data/Poe1Data.ts) — вместо модульных глобальных переменных объект
// данных одного языка (держим EN и RU одновременно), поиск учитывает все записи с одинаковым хэшем, канонизация
// обобщённого мн. числа в RU-строках («секунд(-ы)»); строки клиента EN (`refStrings`, у EE2 — CLIENT_STRINGS_REF)
// лежат в том же объекте. Данные сайта трейда (TradeData EE2) не подгружаются: незнакомые моды и предметы —
// фолбэк main по data/stats (как у PoE1).

import type {
  AugmentData,
  AugmentDataByAugment,
  AugmentDataByTradeId,
  BaseType,
  Poe2Lang,
  Stat,
  StatMatcher,
  TranslationDict
} from './interfaces'
import { fnv1a32 } from '../../poe1/data/fnv1a'
import { lookupStarts } from '../../poe1/data/indexes'

export type Poe2ItemNamespace = BaseType['namespace']

export interface Poe2DataParts {
  lang: Poe2Lang
  strings: TranslationDict
  /** строки клиента EN (для EN-данных — те же `strings`) */
  refStrings: TranslationDict
  itemsNdjson: string
  itemsByName: Uint32Array
  itemsByRefName: Uint32Array
  statsNdjson: string
  statsByRef: Uint32Array
  statsByMatcher: Uint32Array
}

function lineAt(ndjson: string, start: number): string {
  let end = ndjson.indexOf('\n', start)
  if (end === -1) end = ndjson.length
  return ndjson.slice(start, end)
}

function hasMatcher(stat: Stat, matchStr: string): boolean {
  return stat.matchers.some((m) => m.string === matchStr || m.advanced === matchStr)
}

/** Данные PoE2 одного языка: предметы, статы, строки клиента. Записи парсятся при каждом поиске (как у EE2):
 *  парсер может мутировать полученный Stat, кэш от этого не портится. */
export class Poe2Data {
  readonly lang: Poe2Lang
  readonly strings: TranslationDict
  readonly refStrings: TranslationDict
  private readonly items: string
  private readonly itemsByName: Uint32Array
  private readonly itemsByRefName: Uint32Array
  private readonly stats: string
  private readonly statsByRef: Uint32Array
  private readonly statsByMatcher: Uint32Array
  private pluralMatchers?: Array<{ re: RegExp; canonical: string }>
  private tradeTagToRefCache?: Map<string, string>
  private augmentsCache?: { byAugment: AugmentDataByAugment; byTradeId: AugmentDataByTradeId }

  constructor(parts: Poe2DataParts) {
    this.lang = parts.lang
    this.strings = parts.strings
    this.refStrings = parts.refStrings
    this.items = parts.itemsNdjson
    this.itemsByName = parts.itemsByName
    this.itemsByRefName = parts.itemsByRefName
    this.stats = parts.statsNdjson
    this.statsByRef = parts.statsByRef
    this.statsByMatcher = parts.statsByMatcher
  }

  // ------------------------------------------------------------------ предметы

  private findItems(index: Uint32Array, prop: 'name' | 'refName', ns: Poe2ItemNamespace, name: string): BaseType[] | undefined {
    const out: BaseType[] = []
    const seen = new Set<number>()
    for (let start of lookupStarts(index, fnv1a32(`${ns}::${name}`))) {
      while (start < this.items.length && !seen.has(start)) {
        seen.add(start)
        const line = lineAt(this.items, start)
        const record = JSON.parse(line) as BaseType
        if (record.namespace !== ns || record[prop] !== name) break
        out.push(record)
        if (!record.disc && !record.unique) break
        start += line.length + 1
      }
    }
    return out.length ? out : undefined
  }

  /** Записи по имени на языке данных (как в тексте предмета). EE2: ITEM_BY_TRANSLATED. */
  itemByTranslated(ns: Poe2ItemNamespace, name: string): BaseType[] | undefined {
    return this.findItems(this.itemsByName, 'name', ns, name)
  }

  /** Записи по английскому имени. EE2: ITEM_BY_REF. */
  itemByRef(ns: Poe2ItemNamespace, refName: string): BaseType[] | undefined {
    return this.findItems(this.itemsByRefName, 'refName', ns, refName)
  }

  /** Первый предмет с таким локализованным именем в любом из пространств. */
  findItem(name: string, namespaces: readonly Poe2ItemNamespace[] = ['ITEM', 'UNIQUE', 'GEM']): BaseType | undefined {
    for (const ns of namespaces) {
      const found = this.itemByTranslated(ns, name)
      if (found) return found[0]
    }
    return undefined
  }

  /** Английское имя (для запросов трейда) по локализованному. */
  refNameOf(name: string, namespaces?: readonly Poe2ItemNamespace[]): string | undefined {
    return this.findItem(name, namespaces)?.refName
  }

  /** Перебор строк items.ndjson, содержащих подстроку (желательно «редкую»). EE2: ITEMS_ITERATOR. */
  *itemsIterator(includes: string, andIncludes: string[] = []): Generator<BaseType> {
    yield* ndjsonFindLines<BaseType>(this.items, includes, andIncludes)
  }

  /** trade tag валюты → английское имя. EE2: TRADE_TAG_TO_REF. */
  tradeTagToRef(): Map<string, string> {
    if (!this.tradeTagToRefCache) {
      this.tradeTagToRefCache = new Map()
      for (const item of this.itemsIterator('"tradeTag":')) {
        if (item.tradeTag) this.tradeTagToRefCache.set(item.tradeTag, item.refName)
      }
    }
    return this.tradeTagToRefCache
  }

  /** Руны и ядра душ: свойства по имени аугмента и по trade id. EE2: AUGMENT_DATA_BY_AUGMENT / _BY_TRADE_ID. */
  augments(): { byAugment: AugmentDataByAugment; byTradeId: AugmentDataByTradeId } {
    if (!this.augmentsCache) {
      const byAugment: AugmentDataByAugment = {}
      const byTradeId: AugmentDataByTradeId = {}
      for (const item of this.itemsIterator('"craftable": {"category": "SoulCore"}')) {
        for (const line of item.augment ?? []) {
          if (!line.tradeId?.length) continue
          const entry: AugmentData = {
            augment: item.name,
            refName: item.refName,
            baseStat: line.string,
            values: line.values,
            id: line.tradeId[0],
            categories: line.categories,
            icon: item.icon
          }
          ;(byAugment[item.refName] ??= []).push(entry)
          ;(byTradeId[entry.id] ??= []).push(entry)
        }
      }
      this.augmentsCache = { byAugment, byTradeId }
    }
    return this.augmentsCache
  }

  // ------------------------------------------------------------------ статы

  /** Стат по английскому шаблону (`ref`). EE2: STAT_BY_REF. */
  statByRef(ref: string): Stat | undefined {
    for (const start of lookupStarts(this.statsByRef, fnv1a32(ref))) {
      const stat = JSON.parse(lineAt(this.stats, start)) as Stat
      if (stat.ref === ref) return stat
    }
    return undefined
  }

  private statByMatchStrExact(matchStr: string): { matcher: StatMatcher; stat: Stat } | undefined {
    for (const start of lookupStarts(this.statsByMatcher, fnv1a32(matchStr))) {
      const stat = JSON.parse(lineAt(this.stats, start)) as Stat
      const matcher = stat.matchers.find((m) => m.string === matchStr || m.advanced === matchStr)
      if (matcher) return { stat, matcher }
    }
    return undefined
  }

  /**
   * Стат по строке-матчеру на языке данных (числа заменены на `#`). EE2: STAT_BY_MATCH_STR.
   * POETH: при промахе — каноническая форма для RU-строк с обобщённым мн. числом («на # секунд(-ы)»).
   */
  statByMatchStr(matchStr: string): { matcher: StatMatcher; stat: Stat } | undefined {
    const exact = this.statByMatchStrExact(matchStr)
    if (exact) return exact
    const canonical = this.canonicalPluralMatchStr(matchStr)
    return canonical ? this.statByMatchStrExact(canonical) : undefined
  }

  /** Каноническая строка-матчер для строки из текста с согласованным мн. числом (только при промахе). */
  canonicalPluralMatchStr(matchStr: string): string | undefined {
    this.pluralMatchers ??= buildPluralMatchers(this.stats)
    for (const { re, canonical } of this.pluralMatchers) {
      if (re.test(matchStr)) return canonical
    }
    return undefined
  }

  /** Есть ли у стата матчер ровно с такой строкой. */
  static hasMatcher(stat: Stat, matchStr: string): boolean {
    return hasMatcher(stat, matchStr)
  }

  /** Перебор статов, содержащих подстроку. EE2: STATS_ITERATOR. */
  *statsIterator(includes: string, andIncludes: string[] = []): Generator<Stat> {
    yield* ndjsonFindLines<Stat>(this.stats, includes, andIncludes)
  }
}

// «секунд(-ы)», «цели(-ей)», «сундука(-ов)»
const PLURAL_WORD_RE = /([A-Za-zА-Яа-яЁё]+)\((-[A-Za-zА-Яа-яЁё]+(?:,\s*-[A-Za-zА-Яа-яЁё]+)*)\)/g
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function buildPluralMatchers(statsNdjson: string): Array<{ re: RegExp; canonical: string }> {
  const out: Array<{ re: RegExp; canonical: string }> = []
  const seen = new Set<string>()
  for (const stat of ndjsonFindLines<Stat>(statsNdjson, '(-', [])) {
    for (const m of stat.matchers) {
      for (const canonical of [m.string, m.advanced]) {
        if (!canonical || seen.has(canonical) || canonical.search(PLURAL_WORD_RE) === -1) continue
        seen.add(canonical)
        let source = ''
        let last = 0
        for (const match of canonical.matchAll(PLURAL_WORD_RE)) {
          const word = match[1]
          const stem = word.slice(0, Math.max(1, word.length - 2))
          source += escapeRe(canonical.slice(last, match.index)) + escapeRe(stem) + '[A-Za-zА-Яа-яЁё]*'
          last = match.index! + match[0].length
        }
        source += escapeRe(canonical.slice(last))
        out.push({ re: new RegExp(`^${source}$`), canonical })
      }
    }
  }
  return out
}

function* ndjsonFindLines<T>(ndjson: string, searchString: string, andIncludes: string[]): Generator<T> {
  let start = 0
  while (start < ndjson.length) {
    const matchPos = ndjson.indexOf(searchString, start)
    if (matchPos === -1) break
    start = ndjson.lastIndexOf('\n', matchPos) + 1
    let end = ndjson.indexOf('\n', matchPos)
    if (end === -1) end = ndjson.length
    const jsonLine = ndjson.slice(start, end)
    if (andIncludes.every((str) => jsonLine.includes(str))) {
      yield JSON.parse(jsonLine) as T
    }
    start = end + 1
  }
}
