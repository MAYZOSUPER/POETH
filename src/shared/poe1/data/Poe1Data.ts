// Порт из Awakened PoE Trade — https://github.com/SnosMe/awakened-poe-trade
// Copyright (c) Alexander Drozdov (SnosMe) and contributors, MIT License.
// Исходник: renderer/src/assets/data/index.ts @ 3188208957422b21b69b12083a03edf3d1bac187
// Изменения POETH: вместо модульных глобальных переменных — объект данных одного языка (держим EN и RU
// одновременно); поиск учитывает все записи с одинаковым хэшем (коллизии fnv1a и одинаковые локализованные
// имена разных предметов); удобные `findItem` / `refNameOf`.

import type { BaseType, Poe1Lang, Stat, StatMatcher, StatOrGroup, TranslationDict } from './interfaces'
import { fnv1a32 } from './fnv1a'
import { lookupStarts } from './indexes'

export type ItemNamespace = BaseType['namespace']

export interface Poe1DataParts {
  lang: Poe1Lang
  strings: TranslationDict
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

/** Данные PoE1 одного языка: предметы, статы, строки клиента. Записи парсятся при каждом поиске
 *  (как у APT): парсер может мутировать полученный Stat (слияние trade id), кэш от этого не портится. */
export class Poe1Data {
  readonly lang: Poe1Lang
  readonly strings: TranslationDict
  private readonly items: string
  private readonly itemsByName: Uint32Array
  private readonly itemsByRefName: Uint32Array
  private readonly stats: string
  private readonly statsByRef: Uint32Array
  private readonly statsByMatcher: Uint32Array
  private altQualityGemNamesCache?: string[]
  private replicaUniqueNamesCache?: string[]
  private pluralMatchers?: Array<{ re: RegExp; canonical: string }>

  constructor(parts: Poe1DataParts) {
    this.lang = parts.lang
    this.strings = parts.strings
    this.items = parts.itemsNdjson
    this.itemsByName = parts.itemsByName
    this.itemsByRefName = parts.itemsByRefName
    this.stats = parts.statsNdjson
    this.statsByRef = parts.statsByRef
    this.statsByMatcher = parts.statsByMatcher
  }

  // ------------------------------------------------------------------ предметы

