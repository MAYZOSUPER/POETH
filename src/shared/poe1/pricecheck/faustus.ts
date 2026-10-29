// POETH (S24): цена валюты и всего, что меняют у Фаустуса, — по почасовому фиду обмена GGG, а не по объявлениям
// сайта (на сайте валюту почти не покупают, там старые лоты и приманки). Чистый модуль; tests/pricecheck/faustus.test.ts.
//
//  - час — последний полный час фида, в котором предмет меняли на chaos или divine (не старше FRESH_HOURS);
//  - у предмета два рынка: «за chaos» и «за divine». Главный — где за час поменяли больше штук; цена рынка —
//    средняя по сделкам часа (VWAP), диапазон — мин/макс соотношений часа (как в фиде), объём — штук за час;
//  - Divine Orb — ровно курс плашки в шапке окна (`chaosPerDivine`), чтобы цифры не расходились;
//    Chaos Orb — 1 c, главный рынок — divine.
// Имя предмета → id фида: resources/data/poe1/wealth/exchange-ids.json (id → английское имя), у предмета из Ctrl+D
// английское имя есть на обоих клиентах (`info.refName`).

import type { FullHour } from '../../flip/feed'
import { pairHours, type PairHour } from '../../flip/stats'
import { CHAOS_ID, DIVINE_ID } from '../../wealth/exchange'

export type FaustusBase = 'chaos' | 'divine'

export interface FaustusMarket {
  /** на что меняли */
  base: FaustusBase
  /** базы за 1 шт.: средняя цена сделок часа */
  each: number
  /** диапазон соотношений часа, базы за 1 шт. */
  lo: number
  hi: number
  /** штук предмета в сделках за час */
  volume: number
}

export interface FaustusPrice {
  /** id фида без 'Metadata/Items/' */
  id: string
  /** начало часа данных, ms */
  hour: number
  /** на сколько часов этот час старше последнего часа фида (0 — свежий) */
  age: number
  /** chaos за 1 divine — тот же курс, что в шапке окна цены */
  chaosPerDivine: number
  /** цена 1 шт. в chaos (по главному рынку) */
  chaos: number
  /** главный рынок: больше штук за час */
  main: FaustusMarket
  /** второй рынок, если в этот час меняли и там */
  other?: FaustusMarket
  /** мало сделок или данные не за последний час — цена примерная */
  low: boolean
}

/** Искать час со сделками не дальше стольких часов от последнего часа фида. */
export const FRESH_HOURS = 24
/** меньше штук за час — «мало сделок» */
export const LOW_VOLUME = 5
/** данные старше стольких часов — «давно не меняли» */
export const STALE_HOURS = 3

/** Английское имя → id фида. Одно имя у нескольких id (инкубаторы, legacy) — берём тот, что меняли больше. */
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

function traded(h: PairHour): boolean {
  return h.volX > 0 && h.volBase > 0
}

function market(h: PairHour, base: FaustusBase): FaustusMarket {
  const each = h.volBase / h.volX
  return { base, each, lo: h.lo > 0 ? h.lo : each, hi: h.hi > 0 ? h.hi : each, volume: h.volX }
}

/** Рынок «предмет X за базу» в час `hour` (только со сделками). */
function marketAt(hours: readonly FullHour[], league: string, id: string, base: FaustusBase, hour: number): FaustusMarket | undefined {
  const h = pairHours(hours, league, id, base).find((p) => p.hour === hour && traded(p))
  return h ? market(h, base) : undefined
}

/** Сколько штук предмета поменяли за последние FRESH_HOURS часов (для выбора среди одноимённых id). */
export function feedVolume(hours: readonly FullHour[], league: string, id: string): number {
  const last = lastFeedHour(hours)
  if (last === undefined) return 0
  let v = 0
  for (const base of ['chaos', 'divine'] as const) {
    for (const p of pairHours(hours, league, id, base)) if (p.hour > last - FRESH_HOURS * 3600 && traded(p)) v += p.volX
  }
  return v
}

export function lastFeedHour(hours: readonly FullHour[]): number | undefined {
  let max: number | undefined
  for (const h of hours) if (max === undefined || h.hour > max) max = h.hour
  return max
}

