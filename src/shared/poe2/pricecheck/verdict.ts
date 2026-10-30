// POETH (S47): вердикт окна цены PoE2 — та же строка «что делать с предметом», что у PoE1 (shared/poe1/pricecheck/
// verdict.ts, те же виды и тексты), но у PoE2 своя экономика: базовая валюта — exalted, дорогая — divine, а chaos
// стоит дороже exalted. Курса exalted ↔ divine у окна PoE2 пока нет (фид обмена GGG для PoE2 есть — задел на
// потом), поэтому цены сравниваются только в одной валюте:
//   none     — 0 лотов;
//   valuable — от 1 divine, или дорого (≥ EXPENSIVE_EXALTED ex) при малом числе лотов / большом разбросе;
//   few      — мало данных (точность ≤ 1);
//   junk     — меньше 1 exalted: продать торговцу (валюте и стопкам — cheap: копить и продавать пачкой);
//   list     — «выставьте за ~X»: самый дешёвый честный лот (группы «честной цены», без приманок).
// Цена в прочих валютах (chaos, regal, annul…) — как есть, без «хлама» и без «ценной» (не с чем сравнить); исключение —
// 1 сфера превращения или усиления (минимальная цена на trade2): это заведомо меньше 1 exalted — «хлам».
// Чистый TS.

import {
  confidenceOf,
  MARKET_WINDOW,
  type HonestPrice,
  type MarketPrice,
  type Poe1ExchangeOffer,
  type Poe1Listing,
  type Poe1Price
} from '../../poe1/pricecheck/results'
import { niceChaos, niceDivine, priceNote, referencePrice, type Verdict } from '../../poe1/pricecheck/verdict'

/** дешевле — «хлам» (exalted) */
export const JUNK_EXALTED = 1
export const FEW_CONFIDENCE = 1
/** «дорого» для правил малого числа лотов и разброса (exalted) */
export const EXPENSIVE_EXALTED = 50
export const EXPENSIVE_FEW_CONFIDENCE = 2
export const SPREAD_RATIO = 3
export const SPREAD_MIN_LOTS = 4
export const NOTE_MIN_CONFIDENCE = 2
/** самые дешёвые сферы PoE2: одна такая — заведомо меньше 1 exalted */
export const BELOW_EXALTED: ReadonlySet<string> = new Set(['transmute', 'aug'])

/** Цена заведомо меньше 1 exalted (курса нет): exalted < 1 или одна дешёвая сфера. */
function belowOneExalted(p: Poe1Price): boolean {
  return p.currency === 'exalted' ? p.amount < JUNK_EXALTED : BELOW_EXALTED.has(p.currency) && p.amount <= 1
}

export type Poe2VerdictInput =
  | {
      kind: 'trade'
      total: number
      listings: readonly Poe1Listing[]
      honest: HonestPrice
      /** валюта, стопки: «продайте торговцу» не говорим */
      noVendor: boolean
    }
  | {
      kind: 'bulk'
      total: number
      /** цена за 1 шт. у лучшего предложения обмена */
      each?: Poe1Price
    }

/** Округление как у PoE1: divine — niceDivine, остальные — по шкале chaos (до 1 — сотые, до 20 — целые…). */
export function nicePrice(p: Poe1Price): Poe1Price {
  return { amount: p.currency === 'divine' ? niceDivine(p.amount) : niceChaos(p.amount), currency: p.currency }
}

/** Разброс в одной валюте с самым дешёвым лотом: верхняя четверть / самый дешёвый. */
function spreadOf(listings: readonly Poe1Listing[], honest: HonestPrice, currency: string): { ratio: number; min: number; max: number } | undefined {
  const skip = new Set([...honest.instant.outliers, ...honest.person.outliers])
  const values = listings
    .filter((l) => !skip.has(l.id) && l.price && l.price.amount > 0 && l.price.currency === currency)
    .map((l) => l.price!.amount)
    .sort((a, b) => a - b)
  if (values.length < SPREAD_MIN_LOTS) return undefined
  const min = values[0]
  const max = values[Math.floor((values.length - 1) * 0.75)]
  return { ratio: max / min, min, max }
}

