// POETH (S61): курс exalted ↔ divine и «цена у Ange» для окна цены PoE 2 — по почасовому фиду обмена GGG
// (realm poe2: web.poecdn.com/api/currency-exchange/poe2/<hourId>, тот же формат, что у PoE 1; S24 — «у Фаустуса»).
// Чистый модуль; tests/poe2/ange.test.ts (настоящие часы фида — tests/fixtures/poe2/exchange).
//
//  - база цен PoE 2 — Exalted Orb, дорогое — Divine Orb; Chaos Orb в PoE 2 дороже exalted. У Ange меняют на все три:
//    у предмета до трёх рынков — «за exalted», «за chaos», «за divine»;
//  - курс: exalted за 1 divine и exalted за 1 chaos — средняя по сделкам (VWAP) за 6 ч (нет сделок — 24, 48 ч), прямой
//    рынок пары; нет его — через третью валюту;
//  - цена предмета: самый свежий час (не старше FRESH_HOURS), где его меняли хотя бы на одну базу; главный рынок —
//    где за час поменяли больше штук; цена рынка — средняя по сделкам часа, диапазон — мин/макс соотношений часа;
//    в exalted — по курсу. Exalted Orb — 1 ex, Divine Orb и Chaos Orb — ровно курс (цифры не расходятся с плашкой).
// Имя предмета → id фида: resources/data/poe2/exchange/exchange-ids.json (tools/data/sync-poe2-exchange-ids.mjs).

import type { FullHour, FullMarket } from '../../flip/feed'
import type { PairHour } from '../../flip/stats'
import { CHAOS_ID, DIVINE_ID, hourStart } from '../../wealth/exchange'

export { CHAOS_ID, DIVINE_ID }
/** Exalted Orb в фиде PoE 2 (id без 'Metadata/Items/') */
export const EXALTED_ID = 'Currency/CurrencyAddModToRare'

export type AngeBase = 'exalted' | 'chaos' | 'divine'
export const ANGE_BASE_ID: Readonly<Record<AngeBase, string>> = { exalted: EXALTED_ID, chaos: CHAOS_ID, divine: DIVINE_ID }
const BASES: readonly AngeBase[] = ['exalted', 'chaos', 'divine']

/** Искать час со сделками не дальше стольких часов от последнего часа фида. */
export const FRESH_HOURS = 24
/** меньше штук за час — «мало сделок» */
export const LOW_VOLUME = 5
/** данные старше стольких часов — «давно не меняли» */
export const STALE_HOURS = 3
/** окна VWAP курса (часов): самое короткое, где есть сделки */
export const RATE_WINDOWS_H = [6, 24, 48] as const

// ---------------------------------------------------------------- пары фида

/** Рынок → час пары X/база («сколько базы за 1 шт. X»); null — рынок не про эту пару. Как normalizeMarket (S13). */
function pairOf(m: FullMarket, hour: number, item: string, baseId: string): PairHour | null {
  const [, a, c, va, vc, loA, loC, hiA, hiC, lsA, lsC] = m
  let xFirst: boolean
  if (a === item && c === baseId) xFirst = true
  else if (a === baseId && c === item) xFirst = false
  else return null
  const price = (rx: number, rb: number): number => (rx > 0 && rb > 0 ? rb / rx : 0)
  const ps = [xFirst ? price(loA, loC) : price(loC, loA), xFirst ? price(hiA, hiC) : price(hiC, hiA)].filter((p) => p > 0)
  return {
    hour,
    volX: xFirst ? va : vc,
    volBase: xFirst ? vc : va,
    lo: ps.length ? Math.min(...ps) : 0,
    hi: ps.length ? Math.max(...ps) : 0,
    stockX: xFirst ? lsA : lsC,
    stockBase: xFirst ? lsC : lsA
  }
}

/** Часы пары X/база лиги, от старых к новым. */
export function pairHours2(hours: readonly FullHour[], league: string, item: string, base: AngeBase): PairHour[] {
  const baseId = ANGE_BASE_ID[base]
  const out: PairHour[] = []
  for (const h of hours) {
    for (const m of h.markets) {
      if (m[0] !== league) continue
      const p = pairOf(m, h.hour, item, baseId)
      if (p) {
        out.push(p)
        break
      }
    }
  }
  return out.sort((x, y) => x.hour - y.hour)
}

function traded(h: PairHour): boolean {
  return h.volX > 0 && h.volBase > 0
}

export function lastFeedHour(hours: readonly FullHour[]): number | undefined {
  let max: number | undefined
  for (const h of hours) if (max === undefined || h.hour > max) max = h.hour
  return max
}

