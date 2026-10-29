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
//
// S23: сопротивления, здоровье, мана и ES сравниваются суммой — как псевдо-стат в окне цены, по которому и
// идёт поиск. Гибрид «+12% to Fire and Lightning Resistances» засчитывается в каждую стихию (×2), implicit,
// explicit и крафт складываются. У лота нет ни одного имплицита игрока — другая база: имплициты базы игрока
// (гнездо Unset Ring) не «пропавшие моды» и не в «N из M»; карточка пишет «другая база: …» (`otherBase`).

import { StatBetter, type Poe1Data } from '../data'
import type { ParsedItem } from '../parser'
import { ModifierType, statSourcesTotal, translateStatWithRoll } from '../parser/modifiers'
import { matchStatLine } from '../parser/stat-translations'
import { modText, type ModText } from './filters/mod-text'
import type { LotMod, LotModKind } from './results'

export type MatchStatus = 'match' | 'worse' | 'missing' | 'extra'

/** Сумма свойств, как псевдо-стат окна цены (i18n — `pc1.s23.sum.<id>`). */
export type SumId = 'eleRes' | 'chaosRes' | 'life' | 'mana' | 'es'

const FIRE = 'stat_3372524247'
const COLD = 'stat_4220027924'
const LIGHTNING = 'stat_1671376347'
const CHAOS = 'stat_2923486259'
const ALL_ELE = 'stat_2901986750'
const ALL_RES = 'stat_2016723660'
const FIRE_LIGHTNING = 'stat_3441501978'
const FIRE_COLD = 'stat_2915988346'
const COLD_LIGHTNING = 'stat_4277795662'
const FIRE_CHAOS = 'stat_378817135'
const COLD_CHAOS = 'stat_3393628375'
const LIGHTNING_CHAOS = 'stat_3465022881'

/**
 * Суммы: stat id трейда (без домена; одинаковы для EN и RU сайта) → множитель. Как PSEUDO_RULES порта APT
 * (`filters/pseudo`): гибрид из двух стихий — ×2, «ко всем» — ×3. ES — только глобальный (локальный ES брони —
 * внутри свойства «Энергощит»). Соответствие id и ref проверяет тест по данным.
 */
export const SUMS: Record<SumId, { ref: string; parts: Readonly<Record<string, number>> }> = {
  eleRes: {
    ref: '+#% total Elemental Resistance',
    parts: {
      [FIRE]: 1,
      [COLD]: 1,
      [LIGHTNING]: 1,
      [ALL_ELE]: 3,
      [ALL_RES]: 3,
      [FIRE_LIGHTNING]: 2,
      [FIRE_COLD]: 2,
      [COLD_LIGHTNING]: 2,
      [FIRE_CHAOS]: 1,
      [COLD_CHAOS]: 1,
      [LIGHTNING_CHAOS]: 1
    }
  },
  chaosRes: {
    ref: '+#% total to Chaos Resistance',
    parts: { [CHAOS]: 1, [ALL_RES]: 1, [FIRE_CHAOS]: 1, [COLD_CHAOS]: 1, [LIGHTNING_CHAOS]: 1 }
  },
  life: { ref: '+# total maximum Life', parts: { stat_3299347043: 1 } },
  mana: { ref: '+# total maximum Mana', parts: { stat_1050105434: 1 } },
  es: { ref: '+# total maximum Energy Shield', parts: { stat_3489782002: 1 } }
}

const SUM_ORDER = Object.keys(SUMS) as SumId[]

/** Свойство предмета игрока для сравнения. */
export interface PlayerStat {
  /** ключи сопоставления «группа:stat_…» (explicit/crafted/fractured — одна группа); у суммы — пусто */
  keys: string[]
  /** шаблон на языке предмета с # вместо значения, как его видит игрок («#% reduced …»); у суммы — ref */
  text: string
  /** значение стата (как у парсера): «reduced» — с минусом, «от # до #» — среднее; нет — только наличие */
  value?: number
  /** 1 — больше лучше, -1 — меньше лучше, 0 — важно совпадение */
  better: -1 | 0 | 1
  /** игрок видит значение с обратным знаком («reduced», «less») */
  negated: boolean
  /** S23: сумма (сопротивления, здоровье…) вместо отдельных модов */
  sum?: SumId
  /** S23: строка как в игре — числа на местах # (`modTextString`) */
  shown?: ModText
}

export interface CompareRow {
  status: MatchStatus
  /** свойство игрока (match / worse / missing); у строки суммы нет `lot` */
  mine?: PlayerStat
  /** мод лота (match / worse / extra) — текст на языке сайта */
  lot?: LotMod
  /** значение лота в том же виде, что mine.value */
  theirs?: number
  /** worse у несравнимого стата: значение другое, а не «хуже» */
  differs?: boolean
  /** S23: мод лота вошёл в сумму — итог у строки суммы, а не «у вас …» у мода */
  sum?: SumId
}

