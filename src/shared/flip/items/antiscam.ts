// Антискам «Недооценённых уников» (S33): какие из найденных лотов — правда дешёвые, а какие — приманка,
// другой вариант или старьё. Только по ответу fetch одной проверки, без новых запросов.
//
// Правила (план, раздел «Помощник по флиппингу → Предметы»):
//  - лот старше недели — «старый» (продавец, скорее всего, не ответит, цена забыта);
//  - вариант: Foulborn, stat-фильтры poe.ninja (заменённое свойство), порча, связи, имплициты — как у строки
//    poe.ninja, иначе «другой вариант» (это цена другого предмета);
//  - продавец в pricefixers.csv PoE Hub — «price-fixer»;
//  - приманка: лот дешевле 0,5 × медианы следующих 5 лотов. У личного обмена такой лот — приманка (продавец не
//    продаст), у мгновенного выкупа приманки не бывает (купить можно сразу) — лот остаётся, но с пометкой
//    «в разы дешевле — сверьте предмет»;
//  - уровень цены «настоящий», если на нём ≥ 3 лотов в ±15 %. Такой уровень ниже порога поиска значит, что
//    рынок уже ниже цены poe.ninja (снимок отстал) — перепродать по ней не выйдет, ожидаемая продажа = этот
//    уровень, и «выгодных» там нет.

import type { ItemLot, ItemLotVerdict, ItemRow, ItemTradeStat } from '../../types/flip'

export const MAX_AGE_DAYS = 7
export const BAIT_RATIO = 0.5
export const BAIT_WINDOW = 5
export const CLUSTER_BAND = 0.15
export const CLUSTER_MIN = 3
/** выгода меньше — «мало»: 10 % цены покупки и не меньше 3 chaos */
export const MIN_PROFIT_SHARE = 0.1
export const MIN_PROFIT_CHAOS = 3

/** Лот так, как его отдаёт normalizeListing (окно цены, shared/poe1/pricecheck/results.ts). */
export interface LotInput {
  id: string
  kind: 'instant' | 'person'
  price: { amount: number; currency: string } | null
  indexed?: string
  fee?: number
  accountName: string
  online: 'online' | 'afk' | 'offline'
  corrupted?: boolean
  links?: number
  foulborn?: boolean
  mods?: Array<{ kind: string; stat?: string }>
  /** все stat id лота (любые моды, в т. ч. заменённое свойство Foulborn) — lotStats() */
  stats?: string[]
}

/** Чего ждём от лота: строка poe.ninja. */
export type LotExpect = Pick<ItemRow, 'links' | 'unlinked' | 'foulborn' | 'sell' | 'chaos' | 'confidence'> & {
  trade?: readonly ItemTradeStat[]
  corrupted?: boolean
  implicits?: number
}

export interface CheckContext {
  /** chaos за единицу валюты лота ('chaos' → 1, 'divine' → курс…) */
  rates: Readonly<Record<string, number>>
  now: number
  isFixer?: (account: string) => boolean
}

export interface CheckOutcome {
  lots: ItemLot[]
  /** ожидаемая продажа с поправкой на рынок, chaos */
  sell: number
  market: { price: number; n: number } | null
}

const DAY = 86_400_000

