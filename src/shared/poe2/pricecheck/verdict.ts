// POETH (S47): вердикт окна цены PoE2 — та же строка «что делать с предметом», что у PoE1 (shared/poe1/pricecheck/
// verdict.ts, те же виды и тексты), но у PoE2 своя экономика: базовая валюта — exalted, дорогая — divine, а chaos
// стоит дороже exalted.
//   none     — 0 лотов;
//   valuable — от 1 divine, или дорого (≥ EXPENSIVE_EXALTED ex) при малом числе лотов / большом разбросе;
//   few      — мало данных (точность ≤ 1);
//   junk     — меньше 1 exalted: продать торговцу (валюте и стопкам — cheap: копить и продавать пачкой);
//   list     — «выставьте за ~X»: честная цена (см. fairPrice2).
//
// S61: курс exalted ↔ divine ↔ chaos по фиду обмена GGG и «цена у Ange» для прочих валют лотов (`rates`, exalted за
// 1 шт.) — цены в разных валютах сравниваются в exalted, показываются в одной единице (от 1 div — divine). Курса нет —
// как в S47: сравнение только в одной валюте, прочие валюты — как есть (1 сфера превращения/усиления — «хлам»).
// Честная цена (§7.1 исследования, как «живая цена» poe2pricer): из ≥ FAIR_MIN_LOTS лотов выкупа (мерчант, за золото)
// берём вторую по дешевизне — одиночный дешёвый лот (приманка, ошибка продавца) не считаем; если явную приманку
// (дешевле половины следующих) уже отсеяла «честная цена» S4 — самую дешёвую из оставшихся. Лотов выкупа меньше —
// как в S47: самый дешёвый честный лот обеих групп. Валюта у Ange — kind 'exchange' (как S24 у PoE 1). Чистый TS.

import {
  confidenceOf,
  MARKET_WINDOW,
  type HonestPrice,
  type MarketPrice,
  type Poe1ExchangeOffer,
  type Poe1Listing,
  type Poe1Price
} from '../../poe1/pricecheck/results'
import { niceChaos, niceDivine, priceNote, type Verdict } from '../../poe1/pricecheck/verdict'
import { exaltedIn, toExalted, unitFor2, type ExaltedRates, type Poe2Unit } from './currency'

/** дешевле — «хлам» (exalted) */
export const JUNK_EXALTED = 1
export const FEW_CONFIDENCE = 1
/** «дорого» для правил малого числа лотов и разброса (exalted) */
export const EXPENSIVE_EXALTED = 50
export const EXPENSIVE_FEW_CONFIDENCE = 2
export const SPREAD_RATIO = 3
export const SPREAD_MIN_LOTS = 4
export const NOTE_MIN_CONFIDENCE = 2
/** S61: от стольких лотов выкупа честная цена — вторая по дешевизне */
export const FAIR_MIN_LOTS = 4
/** самые дешёвые сферы PoE2: одна такая — заведомо меньше 1 exalted */
export const BELOW_EXALTED: ReadonlySet<string> = new Set(['transmute', 'aug'])

/** Вердикт PoE 2: те же поля, что у PoE 1, + цена в exalted и правило честной цены (для «Почему такая цена?»). */
export type Verdict2 = Verdict & {
  /** exalted-эквивалент рекомендованной цены (курс известен) */
  exalted?: number
  /** second — вторая по дешевизне из ≥ 4 лотов выкупа; cheapest — самый дешёвый честный лот */
  fair?: FairRule
  /** сколько лотов выкупа было (для пояснения правила) */
  fairLots?: number
}

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
      /** S61: exalted за 1 шт. валют лотов (exaltedRates); нет — сравнение в одной валюте */
      rates?: ExaltedRates
    }
  | {
      kind: 'bulk'
      total: number
      /** цена за 1 шт. у лучшего предложения обмена */
      each?: Poe1Price
      rates?: ExaltedRates
    }
  | {
      /** S61: цена у Ange (фид обмена GGG) */
      kind: 'exchange'
      /** exalted за 1 шт. */
      exalted: number
      /** точность 0…4 (angeConfidence) */
      confidence: number
      /** штук за час — «сколько похожих» для текста */
      volume: number
      exaltedPerDivine?: number
      /** единица цены — как у главной строки блока «у Ange»; нет — по уровню цены */
      unit?: Poe2Unit
    }

