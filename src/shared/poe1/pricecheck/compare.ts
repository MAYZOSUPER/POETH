// POETH (S21): «что продаёт продавец и похоже ли на ваш» — сравнение мода за модом лота из ответа fetch
// с предметом игрока. Новых запросов к сайту нет: моды лота уже пришли в том же ответе.
//
// Сопоставление — по stat id трейда, а не по тексту: сайт отдаёт моды на своём языке (www — английский,
// ru — русский), а предмет игрока — на языке клиента. explicit, crafted и fractured одного стата — одно
// свойство (у предмета игрока те же три домена). Значение лота — числа из его текста: точно — разбором
// строки по данным языка сайта (`dataValueReader`, учитывает «reduced» → минус и среднее «от # до #»),
// без данных — по числам текста без констант шаблона (`modValue`).
//
// Итог по каждому свойству игрока: «есть и не хуже» (match), «есть, но хуже» (worse), «нет у лота»
// (missing); остальные моды лота — нейтральные (extra). Сводка — «похоже на ваш: matched из total».

import { StatBetter, type Poe1Data } from '../data'
import type { ParsedItem } from '../parser'
import { ModifierType, statSourcesTotal, translateStatWithRoll } from '../parser/modifiers'
import { matchStatLine } from '../parser/stat-translations'
import type { LotMod, LotModKind } from './results'

export type MatchStatus = 'match' | 'worse' | 'missing' | 'extra'

/** Свойство предмета игрока для сравнения. */
export interface PlayerStat {
  /** ключи сопоставления «группа:stat_…» (explicit/crafted/fractured — одна группа) */
  keys: string[]
  /** шаблон на языке предмета с # вместо значения, как его видит игрок («#% reduced …») */
  text: string
  /** значение стата (как у парсера): «reduced» — с минусом, «от # до #» — среднее; нет — только наличие */
  value?: number
  /** 1 — больше лучше, -1 — меньше лучше, 0 — важно совпадение */
  better: -1 | 0 | 1
  /** игрок видит значение с обратным знаком («reduced», «less») */
  negated: boolean
}

export interface CompareRow {
  status: MatchStatus
  /** свойство игрока (match / worse / missing) */
  mine?: PlayerStat
  /** мод лота (match / worse / extra) — текст на языке сайта */
  lot?: LotMod
  /** значение лота в том же виде, что mine.value */
  theirs?: number
  /** worse у несравнимого стата: значение другое, а не «хуже» */
  differs?: boolean
}

export interface LotComparison {
  /** моды лота по порядку (match / worse / extra), затем свойства игрока, которых у лота нет */
  rows: CompareRow[]
  /** свойств игрока у лота есть и не хуже */
  matched: number
  /** свойств игрока сравнивали */
  total: number
}

/** Значение мода лота в виде mine.value; undefined — не прочитать (тогда засчитываем только наличие). */
export type ModValueReader = (mod: LotMod, mine: PlayerStat) => number | undefined

const GROUP: Record<string, string> = {
  explicit: 'explicit',
  crafted: 'explicit',
  fractured: 'explicit',
  veiled: 'explicit',
  implicit: 'implicit',
  enchant: 'enchant',
  scourge: 'scourge'
}

/** «explicit.stat_1», «{div_by_100}crafted.stat_1», «stat.fractured.stat_1» → «explicit:stat_1»; псевдо и item.* — null. */
export function statKey(id: string): string | null {
  const s = id.replace(/^\{[^}]*\}/, '').replace(/^stat\./, '')
  const dot = s.indexOf('.')
  if (dot <= 0 || dot === s.length - 1) return null
  const domain = s.slice(0, dot)
  if (domain === 'pseudo' || domain === 'item') return null
  return `${GROUP[domain] ?? domain}:${s.slice(dot + 1)}`
}

const betterOf = (b: StatBetter | undefined): -1 | 0 | 1 =>
  b === StatBetter.NegativeRoll ? -1 : b === StatBetter.NotComparable ? 0 : 1

/**
 * Свойства предмета игрока — все его моды по типам (`statsByType` парсера), а не фильтры пресета: в
 * пресете «псевдо» здоровье и сопротивления свёрнуты в суммы, а локальные моды оружия — в DPS. Без
 * псевдо-статов; один стат из модов одной группы (explicit + crafted) — одно свойство с суммой.
 */
