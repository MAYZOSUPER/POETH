// Порт из Awakened PoE Trade — https://github.com/SnosMe/awakened-poe-trade
// Copyright (c) Alexander Drozdov (SnosMe) and contributors, MIT License.
// Исходник: renderer/src/parser/stat-translations.ts @ 3188208957422b21b69b12083a03edf3d1bac187
// Изменения POETH: данные языка (`d: Poe1Data`) передаются параметром; `matchStatLine` — удобная обёртка
// «строка мода → стат» для других модулей; RU-фолбэк обобщённого мн. числа («секунд(-ы)»); percent-merge:
// строка флагового стата ≙ 100% (в RU строки различаются, в EN совпадают).

import type { Poe1Data } from '../data/Poe1Data'
import type { StatMatcher, Stat, StatGroup } from '../data/interfaces'
import { ModifierType } from './modifiers'
import { type ItemCategory, ARMOUR, WEAPON, HEIST_EQUIPMENT } from './meta'

// This file is a little messy and scary,
// but that's how stats translations are parsed :-D

const LOCALIZED_PAREN_LEFT = /^\s*(?:\(|（)/
const LOCALIZED_PAREN_RIGHT = /(?:\)|）)\s*$/

export interface ParsedStat {
  readonly stat: Stat
  readonly translation: StatMatcher
  roll?: {
    unscalable: boolean
    generation?: 'legacy' | 'volatile' | 'reflecting'
    dp: boolean
    value: number
    min: number
    max: number
  }
}

export interface StatString {
  string: string
  unscalable: boolean
}

export function* linesToStatStrings(
  lines: string[],
  _$: Poe1Data['strings']
): Generator<StatString, string[], boolean> {
  const notParsedLines: string[] = []

  let reminderString = false

  outer: for (let start = 0; start < lines.length; start += 1) {
    if (lines[start].match(LOCALIZED_PAREN_LEFT)) {
      reminderString = true
    }
    if (reminderString && lines[start].match(LOCALIZED_PAREN_RIGHT)) {
      reminderString = false
      continue
    }
    if (reminderString) {
      continue
    }

    for (let end = start; end < lines.length; end += 1) {
      let str = lines.slice(start, end + 1).join('\n')

      const unscalable = str.endsWith(_$.UNSCALABLE_VALUE)
      if (unscalable) {
        str = str.slice(0, -_$.UNSCALABLE_VALUE.length)
      }

      const isParsed: boolean = yield { string: str, unscalable }
      if (isParsed) {
        start += end - start
        continue outer
      }
    }
    notParsedLines.push(lines[start])
  }
  return notParsedLines.filter((line) => line.length)
}

const PLACEHOLDER_MAP = [
  // 0 # -> max 0 #
  [[]],
  // 1 # -> max 1 #
  [[0], []],
  // 2 # -> max 2 #
  [[0, 1], [0], [1], []],
  // 3 # -> max 2 #
  [[0, 1, 2], [1, 2], [0, 2], [0, 1], [2], [1], [0]],
  // 4 # -> max 2 #
  [[0, 1, 2, 3], [1, 2, 3], [0, 2, 3], [0, 1, 3], [0, 1, 2], [2, 3], [1, 3], [1, 2], [0, 3], [0, 2], [0, 1]]
]

interface PlaceholderMatch {
  roll: number
  rollStr: string
  decimal: boolean
  bounds?: { min: number; max: number }
}

function* _statPlaceholderGenerator(stat: string) {
  const matches: PlaceholderMatch[] = []
  const withPlaceholders = stat
    .replace(/\(\)/gm, '') // when GGG didn't provide advanced desc, like in "Passives in Radius of Wicked Ward() can be Allocated"
    .replace(
      /(?<value>(?<!\d|\))[+-]?\d+(?:\.\d+)?)(?:\((?<min>.[^)-]*)(?:-(?<max>[^)]+))?\))?/gm,
      (_, roll: string, min?: string, max?: string) => {
        if (min != null && max == null) {
          // example: Sextant "# uses remaining", legacy rolls
          max = min
        }

        const captured: PlaceholderMatch = {
          roll: Number(roll),
          rollStr: roll,
          decimal: roll.includes('.') || min?.includes('.') || max?.includes('.') || false,
          bounds: { min: Number(min), max: Number(max) }
        }
        matches.push(captured)

        if (Number.isNaN(captured.bounds!.min) || Number.isNaN(captured.bounds!.max)) {
          captured.bounds = undefined
          return min != null ? `#(${min}-${max})` : '#'
        } else {
          return '#'
        }
      }
    )

  if (matches.length < PLACEHOLDER_MAP.length) {
    for (const replacements of PLACEHOLDER_MAP[matches.length]) {
      let idx = -1
      const replaced = withPlaceholders.replace(/#/gm, () => {
        idx += 1
        return replacements.includes(idx) ? matches[idx].rollStr : '#'
      })

      yield {
        stat: replaced,
        values: matches.filter((_, idx) => !replacements.includes(idx)) as Array<
          Pick<PlaceholderMatch, 'roll' | 'bounds' | 'decimal'>
        >
      }
    }
  }

  // fallback to exact stat text, without any placeholders
  // N # -> max 0 #
  yield { stat, values: [] as Array<Pick<PlaceholderMatch, 'roll' | 'bounds' | 'decimal'>> }
}