/**
 * Цена предмета у Фаустуса; undefined — за FRESH_HOURS часов его не меняли на chaos/divine (или нет курса).
 * `chaosPerDivine` — курс из шапки окна цены (trade.currencyRate).
 */
export function faustusPrice(
  hours: readonly FullHour[],
  league: string,
  id: string,
  chaosPerDivine: number
): FaustusPrice | undefined {
  const last = lastFeedHour(hours)
  if (last === undefined || !(chaosPerDivine > 0)) return undefined
  const isChaos = id === CHAOS_ID
  const isDivine = id === DIVINE_ID
  // самый свежий час, где предмет меняли хотя бы на одну базу (за саму себя валюту не меняют)
  const bases: FaustusBase[] = isChaos ? ['divine'] : isDivine ? ['chaos'] : ['chaos', 'divine']
  let hour: number | undefined
  for (const base of bases) {
    for (const p of pairHours(hours, league, id, base)) {
      if (p.hour > last - FRESH_HOURS * 3600 && traded(p) && (hour === undefined || p.hour > hour)) hour = p.hour
    }
  }
  if (hour === undefined) return undefined
  const ms = bases.map((b) => marketAt(hours, league, id, b, hour!)).filter((m): m is FaustusMarket => m != null)
  // главный рынок — где поменяли больше штук; поровну — chaos
  ms.sort((a, b) => b.volume - a.volume || (a.base === 'chaos' ? -1 : 1))
  const [main, other] = ms
  if (isDivine) main.each = chaosPerDivine
  const chaos = isChaos ? 1 : isDivine ? chaosPerDivine : main.base === 'chaos' ? main.each : main.each * chaosPerDivine
  const age = Math.round((last - hour) / 3600)
  const volume = ms.reduce((s, m) => s + m.volume, 0)
  return {
    id,
    hour: hour * 1000,
    age,
    chaosPerDivine,
    chaos,
    main,
    ...(other ? { other } : {}),
    low: volume < LOW_VOLUME || age >= STALE_HOURS
  }
}

/** Цена по английскому имени: среди одноимённых id — самый ходовой. */
export function faustusPriceByName(
  hours: readonly FullHour[],
  league: string,
  byName: ReadonlyMap<string, readonly string[]>,
  name: string,
  chaosPerDivine: number
): FaustusPrice | undefined {
  const ids = byName.get(name.toLowerCase())
  if (!ids?.length) return undefined
  const id = ids.length === 1 ? ids[0] : [...ids].sort((a, b) => feedVolume(hours, league, b) - feedVolume(hours, league, a))[0]
  return faustusPrice(hours, league, id, chaosPerDivine)
}

/** Точность цены обмена 0…4 — как у поиска («похожих»), но по штукам за час и свежести. */
export function faustusConfidence(p: Pick<FaustusPrice, 'main' | 'other' | 'age'>): number {
  const volume = p.main.volume + (p.other?.volume ?? 0)
  const byVolume = volume >= 50 ? 4 : volume >= 15 ? 3 : volume >= LOW_VOLUME ? 2 : 1
  return p.age >= STALE_HOURS ? Math.min(byVolume, 1) : p.age > 0 ? Math.min(byVolume, 3) : byVolume
}

/** «04:00–05:00» — час данных по местному времени (`hour` — начало часа, ms). */
export function hourRange(hour: number): string {
  const f = (ms: number): string => {
    const d = new Date(ms)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  return `${f(hour)}–${f(hour + 3_600_000)}`
}

// ---------------------------------------------------------------- IPC (renderer ↔ main)

export interface Poe1FaustusArgs {
  league: string
  /** английские имена предметов (info.refName; валюта лотов — по tradeTag из данных) */
  names: string[]
}

export type Poe1FaustusResult =
  | {
      ok: true
      /** chaos за 1 divine — как у плашки курса в шапке */
      chaosPerDivine: number
      /** последний час фида, ms */
      lastHour: number
      /** по имени из запроса; нет имени — у Фаустуса за сутки не меняли */
      prices: Record<string, FaustusPrice>
    }
  | { ok: false }