/**
 * Часы фида старше этого (от начала текущего часа) — данные устарели: без сети кэш держится до суток, и окно уверенно
 * показало бы позавчерашнюю цену. Тогда курса и цены у Ange нет (окно идёт на сайт, как без фида).
 */
export const STALE_FEED_HOURS = 3

/** Свежие ли часы: последний час фида не старше STALE_FEED_HOURS от начала текущего часа. */
export function feedFresh(hours: readonly FullHour[], now = Date.now()): boolean {
  const last = lastFeedHour(hours)
  return last !== undefined && last >= hourStart(now) - STALE_FEED_HOURS * 3600
}

/** VWAP «базы за 1 шт. X» за самое короткое окно RATE_WINDOWS_H со сделками; 0 — сделок нет. */
function vwap(hours: readonly FullHour[], league: string, item: string, base: AngeBase, last: number): number {
  const ph = pairHours2(hours, league, item, base).filter(traded)
  for (const w of RATE_WINDOWS_H) {
    const hs = ph.filter((h) => h.hour > last - w * 3600 && h.hour <= last)
    const x = hs.reduce((s, h) => s + h.volX, 0)
    const b = hs.reduce((s, h) => s + h.volBase, 0)
    if (x > 0 && b > 0) return b / x
  }
  return 0
}

// ---------------------------------------------------------------- курс

export interface Poe2Rate {
  /** exalted за 1 divine */
  exaltedPerDivine: number
  /** exalted за 1 chaos; нет сделок ни по прямой паре, ни через divine — undefined */
  exaltedPerChaos?: number
  /** последний час фида, ms */
  hour: number
}

const round2 = (v: number): number => Math.round(v * 100) / 100

/** Курс лиги по часам фида; null — сделок divine ↔ exalted нет ни прямо, ни через chaos. */
export function poe2Rate(hours: readonly FullHour[], league: string): Poe2Rate | null {
  const last = lastFeedHour(hours)
  if (last === undefined) return null
  const chaosPerDivine = vwap(hours, league, DIVINE_ID, 'chaos', last)
  let exPerChaos = vwap(hours, league, CHAOS_ID, 'exalted', last)
  let exPerDiv = vwap(hours, league, DIVINE_ID, 'exalted', last)
  if (!exPerDiv && exPerChaos && chaosPerDivine) exPerDiv = exPerChaos * chaosPerDivine
  if (!exPerDiv) return null
  if (!exPerChaos && chaosPerDivine) exPerChaos = exPerDiv / chaosPerDivine
  return { exaltedPerDivine: round2(exPerDiv), ...(exPerChaos ? { exaltedPerChaos: round2(exPerChaos) } : {}), hour: last * 1000 }
}

/** exalted за 1 шт. базы по курсу; неизвестно — undefined. */
export function exaltedPerBase(base: AngeBase, rate: Pick<Poe2Rate, 'exaltedPerDivine' | 'exaltedPerChaos'>): number | undefined {
  if (base === 'exalted') return 1
  if (base === 'divine') return rate.exaltedPerDivine
  return rate.exaltedPerChaos
}

// ---------------------------------------------------------------- цена у Ange

export interface AngeMarket {
  /** на что меняли */
  base: AngeBase
  /** базы за 1 шт.: средняя цена сделок часа */
  each: number
  /** диапазон соотношений часа, базы за 1 шт. */
  lo: number
  hi: number
  /** штук предмета в сделках за час */
  volume: number
}

export interface AngePrice {
  /** id фида без 'Metadata/Items/' */
  id: string
  /** начало часа данных, ms */
  hour: number
  /** на сколько часов этот час старше последнего часа фида (0 — свежий) */
  age: number
  /** курс, по которому цена переведена в exalted */
  exaltedPerDivine: number
  exaltedPerChaos?: number
  /** цена 1 шт. в exalted (по главному рынку) */
  exalted: number
  /** главный рынок: больше штук за час */
  main: AngeMarket
  /** остальные рынки этого часа (меньше штук) */
  others: AngeMarket[]
  /** мало сделок или данные не за последний час — цена примерная */
  low: boolean
}

function market(h: PairHour, base: AngeBase): AngeMarket {
  const each = h.volBase / h.volX
  return { base, each, lo: h.lo > 0 ? h.lo : each, hi: h.hi > 0 ? h.hi : each, volume: h.volX }
}

/** Английское имя → id фида. Одно имя у нескольких id — берём тот, что меняли больше. */
export function feedIdsByName(names: Readonly<Record<string, string>>): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const [id, name] of Object.entries(names)) {
    const key = name.toLowerCase()
    const list = out.get(key)
    if (list) list.push(id)
    else out.set(key, [id])
  }
  return out
}