export function tryParseTranslation(
  stat: StatString,
  modType: ModifierType,
  itemCategory: ItemCategory | undefined,
  d: Poe1Data
): ParsedStat | undefined {
  for (const combination of _statPlaceholderGenerator(stat.string)) {
    const found = findAndResolveTranslation(
      {
        matchStr: combination.stat,
        modType: modType,
        itemCategory: itemCategory,
        roll: combination.values.length === 1 ? combination.values[0].roll : undefined
      },
      d
    )
    if (!found || !(modType in found.stat.trade.ids)) {
      continue
    }

    // Modifiers must be upgraded to the new values with a Divine Orb
    let legacyStatRolls = false

    if (found.matcher.negate) {
      for (const stat of combination.values) {
        stat.roll *= -1
        if (stat.bounds) {
          stat.bounds.min *= -1
          stat.bounds.max *= -1
        }
      }
    }

    if (found.stat.ref === '# uses remaining') {
      const uses = combination.values[0]
      uses.bounds = {
        min: 1,
        max: uses.bounds?.max ?? uses.roll
      }
    }

    for (const stat of combination.values) {
      if (!stat.bounds) continue

      if (stat.bounds.min > stat.bounds.max) {
        // some stats granted by legacy Modifiers (not legacy rolls)
        // can have same stat translations as granted by new Modifiers
        // but swapped translation strings for positive and negative rolls
        stat.bounds = {
          max: stat.bounds.min,
          min: stat.bounds.max
        }
        // don't consider them as a legacy rolls
      }

      if (stat.roll > stat.bounds.max) {
        stat.bounds.max = stat.roll
        legacyStatRolls = true
      }
      if (stat.roll < stat.bounds.min) {
        stat.bounds.min = stat.roll
        legacyStatRolls = true
      }
    }

    if (!combination.values.length && found.matcher.value) {
      combination.values = [
        {
          roll: found.matcher.value,
          decimal: false,
          bounds: {
            min: found.matcher.value,
            max: found.matcher.value
          }
        }
      ]
    }

    return {
      stat: found.stat,
      translation: found.matcher,
      roll: combination.values.length
        ? {
            unscalable: stat.unscalable,
            generation: legacyStatRolls ? 'legacy' : undefined,
            dp: found.stat.dp || combination.values.some((stat) => stat.decimal),
            value: getRollOrMinmaxAvg(combination.values.map((stat) => stat.roll)),
            min: getRollOrMinmaxAvg(combination.values.map((stat) => stat.bounds?.min ?? stat.roll)),
            max: getRollOrMinmaxAvg(combination.values.map((stat) => stat.bounds?.max ?? stat.roll))
          }
        : undefined
    }
  }
}

/**
 * POETH: строка мода (одна или несколько строк через \n) → стат. Перебирает типы модов по порядку и
 * возвращает первый, под которым стат есть на трейде. Для поиска «что это за мод» из других модулей.
 */
export function matchStatLine(
  text: string,
  d: Poe1Data,
  modTypes: readonly ModifierType[] = [
    ModifierType.Explicit,
    ModifierType.Implicit,
    ModifierType.Enchant,
    ModifierType.Crafted,
    ModifierType.Fractured,
    ModifierType.Pseudo
  ],
  itemCategory?: ItemCategory
): (ParsedStat & { type: ModifierType }) | undefined {
  let str = text
  const unscalable = str.endsWith(d.strings.UNSCALABLE_VALUE)
  if (unscalable) str = str.slice(0, -d.strings.UNSCALABLE_VALUE.length)
  for (const type of modTypes) {
    const found = tryParseTranslation({ string: str, unscalable }, type, itemCategory, d)
    if (found) return { ...found, type }
  }
  return undefined
}

export function getRollOrMinmaxAvg(values: number[]): number {
  if (values.length === 2) {
    return (values[0] + values[1]) / 2
  } else {
    return values[0]
  }
}

interface FindResolveParams {
  matchStr: string
  modType: ModifierType
  itemCategory: ItemCategory | undefined
  roll: number | undefined
}