  private findItems(index: Uint32Array, prop: 'name' | 'refName', ns: ItemNamespace, name: string): BaseType[] | undefined {
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

  /** Записи по имени на языке данных (как в тексте предмета). */
  itemByTranslated(ns: ItemNamespace, name: string): BaseType[] | undefined {
    return this.findItems(this.itemsByName, 'name', ns, name)
  }

  /** Записи по английскому имени. */
  itemByRef(ns: ItemNamespace, refName: string): BaseType[] | undefined {
    return this.findItems(this.itemsByRefName, 'refName', ns, refName)
  }

  /** Первый предмет с таким локализованным именем в любом из пространств (по умолчанию — все, кроме AREA). */
  findItem(
    name: string,
    namespaces: readonly ItemNamespace[] = ['ITEM', 'UNIQUE', 'GEM', 'DIVINATION_CARD', 'CAPTURED_BEAST', 'MERCENARY_BUILD']
  ): BaseType | undefined {
    for (const ns of namespaces) {
      const found = this.itemByTranslated(ns, name)
      if (found) return found[0]
    }
    return undefined
  }

  /** Английское имя (для запросов трейда) по локализованному. */
  refNameOf(name: string, namespaces?: readonly ItemNamespace[]): string | undefined {
    return this.findItem(name, namespaces)?.refName
  }

  /** Перебор строк items.ndjson, содержащих подстроку (желательно «редкую»). */
  *itemsIterator(includes: string, andIncludes: string[] = []): Generator<BaseType> {
    yield* ndjsonFindLines<BaseType>(this.items, includes, andIncludes)
  }

  altQualityGemNames(): string[] {
    this.altQualityGemNamesCache ??= Array.from(this.itemsIterator('altQuality":["Anomalous'), (i) => i.name)
    return this.altQualityGemNamesCache
  }

  replicaUniqueNames(): string[] {
    this.replicaUniqueNamesCache ??= Array.from(this.itemsIterator('refName":"Replica'), (i) => i.name)
    return this.replicaUniqueNamesCache
  }

  // ------------------------------------------------------------------ статы

  /** Стат или группа статов по английскому шаблону (`ref`). */
  statByRefV2(ref: string): StatOrGroup | undefined {
    for (const start of lookupStarts(this.statsByRef, fnv1a32(ref))) {
      const statOrGroup = JSON.parse(lineAt(this.stats, start)) as StatOrGroup
      const stats = 'stats' in statOrGroup ? statOrGroup.stats : [statOrGroup]
      if (stats.some((s) => s.ref === ref)) return statOrGroup
    }
    return undefined
  }

  /** Стат или группа по строке-матчеру на языке данных (числа заменены на `#`). */
  statByMatchStrV2(matchStr: string): StatOrGroup | undefined {
    for (const start of lookupStarts(this.statsByMatcher, fnv1a32(matchStr))) {
      const statOrGroup = JSON.parse(lineAt(this.stats, start)) as StatOrGroup
      const stats = 'stats' in statOrGroup ? statOrGroup.stats : [statOrGroup]
      if (stats.some((s) => hasMatcher(s, matchStr))) return statOrGroup
    }
    return undefined
  }

  /**
   * POETH: в RU-данных APT ~130 строк с обобщённым мн. числом («на # секунд(-ы)», «# дополнительных цели(-ей)»),
   * а игра и трейд пишут согласованную форму («на 4 секунды», «3 дополнительных целей»). По строке из текста
   * (числа уже заменены на `#`) возвращает каноническую строку-матчер из данных или undefined.
   * Вызывать только при промахе точного поиска.
   */
  canonicalPluralMatchStr(matchStr: string): string | undefined {
    this.pluralMatchers ??= buildPluralMatchers(this.stats)
    for (const { re, canonical } of this.pluralMatchers) {
      if (re.test(matchStr)) return canonical
    }
    return undefined
  }

  /** Однозначный стат по строке-матчеру (если группа неоднозначна — undefined). */
  statByMatchStr(matchStr: string): { matcher: StatMatcher; stat: Stat } | undefined {
    let statOrGroup = this.statByMatchStrV2(matchStr)
    if (!statOrGroup) {
      const canonical = this.canonicalPluralMatchStr(matchStr)
      if (canonical) {
        matchStr = canonical
        statOrGroup = this.statByMatchStrV2(canonical)
      }
    }
    if (!statOrGroup) return undefined

    let stat: Stat
    if ('stats' in statOrGroup) {
      const stats = statOrGroup.stats.filter((s) => hasMatcher(s, matchStr))
      if (stats.length !== 1) return undefined
      stat = stats[0]
    } else {
      stat = statOrGroup
    }
    const matcher = stat.matchers.find((m) => m.string === matchStr || m.advanced === matchStr)!
    return { stat, matcher }
  }

  /** Псевдо-стат (или обычный) по `ref`. */
  pseudoStatByRef(ref: string): Stat | undefined {
    const statOrGroup = this.statByRefV2(ref)
    if (statOrGroup != null && 'stats' in statOrGroup) {
      return statOrGroup.stats.find((s) => s.ref === ref && 'pseudo' in s.trade.ids)
    }
    return statOrGroup
  }

  *statsIterator(includes: string, andIncludes: string[] = []): Generator<Stat> {
    for (const statOrGroup of ndjsonFindLines<StatOrGroup>(this.stats, includes, andIncludes)) {
      if ('stats' in statOrGroup) yield* statOrGroup.stats
      else yield statOrGroup
    }
  }
}

// «секунд(-ы)», «цели(-ей)», «Предвестника(-ов)», «заряд(-а, -ов)»
const PLURAL_WORD_RE = /([A-Za-zА-Яа-яЁё]+)\((-[A-Za-zА-Яа-яЁё]+(?:,\s*-[A-Za-zА-Яа-яЁё]+)*)\)/g
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Источник регулярки для строки с обобщённым мн. числом: слово → основа + любые буквы окончания, остальное —
 * дословно (экранировано). Без таких слов — просто экранированная строка (S51: и перевод строки мода, pobItemEn).
 */
export function pluralMatcherSource(canonical: string): string {
  let source = ''
  let last = 0
  for (const match of canonical.matchAll(PLURAL_WORD_RE)) {
    const word = match[1]
    const stem = word.slice(0, Math.max(1, word.length - 2))
    source += escapeRe(canonical.slice(last, match.index)) + escapeRe(stem) + '[A-Za-zА-Яа-яЁё]*'
    last = match.index! + match[0].length
  }
  return source + escapeRe(canonical.slice(last))
}

/** Регулярки для строк-матчеров с обобщённым мн. числом: слово → основа + любые буквы окончания. */
function buildPluralMatchers(statsNdjson: string): Array<{ re: RegExp; canonical: string }> {
  const out: Array<{ re: RegExp; canonical: string }> = []
  const seen = new Set<string>()
  for (const statOrGroup of ndjsonFindLines<StatOrGroup>(statsNdjson, '(-', [])) {
    const stats = 'stats' in statOrGroup ? statOrGroup.stats : [statOrGroup]
    for (const stat of stats) {
      for (const m of stat.matchers) {
        for (const canonical of [m.string, m.advanced]) {
          if (!canonical || seen.has(canonical) || canonical.search(PLURAL_WORD_RE) === -1) continue
          seen.add(canonical)
          out.push({ re: new RegExp(`^${pluralMatcherSource(canonical)}$`), canonical })
        }
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