/** Сколько штук предмета поменяли за последние FRESH_HOURS часов на любую базу. */
export function feedVolume2(hours: readonly FullHour[], league: string, id: string): number {
  const last = lastFeedHour(hours)
  if (last === undefined) return 0
  let v = 0
  for (const base of BASES) {
    for (const p of pairHours2(hours, league, id, base)) if (p.hour > last - FRESH_HOURS * 3600 && traded(p)) v += p.volX
  }
  return v
}

/** Цена предмета у Ange; undefined — за FRESH_HOURS его не меняли на exalted/chaos/divine. */
export function angePrice(hours: readonly FullHour[], league: string, id: string, rate: Poe2Rate): AngePrice | undefined {
  const last = lastFeedHour(hours)
  if (last === undefined || !(rate.exaltedPerDivine > 0)) return undefined
  const fixed: Partial<Record<string, number>> = { [EXALTED_ID]: 1, [DIVINE_ID]: rate.exaltedPerDivine, [CHAOS_ID]: rate.exaltedPerChaos }
  // за саму себя валюту не меняют
  const bases = BASES.filter((b) => ANGE_BASE_ID[b] !== id)
  let hour: number | undefined
  for (const base of bases) {
    for (const p of pairHours2(hours, league, id, base)) {
      if (p.hour > last - FRESH_HOURS * 3600 && traded(p) && (hour === undefined || p.hour > hour)) hour = p.hour
    }
  }
  if (hour === undefined) return undefined
  const ms: AngeMarket[] = []
  for (const base of bases) {
    const p = pairHours2(hours, league, id, base).find((x) => x.hour === hour && traded(x))
    // рынок в валюте без курса в exalted не сравнить
    if (p && exaltedPerBase(base, rate) !== undefined) ms.push(market(p, base))
  }
  if (!ms.length) return undefined
  // главный рынок — где поменяли больше штук; поровну — exalted, затем chaos
  ms.sort((a, b) => b.volume - a.volume || BASES.indexOf(a.base) - BASES.indexOf(b.base))
  const [main, ...others] = ms
  const known = fixed[id]
  const exalted = known != null && known > 0 ? known : main.each * exaltedPerBase(main.base, rate)!
  // Divine/Chaos Orb: главный рынок показываем ровно по курсу (как плашка курса)
  if (known != null && known > 0) main.each = known / exaltedPerBase(main.base, rate)!
  const age = Math.round((last - hour) / 3600)
  const volume = ms.reduce((s, m) => s + m.volume, 0)
  return {
    id,
    hour: hour * 1000,
    age,
    exaltedPerDivine: rate.exaltedPerDivine,
    ...(rate.exaltedPerChaos ? { exaltedPerChaos: rate.exaltedPerChaos } : {}),
    exalted,
    main,
    others,
    low: volume < LOW_VOLUME || age >= STALE_HOURS
  }
}

/** Цена по английскому имени: среди одноимённых id — самый ходовой. */
export function angePriceByName(
  hours: readonly FullHour[],
  league: string,
  byName: ReadonlyMap<string, readonly string[]>,
  name: string,
  rate: Poe2Rate
): AngePrice | undefined {
  const ids = byName.get(name.toLowerCase())
  if (!ids?.length) return undefined
  const id = ids.length === 1 ? ids[0] : [...ids].sort((a, b) => feedVolume2(hours, league, b) - feedVolume2(hours, league, a))[0]
  return angePrice(hours, league, id, rate)
}

/** Точность цены обмена 0…4 — по штукам за час и свежести (как faustusConfidence у PoE 1). */
export function angeConfidence(p: Pick<AngePrice, 'main' | 'others' | 'age'>): number {
  const volume = p.main.volume + p.others.reduce((s, m) => s + m.volume, 0)
  const byVolume = volume >= 50 ? 4 : volume >= 15 ? 3 : volume >= LOW_VOLUME ? 2 : 1
  return p.age >= STALE_HOURS ? Math.min(byVolume, 1) : p.age > 0 ? Math.min(byVolume, 3) : byVolume
}

// ---------------------------------------------------------------- IPC (renderer ↔ main)

export interface Poe2AngeArgs {
  league: string
  /** английские имена предметов (info.refName; валюта лотов — по tradeTag из данных) */
  names: string[]
}

export type Poe2AngeResult =
  | {
      ok: true
      rate: Poe2Rate
      /** по имени из запроса; нет имени — у Ange за сутки не меняли */
      prices: Record<string, AngePrice>
    }
  | { ok: false }

/** Курс для вкладки и окна; league — лига, по которой он посчитан. */
export interface Poe2CurrencyRate extends Poe2Rate {
  league: string
}