export function poe2Verdict(input: Poe2VerdictInput): Verdict {
  if (input.kind === 'bulk') {
    const confidence = input.each ? confidenceOf(input.total) : 0
    if (!input.each) return { kind: 'none', count: 0, confidence }
    const base = { price: nicePrice(input.each), count: input.total, confidence }
    if (confidence <= FEW_CONFIDENCE) return { kind: 'few', ...base }
    if (belowOneExalted(input.each)) return { kind: 'cheap', ...base }
    return { kind: 'list', ...base }
  }

  const { honest, total, listings } = input
  const priced = honest.instant.count + honest.person.count
  if (total <= 0 && priced === 0) return { kind: 'none', count: 0, confidence: 0 }
  const confidence = honest.confidence
  const count = Math.max(total, priced)
  const ref = referencePrice(honest)
  if (!ref) return { kind: 'few', count, confidence }

  const price = nicePrice(ref)
  const note = confidence >= NOTE_MIN_CONFIDENCE ? priceNote(price) : undefined
  const base = { price, count, confidence }
  const isDiv = ref.currency === 'divine' && ref.amount >= 1
  const expensive = isDiv || (ref.currency === 'exalted' && ref.amount >= EXPENSIVE_EXALTED)
  if (expensive) {
    if (confidence <= EXPENSIVE_FEW_CONFIDENCE) return { kind: 'valuable', reason: 'few', ...base, note }
    const spread = spreadOf(listings, honest, ref.currency)
    if (spread && spread.ratio >= SPREAD_RATIO) {
      return {
        kind: 'valuable',
        reason: 'spread',
        ...base,
        note,
        range: {
          min: nicePrice({ amount: spread.min, currency: ref.currency }),
          max: nicePrice({ amount: spread.max, currency: ref.currency })
        }
      }
    }
    if (isDiv) return { kind: 'valuable', reason: 'div', ...base, note }
  }
  if (confidence <= FEW_CONFIDENCE) return { kind: 'few', ...base }
  if (belowOneExalted(ref)) return { kind: input.noVendor ? 'cheap' : 'junk', ...base }
  return { kind: 'list', ...base, note }
}

/**
 * «Цена на рынке» PoE2: середина самых дешёвых честных лотов (без приманок) в валюте самого дешёвого лота —
 * лоты в других валютах без курса не сравнить, их не считаем (у PoE1 то же самое — по chaos, у PoE2 база другая).
 */
export function poe2MarketPrice(listings: readonly Poe1Listing[], honest: HonestPrice): MarketPrice | undefined {
  const skip = new Set([...honest.instant.outliers, ...honest.person.outliers])
  const priced = listings.filter((l): l is Poe1Listing & { price: Poe1Price } => !skip.has(l.id) && l.price != null && l.price.amount > 0)
  if (!priced.length) return undefined
  const currency = priced[0].price.currency
  const values = priced
    .filter((l) => l.price.currency === currency)
    .map((l) => l.price.amount)
    .sort((a, b) => a - b)
    .slice(0, MARKET_WINDOW)
  const m = values.length >> 1
  const mid = values.length % 2 ? values[m] : (values[m - 1] + values[m]) / 2
  return {
    mid: nicePrice({ amount: mid, currency }),
    min: { amount: values[0], currency },
    max: { amount: values[values.length - 1], currency },
    lots: values.length,
    ...(honest.instant.min ? { instant: honest.instant.min } : {}),
    ...(honest.person.min ? { person: honest.person.min } : {})
  }
}

/** Валюты обмена PoE2 по старшинству «базы»: курса между ними нет — цену берём в первой, где есть предложения. */
const BULK_BASE = ['exalted', 'chaos', 'divine']

/**
 * Предложения обмена trade2 приходят в разных валютах (main сортирует по числу, не зная курсов: «1 div» оказался бы
 * «дешевле» «2 ex»). Опорная валюта — exalted, нет — chaos, divine, иначе валюта первого; её предложения — первыми
 * (дешевле за штуку — выше), остальные — следом в порядке main.
 */
export function orderBulkOffers(offers: readonly Poe1ExchangeOffer[]): Poe1ExchangeOffer[] {
  if (!offers.length) return []
  const base = BULK_BASE.find((c) => offers.some((o) => o.currency === c)) ?? offers[0].currency
  const each = (o: Poe1ExchangeOffer): number => (o.itemAmount > 0 ? o.exchangeAmount / o.itemAmount : Infinity)
  const main = offers.filter((o) => o.currency === base).sort((a, b) => each(a) - each(b))
  return [...main, ...offers.filter((o) => o.currency !== base)]
}