export interface LotComparison {
  /** суммы (match / worse), моды лота по порядку (match / worse / extra), затем свойства игрока, которых у лота нет */
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

/** «explicit:stat_1» → «stat_1» (для сумм домен не важен). */
const bareId = (key: string): string => key.slice(key.indexOf(':') + 1)

/** В какие суммы входит стат и с каким множителем. */
function sumsOf(key: string): Array<{ id: SumId; mult: number }> {
  const id = bareId(key)
  return SUM_ORDER.filter((s) => SUMS[s].parts[id] !== undefined).map((s) => ({ id: s, mult: SUMS[s].parts[id] }))
}

/**
 * Свойства предмета игрока — все его моды по типам (`statsByType` парсера), а не фильтры пресета: локальные
 * моды оружия в пресете свёрнуты в DPS. Без псевдо-статов парсера; один стат из модов одной группы
 * (explicit + crafted) — одно свойство с суммой. S23: сопротивления, здоровье, мана, ES — суммами (`SUMS`),
 * первыми; у остальных — строка как в игре (`shown`, по тексту предмета).
 */
export function playerStatsOf(item: Pick<ParsedItem, 'statsByType'> & Partial<Pick<ParsedItem, 'rawText'>>): PlayerStat[] {
  const out: PlayerStat[] = []
  const sums = new Map<SumId, PlayerStat>()
  for (const calc of item.statsByType) {
    if (calc.type === ModifierType.Pseudo) continue
    const ids = calc.stat.trade.ids[calc.type] ?? []
    const keys = [...new Set(ids.map(statKey).filter((k): k is string => k !== null))]
    if (!keys.length) continue
    const roll = statSourcesTotal(calc.sources)
    const value = calc.stat.trade.option ? undefined : roll?.value
    const into = value === undefined ? [] : sumsOf(keys[0])
    if (into.length) {
      for (const { id, mult } of into) {
        const s = sums.get(id) ?? { keys: [], text: SUMS[id].ref, value: 0, better: 1, negated: false, sum: id }
        s.value = s.value! + value! * mult
        sums.set(id, s)
      }
      continue
    }
    const same = out.find((p) => p.keys[0] === keys[0])
    if (same) {
      if (same.value !== undefined && value !== undefined) same.value += value
      // у двух модов одного стата строка «как в игре» — уже не одна
      delete same.shown
      continue
    }
    const translation = translateStatWithRoll(calc, roll)
    out.push({
      keys,
      text: translation.string,
      value,
      better: betterOf(calc.stat.better),
      negated: translation.negate,
      shown: modText(translation.string, calc.stat.ref, roll?.value, calc.sources, item.rawText)
    })
  }
  return [...SUM_ORDER.flatMap((id) => sums.get(id) ?? []), ...out]
}

/** S23: база лота, если она не та, что у предмета игрока (как её назвал сайт), иначе undefined. */
export function otherBase(
  item: Pick<ParsedItem, 'info'> & Partial<Pick<ParsedItem, 'uniqueBase'>>,
  lotBase: string | undefined
): string | undefined {
  if (!lotBase) return undefined
  const base = item.uniqueBase ?? item.info
  // сайт пишет базу на своём языке: www — английский (refName), ru — как RU-клиент (name)
  return lotBase === base.refName || lotBase === base.name ? undefined : lotBase
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
  // S23: ни одного имплицита игрока у лота — другая база; имплициты базы игрока («Has 1 Socket») не сравниваем
  const implicits = player.filter((p) => !p.sum && p.keys.length > 0 && p.keys.every((k) => k.startsWith('implicit:')))
  const otherBase = implicits.length > 0 && !implicits.some((p) => p.keys.some((k) => byKey.has(k)))
  const compared = otherBase ? player.filter((p) => !implicits.includes(p)) : player
  // мод лота → строка свойства игрока, которому он достался (у второго мода того же стата — тот же итог)
  const lotRows = new Map<LotMod, CompareRow>()
  const sumRows: CompareRow[] = []
  const missing: CompareRow[] = []
  let matched = 0
  for (const mine of compared) {
    if (mine.sum) {
      // S23: сумма — все моды лота, входящие в неё (implicit / explicit / крафт, гибриды с множителем)
      const parts = SUMS[mine.sum].parts
      const found = mods.flatMap((m) => {
        const key = m.stat ? statKey(m.stat) : null
        const mult = key ? parts[bareId(key)] : undefined
        return key && mult !== undefined ? [{ m, key, mult }] : []
      })
      if (!found.length) {
        missing.push({ status: 'missing', mine })
        continue
      }
      const values = found.map(({ m, key }) => read(m, { keys: [key], text: '', better: 1, negated: false }))
      const theirs = values.every((v) => v !== undefined)
        ? found.reduce((a, { mult }, i) => a + values[i]! * mult, 0)
        : undefined
      const row: CompareRow = { ...judge(mine, theirs), mine, ...(theirs !== undefined ? { theirs } : {}) }
      if (row.status === 'match') matched++
      sumRows.push(row)
      for (const { m } of found) if (!lotRows.has(m)) lotRows.set(m, { status: row.status, lot: m, sum: mine.sum })
      continue
    }
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
  return { rows: [...sumRows, ...rows, ...missing], matched, total: compared.length }
}