function findAndResolveTranslation(
  params: FindResolveParams,
  d: Poe1Data
): { matcher: StatMatcher; stat: Stat } | undefined {
  let statOrGroup = d.statByMatchStrV2(params.matchStr)
  if (!statOrGroup) {
    // POETH: RU «на 4 секунды» ↔ в данных «на # секунд(-ы)»
    const canonical = d.canonicalPluralMatchStr(params.matchStr)
    if (!canonical) return undefined
    params = { ...params, matchStr: canonical }
    statOrGroup = d.statByMatchStrV2(canonical)
    if (!statOrGroup) return undefined
  }
  const { matchStr } = params

  let stat: Stat | undefined
  if (!('stats' in statOrGroup)) {
    stat = statOrGroup
  } else {
    stat = _resolveTranslation(statOrGroup, params)
  }

  if (stat) {
    let matcher = stat.matchers.find((m) => m.string === matchStr || m.advanced === matchStr)
    // POETH: percent-merge, строка флагового стата ≙ «100%» percent-стата (см. _resolveTranslation)
    if (!matcher && 'stats' in statOrGroup && statOrGroup.resolve.strat === 'percent-merge') {
      matcher = stat.matchers.find((m) => m.value === 100)
    }
    if (!matcher) return undefined
    return { stat, matcher }
  }
  return undefined
}

export function _resolveTranslation(statGroup: StatGroup, params: FindResolveParams): Stat | undefined {
  const { resolve, stats } = statGroup
  const { matchStr, modType, itemCategory, roll } = params
  if (resolve.strat === 'select') {
    // give priority to exact match
    let idx = resolve.test.findIndex((expected) => expected !== null && testItemCategory(itemCategory ?? null, expected))
    // fallback to any match (if it exists at all)
    if (idx === -1) idx = resolve.test.indexOf(null)
    return idx !== -1 ? stats[idx] : undefined
  }

  const onTradeStats = stats.filter((stat) => modType in stat.trade.ids)
  if (onTradeStats.length === 1) return onTradeStats[0]

  if (resolve.strat === 'trivial-merge') {
    const withMatchStr = matchStr.length
      ? onTradeStats.filter((stat) => stat.matchers.some((m) => m.string === matchStr || m.advanced === matchStr))
      : onTradeStats
    if (!withMatchStr.length) return undefined
    const merged = withMatchStr[0]
    for (const stat of withMatchStr) {
      if (merged === stat) continue
      _mergeTradeIdsInto(merged, stat)
    }
    return merged
  } else if (resolve.strat === 'percent-merge') {
    const pctStat = stats[resolve.kind.indexOf('percent')]
    const otherStat = stats[resolve.kind.indexOf('value')]
    const matcher = pctStat.matchers.find((m) => m.string === matchStr || m.advanced === matchStr)
    const flag = otherStat.matchers.length === 1 && !otherStat.matchers[0].string.includes('#')
    // POETH: в EN строка «100%» percent-стата совпадает со строкой флагового стата («Curse Enemies with
    // Flammability on Hit»), а в RU — нет («При нанесении удара проклинает…» / «Проклинает … при нанесении
    // удара»). Совпадение со строкой флага при наличии у percent-стата варианта 100 — то же, что roll100,
    // иначе RU и EN дают разные trade id.
    const flagAs100 =
      matcher === undefined &&
      flag &&
      pctStat.matchers.some((m) => m.value === 100) &&
      otherStat.matchers.some((m) => m.string === matchStr || m.advanced === matchStr)
    const roll100 = (matcher !== undefined && matcher.value === 100) || flagAs100
    if (roll100) {
      _mergeTradeIdsInto(pctStat, otherStat, flag ? '{empty_if_100}' : '{div_by_100}')
      return pctStat
    }
    return stats.find((stat) => stat.matchers.some((m) => m.string === matchStr || m.advanced === matchStr))
  } else if (resolve.strat === 'flag-merge') {
    if (roll === undefined) return undefined
    const valStat = stats[resolve.kind.indexOf('value')]
    const flagStat = stats[resolve.kind.indexOf('flag')]
    const flagRoll = flagStat.matchers[0].value!
    if (roll === flagRoll) {
      _mergeTradeIdsInto(valStat, flagStat, '{empty}')
    }
    return valStat
  }
  return undefined
}

function _mergeTradeIdsInto(dest: Stat, source: Stat, prefix?: string) {
  for (const modType in source.trade.ids) {
    let tradeId = source.trade.ids[modType][0]
    if (prefix) tradeId = prefix + tradeId
    if (modType in dest.trade.ids) {
      if (!dest.trade.ids[modType].includes(tradeId)) {
        dest.trade.ids[modType].push(tradeId)
      }
    } else {
      dest.trade.ids[modType] = [tradeId]
    }
  }
}

function testItemCategory(actual: ItemCategory | null, expected: string): boolean {
  if (actual === null) return false

  switch (expected) {
    case 'WEAPON':
      return WEAPON.has(actual)
    case 'ARMOUR':
      return ARMOUR.has(actual)
    case 'HEIST_EQUIPMENT':
      return HEIST_EQUIPMENT.has(actual)
    default:
      return expected === actual
  }
}