export function playerStatsOf(item: Pick<ParsedItem, 'statsByType'>): PlayerStat[] {
  const out: PlayerStat[] = []
  for (const calc of item.statsByType) {
    if (calc.type === ModifierType.Pseudo) continue
    const ids = calc.stat.trade.ids[calc.type] ?? []
    const keys = [...new Set(ids.map(statKey).filter((k): k is string => k !== null))]
    if (!keys.length) continue
    const roll = statSourcesTotal(calc.sources)
    const value = calc.stat.trade.option ? undefined : roll?.value
    const same = out.find((p) => p.keys[0] === keys[0])
    if (same) {
      if (same.value !== undefined && value !== undefined) same.value += value
      continue
    }
    const translation = translateStatWithRoll(calc, roll)
    out.push({ keys, text: translation.string, value, better: betterOf(calc.stat.better), negated: translation.negate })
  }
  return out
}

const NUM = /(^|[^\w.,])(-?)(\d+(?:[.,]\d+)?)/g

function numbersIn(text: string): number[] {
  return [...text.matchAll(NUM)].map((m) => Number(`${m[2]}${m[3].replace(',', '.')}`))
}

/**
 * Значение по числам текста (без данных языка сайта): константы шаблона игрока («за каждые 15 силы»)
 * вычитаются, два числа — среднее («от 5 до 10»), иначе первое; negated — знак как у игрока.
 */
export function modValue(text: string, template?: string, negated = false): number | undefined {
  const nums = numbersIn(text)
  if (template) {
    for (const c of numbersIn(template.replace(/#/g, ' '))) {
      const i = nums.findIndex((n) => Math.abs(n) === Math.abs(c))
      if (i >= 0) nums.splice(i, 1)
    }
  }
  if (!nums.length) return undefined
  const v = nums.length === 2 ? (nums[0] + nums[1]) / 2 : nums[0]
  return negated ? -Math.abs(v) : v
}

const numericReader: ModValueReader = (mod, mine) => modValue(mod.text, mine.text, mine.negated)

const MOD_TYPE: Record<LotModKind, ModifierType> = {
  enchant: ModifierType.Enchant,
  scourge: ModifierType.Scourge,
  implicit: ModifierType.Implicit,
  fractured: ModifierType.Fractured,
  explicit: ModifierType.Explicit,
  crafted: ModifierType.Crafted,
  veiled: ModifierType.Veiled,
  other: ModifierType.Explicit
}

/**
 * Точное значение: строка мода разбирается данными языка сайта (тот же разбор, что у предмета игрока).
 * Разобралась в другой стат или не разобралась — числа текста (`modValue`).
 */
export function dataValueReader(d: Poe1Data): ModValueReader {
  return (mod, mine) => {
    const type = MOD_TYPE[mod.kind]
    const found = matchStatLine(mod.text, d, [type, ModifierType.Explicit])
    const ids = found ? Object.values(found.stat.trade.ids).flat() : []
    const key = mod.stat ? statKey(mod.stat) : null
    if (found?.roll && key && ids.some((id) => statKey(id) === key)) return found.roll.value
    return numericReader(mod, mine)
  }
}

const EPS = 1e-6

function judge(mine: PlayerStat, theirs: number | undefined): Pick<CompareRow, 'status' | 'differs'> {
  if (mine.value === undefined || theirs === undefined) return { status: 'match' }
  if (mine.better === 0) return Math.abs(theirs - mine.value) < EPS ? { status: 'match' } : { status: 'worse', differs: true }
  const ok = mine.better > 0 ? theirs >= mine.value - EPS : theirs <= mine.value + EPS
  return { status: ok ? 'match' : 'worse' }
}

/** Сравнить моды лота со свойствами игрока. */
export function compareLot(
  player: readonly PlayerStat[],
  mods: readonly LotMod[],
  read: ModValueReader = numericReader
): LotComparison {
  const byKey = new Map<string, LotMod[]>()
  for (const m of mods) {
    const k = m.stat ? statKey(m.stat) : null
    if (k) byKey.set(k, [...(byKey.get(k) ?? []), m])
  }
  // мод лота → строка свойства игрока, которому он достался (у второго мода того же стата — тот же итог)
  const lotRows = new Map<LotMod, CompareRow>()
  const missing: CompareRow[] = []
  let matched = 0
  for (const mine of player) {
    const found = [...new Set(mine.keys.flatMap((k) => byKey.get(k) ?? []))].filter((m) => !lotRows.has(m))
    if (!found.length) {
      missing.push({ status: 'missing', mine })
      continue
    }
    const values = found.map((m) => read(m, mine))
    const theirs = values.every((v) => v !== undefined) ? values.reduce((a, b) => a! + b!, 0) : undefined
    const row: CompareRow = { ...judge(mine, theirs), mine, lot: found[0], ...(theirs !== undefined ? { theirs } : {}) }
    if (row.status === 'match') matched++
    for (const m of found) lotRows.set(m, m === found[0] ? row : { ...row, lot: m })
  }
  const rows = mods.map((m): CompareRow => lotRows.get(m) ?? { status: 'extra', lot: m })
  return { rows: [...rows, ...missing], matched, total: player.length }
}
