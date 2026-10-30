// Порт из Exiled Exchange 2 — https://github.com/Kvan7/Exiled-Exchange-2 (форк Awakened PoE Trade)
// Copyright (c) Alexander Drozdov (SnosMe), Kvan7 and contributors, MIT License.
// Исходник: renderer/src/parser/stat-translations.ts @ cca30662bf31eaf38bd711e2ec1a6b899a06c40e
// Изменения POETH:
//  - данные языка (`d: Poe2Data`) передаются параметром вместо глобальных CLIENT_STRINGS/STAT_BY_MATCH_STR;
//  - RU-фолбэк обобщённого мн. числа («секунд(-ы)») — внутри d.statByMatchStr (Poe2Data);
//  - нет данных сайта трейда: trySecondaryParseTranslation (TRADE_STAT_BY_MATCH_STR — «наивный» стат по строке
//    с сайта) не перенесён, такая строка остаётся нераспознанной (фолбэк по data/stats — на стороне main);
//  - `matchStatLine` — удобная обёртка «строка мода → стат» (как у PoE1).

import type { Poe2Data } from '../data/Poe2Data'
import type { StatMatcher, Stat, BaseType, TranslationDict } from '../data/interfaces'
import { ModifierType } from './modifiers'
import type { ItemCategory } from './meta'

// This file is a little messy and scary,
// but that's how stats translations are parsed :-D

const LOCALIZED_PAREN_LEFT = /^\s*(?:\(|（)/
const LOCALIZED_PAREN_RIGHT = /(?:\)|）)\s*$/

export interface ParsedStat {
  readonly stat: Stat
  readonly translation: StatMatcher
  roll?: {
    unscalable: boolean
    legacy?: true
    dp: boolean
    value: number
    min: number
    max: number
    option?: number
  }
  fromAddedAugment?: BaseType
}

export interface StatString {
  string: string
  unscalable: boolean
}

export function* linesToStatStrings(lines: string[], _$: TranslationDict): Generator<StatString, string[], boolean> {
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
  [[0, 1, 2], [1, 2], [0, 2], [0, 1], [2], [1], [0], []],
  // 4 # -> max 2 #
  [
    [0, 1, 2, 3],
    [1, 2, 3],
    [0, 2, 3],
    [0, 1, 3],
    [0, 1, 2],
    [2, 3],
    [1, 3],
    [1, 2],
    [0, 3],
    [0, 2],
    [0, 1],
    [3],
    [2],
    [1],
    [0],
    []
  ]
]

interface CapturedValue {
  roll: number
  rollStr: string
  decimal: boolean
  bounds?: { min: number; max: number }
}

type CombinationValue = Pick<CapturedValue, 'roll' | 'bounds' | 'decimal'>

interface Combination {
  stat: string
  values: CombinationValue[]
}

function* _statPlaceholderGenerator(stat: string): Generator<Combination> {
  const matches: CapturedValue[] = []
  const withPlaceholders = stat
    .replace(/\(\)/gm, '') // when GGG didn't provide advanced desc, like in "Passives in Radius of Wicked Ward() can be Allocated"
    .replace(
      /(?<value>(?<!\d|\))[+-]?\d+(?:\.\d+)?)(?:\((?<min>.[^)-]*)(?:-(?<max>[^)]+))?\))?/gm,
      (_, roll: string, min?: string, max?: string) => {
        if (min != null && max == null) {
          // example: Sextant "# uses remaining", legacy rolls
          max = min
        }

        const captured: CapturedValue = {
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
        values: matches.filter((_, idx) => !replacements.includes(idx)) as CombinationValue[]
      }
    }
  }

  // fallback to exact stat text, without any placeholders
  // N # -> max 0 #
  yield { stat, values: [] }
}

export function tryParseTranslation(
  stat: StatString,
  modType: ModifierType,
  itemCategory: ItemCategory | undefined,
  d: Poe2Data
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
    const realType = modType === ModifierType.AddedAugment ? ModifierType.Augment : modType
    if (
      !found ||
      ((!found.stat.trade.ids || !(realType in found.stat.trade.ids)) &&
        !found.stat.ref.startsWith(d.refStrings.GRANTS_SKILL))
    ) {
      // EE2: здесь запасной разбор по данным сайта трейда (trySecondaryParseTranslation) — у нас их нет
      continue
    }

    // Modifiers must be upgraded to the new values with a Divine Orb
    const roll = parseRoll(found, combination, stat)

    return {
      stat: found.stat,
      translation: found.matcher,
      roll
    }
  }
  return undefined
}

function parseRoll(
  found: { matcher: StatMatcher; stat: Stat },
  combination: Combination,
  stat: StatString
): ParsedStat['roll'] {
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

  if (!combination.values.length) {
    return undefined
  }

  return {
    unscalable: stat.unscalable,
    legacy: legacyStatRolls || undefined,
    dp: found.stat.dp || combination.values.some((stat) => stat.decimal),
    value: getRollOrMinmaxAvg(combination.values.map((stat) => stat.roll)),
    min: getRollOrMinmaxAvg(combination.values.map((stat) => stat.bounds?.min ?? stat.roll)),
    max: getRollOrMinmaxAvg(combination.values.map((stat) => stat.bounds?.max ?? stat.roll)),
    option: found.matcher.value
  }
}

export function getRollOrMinmaxAvg(values: number[]): number {
  if (values.length === 4) {
    return (values[0] + values[1] + values[2] + values[3]) / 4
  }
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
  d: Poe2Data
): { matcher: StatMatcher; stat: Stat } | undefined {
  const { matchStr } = params
  const statOrGroup = d.statByMatchStr(matchStr)

  return statOrGroup
}

/**
 * POETH: строка мода (одна или несколько строк через `\n`) → стат и ролл. Для модулей вне парсера
 * (например, подсказок в UI). По умолчанию тип мода — explicit.
 */
export function matchStatLine(
  line: string,
  d: Poe2Data,
  modType: ModifierType = ModifierType.Explicit,
  itemCategory?: ItemCategory
): ParsedStat | undefined {
  let string = line
  const unscalable = string.endsWith(d.strings.UNSCALABLE_VALUE)
  if (unscalable) string = string.slice(0, -d.strings.UNSCALABLE_VALUE.length)
  return tryParseTranslation({ string, unscalable }, modType, itemCategory, d)
}