function median(v: readonly number[]): number {
  const s = [...v].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

const round1 = (v: number): number => Math.round(v * 10) / 10

/** 'explicit.stat_123' и 'stat.mutated.stat_123' → 'stat_123': домен у заменённого свойства бывает разный. */
const statKey = (id: string): string => id.slice(id.lastIndexOf('.') + 1)

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Все stat id предмета из ответа fetch: `hash` у модов-объектов и `extended.hashes` всех доменов. */
export function lotStats(item: unknown): string[] {
  if (!isObj(item)) return []
  const out = new Set<string>()
  for (const [k, v] of Object.entries(item)) {
    if (!k.endsWith('Mods') || !Array.isArray(v)) continue
    for (const m of v.slice(0, 60)) if (isObj(m) && typeof m.hash === 'string' && m.hash) out.add(m.hash)
  }
  const hashes = isObj(item.extended) && isObj(item.extended.hashes) ? item.extended.hashes : {}
  for (const list of Object.values(hashes)) {
    if (!Array.isArray(list)) continue
    for (const h of list.slice(0, 60)) if (Array.isArray(h) && typeof h[0] === 'string') out.add(h[0])
  }
  return [...out].slice(0, 120)
}

/** Другой вариант / порча / связи / имплициты — или null, если лот тот же предмет. */
export function variantProblem(lot: LotInput, want: LotExpect): ItemLotVerdict | null {
  if (lot.foulborn !== undefined && lot.foulborn !== want.foulborn) return 'variant'
  // сайт уже искал по этим stat-фильтрам; здесь — вторая проверка, только если stat id лота видны
  if (want.trade?.length && lot.stats?.length) {
    const have = new Set(lot.stats.map(statKey))
    if (want.trade.some((t) => !have.has(statKey(t.id)))) return 'variant'
  }
  if (lot.corrupted !== undefined && Boolean(lot.corrupted) !== Boolean(want.corrupted)) return 'corrupted'
  const links = lot.links ?? 0
  if (want.links === 6 && links < 6) return 'links'
  if (want.links === 5 && links !== 5) return 'links'
  if (want.unlinked && links >= 5) return 'links'
  if (want.implicits !== undefined && lot.mods) {
    const have = lot.mods.filter((m) => m.kind === 'implicit').length
    if (have < want.implicits) return 'implicits'
  }
  return null
}

/** Самый плотный уровень цены: ≥ CLUSTER_MIN лотов в ±CLUSTER_BAND от одного из них; цена — медиана группы. */
export function priceCluster(prices: readonly number[]): { price: number; n: number } | null {
  let best: number[] = []
  for (const p of prices) {
    const near = prices.filter((x) => Math.abs(x - p) <= p * CLUSTER_BAND)
    if (near.length > best.length || (near.length === best.length && median(near) < median(best))) best = near
  }
  return best.length >= CLUSTER_MIN ? { price: round1(median(best)), n: best.length } : null
}

/** Разобрать лоты одной проверки. Порядок — как отдал сайт (сначала дешёвые). */
export function checkLots(input: readonly LotInput[], want: LotExpect, ctx: CheckContext): CheckOutcome {
  const lots: ItemLot[] = input.map((l) => {
    const rate = l.price ? ctx.rates[l.price.currency] : undefined
    const chaos = l.price && rate ? round1(l.price.amount * rate) : null
    const lot: ItemLot = {
      id: l.id,
      kind: l.kind,
      amount: l.price?.amount ?? null,
      currency: l.price?.currency ?? null,
      chaos,
      account: l.accountName,
      online: l.online,
      verdict: 'deal'
    }
    if (l.fee !== undefined) lot.fee = l.fee
    if (l.links !== undefined) lot.links = l.links
    const at = l.indexed ? Date.parse(l.indexed) : NaN
    if (Number.isFinite(at)) lot.ageDays = Math.max(0, Math.round(((ctx.now - at) / DAY) * 10) / 10)

    const problem = variantProblem(l, want)
    if (chaos === null) lot.verdict = 'currency'
    else if (ctx.isFixer?.(l.accountName)) lot.verdict = 'fixer'
    else if (problem) lot.verdict = problem
    else if ((lot.ageDays ?? 0) > MAX_AGE_DAYS) lot.verdict = 'old'
    return lot
  })

  // приманки: среди «тех же» лотов, по возрастанию цены
  const same = lots.filter((l) => l.verdict === 'deal').sort((a, b) => (a.chaos ?? 0) - (b.chaos ?? 0))
  for (let i = 0; i < same.length; i++) {
    const next = same.slice(i + 1, i + 1 + BAIT_WINDOW).map((l) => l.chaos ?? 0)
    // соседей мало — сравниваем с ценой poe.ninja
    const ref = next.length >= 3 ? median(next) : want.chaos
    if ((same[i].chaos ?? 0) >= BAIT_RATIO * ref) continue
    if (same[i].kind === 'person') same[i].verdict = 'bait'
    else same[i].tooCheap = true
  }

  // уровень цены ниже порога: рынок уже ниже poe.ninja
  const real = lots.filter((l) => l.verdict === 'deal')
  const market = priceCluster(real.map((l) => l.chaos ?? 0))
  const sell = market ? Math.min(want.sell, market.price) : want.sell

  for (const l of real) {
    const profit = round1(sell - (l.chaos ?? 0))
    l.profit = profit
    if (profit < Math.max(MIN_PROFIT_CHAOS, (l.chaos ?? 0) * MIN_PROFIT_SHARE)) l.verdict = 'thin'
    let c = want.confidence
    if (l.kind === 'person') c *= 0.85
    if (l.tooCheap) c *= 0.6
    if ((l.ageDays ?? 0) > 3) c *= 0.85
    l.confidence = Math.round(c * 100) / 100
  }
  return { lots, sell: round1(sell), market }
}

/** Курсы валют лота в chaos: chaos, divine (курс шапки) и что есть в фиде обмена. */
export function lotRates(divine: number, more: Readonly<Record<string, number>> = {}): Record<string, number> {
  const r: Record<string, number> = { ...more, chaos: 1 }
  if (divine > 0) r.divine = divine
  return r
}