/** Округление как у PoE1: divine — niceDivine, остальные — по шкале chaos (до 1 — сотые, до 20 — целые…). */
export function nicePrice(p: Poe1Price): Poe1Price {
  return { amount: p.currency === 'divine' ? niceDivine(p.amount) : niceChaos(p.amount), currency: p.currency }
}

/** Цена для показа по exalted-эквиваленту: от 1 div — divine, ниже — exalted (понятные числа). */
export function displayPrice2(exalted: number, exaltedPerDivine: number | undefined): Poe1Price {
  if (unitFor2(exalted, exaltedPerDivine) === 'divine') return { amount: niceDivine(exalted / exaltedPerDivine!), currency: 'divine' }
  return { amount: niceChaos(exalted), currency: 'exalted' }
}

/** Значение цены для сравнения: exalted по курсам, без курсов — только в валюте `base`. */
function valueOf(p: Poe1Price, base: string, rates?: ExaltedRates): number | undefined {
  if (rates) return toExalted(p, rates)
  return p.currency === base ? p.amount : undefined
}

// ---------------------------------------------------------------- честная цена

export type FairRule = 'second' | 'cheapest'

export interface FairRef {
  /** лот, чья цена — честная (в своей валюте) */
  price: Poe1Price
  /** exalted-эквивалент (курсы известны) */
  exalted?: number
  rule: FairRule
  /** лотов выкупа с ценой (для правила «вторая из ≥ 4») */
  lots: number
}

/** Самый дешёвый честный лот двух групп (S47): по exalted, если курсы есть; иначе в одной валюте или выкуп. */
function cheapestHonest(h: HonestPrice, rates?: ExaltedRates): Poe1Price | undefined {
  const [a, b] = [h.instant.min, h.person.min].filter((p): p is Poe1Price => p != null)
  if (!a || !b) return a
  const ea = rates ? toExalted(a, rates) : undefined
  const eb = rates ? toExalted(b, rates) : undefined
  if (ea != null && eb != null) return ea <= eb ? a : b
  if (a.currency === b.currency) return a.amount <= b.amount ? a : b
  // разные валюты без курса: мгновенный выкуп — цена, по которой точно покупают
  return a
}

/**
 * Честная цена PoE 2: из ≥ FAIR_MIN_LOTS лотов выкупа — вторая по дешевизне (одиночный дешёвый лот не считаем;
 * если честная цена S4 уже отсеяла приманку — самая дешёвая из оставшихся). Иначе — самый дешёвый честный лот обеих
 * групп. Лоты в валютах без курса (или, без курсов, не в валюте самого дешёвого лота выкупа) не считаются.
 */
export function fairPrice2(listings: readonly Poe1Listing[], honest: HonestPrice, rates?: ExaltedRates): FairRef | undefined {
  const instant = listings.filter((l): l is Poe1Listing & { price: Poe1Price } => l.kind === 'instant' && l.price != null && l.price.amount > 0)
  if (instant.length >= FAIR_MIN_LOTS) {
    const base = instant[0].price.currency
    const valued = instant
      .flatMap((l) => {
        const v = valueOf(l.price, base, rates)
        return v != null ? [{ l, v }] : []
      })
      .sort((x, y) => x.v - y.v)
    if (valued.length >= FAIR_MIN_LOTS) {
      const out = new Set(honest.instant.outliers)
      const kept = valued.filter((x) => !out.has(x.l.id))
      const baited = kept.length < valued.length
      const pick = kept[Math.min(kept.length - 1, baited ? 0 : 1)]
      if (pick) {
        return {
          price: pick.l.price,
          ...(rates ? { exalted: pick.v } : {}),
          rule: baited ? 'cheapest' : 'second',
          lots: valued.length
        }
      }
    }
  }
  const ref = cheapestHonest(honest, rates)
  if (!ref) return undefined
  const ex = rates ? toExalted(ref, rates) : undefined
  return { price: ref, ...(ex != null ? { exalted: ex } : {}), rule: 'cheapest', lots: instant.length }
}

/** Разброс без приманок: верхняя четверть / самый дешёвый (в exalted или в валюте самого дешёвого). */
function spreadOf(
  listings: readonly Poe1Listing[],
  honest: HonestPrice,
  base: string,
  rates?: ExaltedRates
): { ratio: number; min: number; max: number } | undefined {
  const skip = new Set([...honest.instant.outliers, ...honest.person.outliers])
  const values = listings
    .filter((l) => !skip.has(l.id) && l.price && l.price.amount > 0)
    .map((l) => valueOf(l.price!, base, rates))
    .filter((v): v is number => v != null)
    .sort((a, b) => a - b)
  if (values.length < SPREAD_MIN_LOTS) return undefined
  const min = values[0]
  const max = values[Math.floor((values.length - 1) * 0.75)]
  return { ratio: max / min, min, max }
}

// ---------------------------------------------------------------- вердикт

export function poe2Verdict(input: Poe2VerdictInput): Verdict2 {
  if (input.kind === 'exchange') {
    const { exalted, confidence, volume, exaltedPerDivine } = input
    // цена обмена точная: в единице главного рынка (как в блоке «у Ange»)
    const price = exaltedIn(exalted, input.unit ?? unitFor2(exalted, exaltedPerDivine), exaltedPerDivine)
    const base = { price, exalted, count: volume, confidence }
    if (confidence <= FEW_CONFIDENCE) return { kind: 'few', ...base }
    if (exalted < JUNK_EXALTED) return { kind: 'cheap', ...base }
    return { kind: 'list', ...base }
  }

  if (input.kind === 'bulk') {
    const confidence = input.each ? confidenceOf(input.total) : 0
    if (!input.each) return { kind: 'none', count: 0, confidence }
    const ex = input.rates ? toExalted(input.each, input.rates) : undefined
    const price = ex != null ? displayPrice2(ex, input.rates?.divine) : nicePrice(input.each)
    const base = { price, ...(ex != null ? { exalted: ex } : {}), count: input.total, confidence }
    if (confidence <= FEW_CONFIDENCE) return { kind: 'few', ...base }
    if (ex != null ? ex < JUNK_EXALTED : belowOneExalted(input.each)) return { kind: 'cheap', ...base }
    return { kind: 'list', ...base }
  }

  const { honest, total, listings, rates } = input
  const priced = honest.instant.count + honest.person.count
  if (total <= 0 && priced === 0) return { kind: 'none', count: 0, confidence: 0 }
  const confidence = honest.confidence
  const count = Math.max(total, priced)
  const fair = fairPrice2(listings, honest, rates)
  if (!fair) return { kind: 'few', count, confidence }

  const ref = fair.price
  const ex = fair.exalted
  const rate = rates?.divine
  const price = ex != null ? displayPrice2(ex, rate) : nicePrice(ref)
  const note = confidence >= NOTE_MIN_CONFIDENCE ? priceNote(price) : undefined
  const base = { price, ...(ex != null ? { exalted: ex } : {}), count, confidence, fair: fair.rule, fairLots: fair.lots }
  const isDiv = ex != null && rate ? ex >= rate : ref.currency === 'divine' && ref.amount >= 1
  const expensive = isDiv || (ex != null ? ex >= EXPENSIVE_EXALTED : ref.currency === 'exalted' && ref.amount >= EXPENSIVE_EXALTED)
  if (expensive) {
    if (confidence <= EXPENSIVE_FEW_CONFIDENCE) return { kind: 'valuable', reason: 'few', ...base, note }
    const spread = spreadOf(listings, honest, ref.currency, rates)
    if (spread && spread.ratio >= SPREAD_RATIO) {
      const shown = (v: number): Poe1Price => (rates ? displayPrice2(v, rate) : nicePrice({ amount: v, currency: ref.currency }))
      return { kind: 'valuable', reason: 'spread', ...base, note, range: { min: shown(spread.min), max: shown(spread.max) } }
    }
    if (isDiv) return { kind: 'valuable', reason: 'div', ...base, note }
  }
  if (confidence <= FEW_CONFIDENCE) return { kind: 'few', ...base }
  if (ex != null ? ex < JUNK_EXALTED : belowOneExalted(ref)) return { kind: input.noVendor ? 'cheap' : 'junk', ...base }
  return { kind: 'list', ...base, note }
}

// ---------------------------------------------------------------- цена на рынке

/** «Цена на рынке» PoE 2: числа уже в единице показа; `exalted` — середина в exalted (курс известен). */
export type MarketPrice2 = MarketPrice & { exalted?: number; unit?: Poe2Unit }

/**
 * «Цена на рынке» PoE2: середина самых дешёвых честных лотов (без приманок). Курсы есть — все лоты в exalted
 * (валюты без курса не считаем), строка — в одной единице (от 1 div — divine); нет — в валюте самого дешёвого лота,
 * лоты в других валютах не считаем (как S47).
 */
export function poe2MarketPrice(listings: readonly Poe1Listing[], honest: HonestPrice, rates?: ExaltedRates): MarketPrice2 | undefined {
  const skip = new Set([...honest.instant.outliers, ...honest.person.outliers])
  const priced = listings.filter((l): l is Poe1Listing & { price: Poe1Price } => !skip.has(l.id) && l.price != null && l.price.amount > 0)
  if (!priced.length) return undefined
  const inEx = rates ? priced.map((l) => toExalted(l.price, rates)).filter((v): v is number => v != null) : []
  const currency = priced[0].price.currency
  const values = (inEx.length ? inEx : priced.filter((l) => l.price.currency === currency).map((l) => l.price.amount))
    .sort((a, b) => a - b)
    .slice(0, MARKET_WINDOW)
  const m = values.length >> 1
  const mid = values.length % 2 ? values[m] : (values[m - 1] + values[m]) / 2
  const groups = {
    ...(honest.instant.min ? { instant: honest.instant.min } : {}),
    ...(honest.person.min ? { person: honest.person.min } : {})
  }
  if (inEx.length) {
    const rate = rates?.divine
    const unit = unitFor2(mid, rate)
    return {
      mid: displayPrice2(mid, rate),
      min: exaltedIn(values[0], unit, rate),
      max: exaltedIn(values[values.length - 1], unit, rate),
      lots: values.length,
      exalted: mid,
      unit,
      ...groups
    }
  }
  return {
    mid: nicePrice({ amount: mid, currency }),
    min: { amount: values[0], currency },
    max: { amount: values[values.length - 1], currency },
    lots: values.length,
    ...groups
  }
}

// ---------------------------------------------------------------- обмен trade2

/** Валюты обмена PoE2 по старшинству «базы»: курса между ними нет — цену берём в первой, где есть предложения. */
const BULK_BASE = ['exalted', 'chaos', 'divine']

/**
 * Предложения обмена trade2 приходят в разных валютах (main сортирует по числу, не зная курсов: «1 div» оказался бы
 * «дешевле» «2 ex»). S61: курсы есть — все предложения с известным курсом по цене за штуку в exalted, без курса — следом.
 * Курсов нет (S47) — опорная валюта exalted, нет — chaos, divine, иначе валюта первого; её предложения — первыми
 * (дешевле за штуку — выше), остальные — следом в порядке main.
 */
export function orderBulkOffers(offers: readonly Poe1ExchangeOffer[], rates?: ExaltedRates): Poe1ExchangeOffer[] {
  if (!offers.length) return []
  const each = (o: Poe1ExchangeOffer): number => (o.itemAmount > 0 ? o.exchangeAmount / o.itemAmount : Infinity)
  if (rates) {
    const ex = (o: Poe1ExchangeOffer): number | undefined => {
      const r = toExalted({ amount: each(o), currency: o.currency }, rates)
      return r != null && Number.isFinite(r) ? r : undefined
    }
    const known = offers.filter((o) => ex(o) !== undefined).sort((a, b) => ex(a)! - ex(b)!)
    if (known.length) return [...known, ...offers.filter((o) => ex(o) === undefined)]
  }
  const base = BULK_BASE.find((c) => offers.some((o) => o.currency === c)) ?? offers[0].currency
  const main = offers.filter((o) => o.currency === base).sort((a, b) => each(a) - each(b))
  return [...main, ...offers.filter((o) => o.currency !== base)]
}
