// POETH (S15): вердикт окна цены — одна строка для новичка «что делать с предметом» над списком цен.
//
//   none     — таких никто не продаёт (0 лотов): снять часть галочек, а не «ничего не стоит»;
//   valuable — ценная вещь (≥ 1 div по курсу, или дорого при малом числе лотов / большом разбросе);
//   few      — мало данных (точность ≤ 1): цена — только ориентир;
//   junk     — хлам (< 1 chaos при достаточной точности): продать торговцу в городе;
//   cheap    — то же для валюты, карточек и опта: торговцу не продают, копят и продают пачкой;
//   list     — «выставьте за ~X»: самый дешёвый честный лот (группы «честной цены», без приманок).
//
// Рекомендованная цена округляется до понятных чисел, от 1 div (по курсу плашки в шапке) — в divine.
// Заметка цены `~price X chaos` — то, что игрок сам вставляет в заметку предмета в игре (одинаково для
// EN и RU клиента: игра пишет и показывает `~price`/`~b/o` без перевода, десятичная точка). Чистый TS.

import { ItemCategory, type ParsedItem } from '../parser'
import { toChaos } from './currency'
import { confidenceOf, type HonestPrice, type Poe1Listing, type Poe1Price } from './results'

export type VerdictKind = 'none' | 'valuable' | 'few' | 'junk' | 'cheap' | 'list'
/** почему «ценная вещь»: дорого и лотов мало / цены сильно разные / дороже 1 div */
export type ValuableReason = 'few' | 'spread' | 'div'

/** дешевле — «хлам» (chaos) */
export const JUNK_CHAOS = 1
/** точность ≤ этой — «мало данных» */
export const FEW_CONFIDENCE = 1
/** от стольких divine — «ценная вещь» */
export const VALUABLE_DIVINE = 1
/** «дорого» для правил малого числа лотов и разброса (chaos) */
export const EXPENSIVE_CHAOS = 50
/** дорогой предмет при точности ≤ этой — «ценная вещь: похожих мало» */
export const EXPENSIVE_FEW_CONFIDENCE = 2
/** разброс: верхняя четверть цен в столько раз дороже самой дешёвой */
export const SPREAD_RATIO = 3
/** для разброса нужно хотя бы столько лотов с ценой */
export const SPREAD_MIN_LOTS = 4
/** заметку цены предлагаем скопировать только при такой точности */
export const NOTE_MIN_CONFIDENCE = 2

export interface Verdict {
  kind: VerdictKind
  reason?: ValuableReason
  /** рекомендованная цена (округлённая): chaos, от 1 div по курсу — divine */
  price?: Poe1Price
  /** chaos-эквивалент рекомендованной цены, если он известен */
  chaos?: number
  /** сколько похожих нашёл сайт */
  count: number
  confidence: number
  /** разброс цен (для «ценная вещь: цены сильно разные») */
  range?: { min: Poe1Price; max: Poe1Price }
  /** текст заметки цены для буфера обмена; нет — кнопки «Скопировать заметку цены» нет */
  note?: string
}

export type VerdictInput =
  | {
      kind: 'trade'
      total: number
      listings: readonly Poe1Listing[]
      honest: HonestPrice
      chaosPerDivine?: number
      /** валюта, карточки, стопки: «продайте торговцу» не говорим */
      noVendor: boolean
    }
  | {
      kind: 'bulk'
      total: number
      /** цена за 1 шт. у лучшего предложения обмена */
      each?: Poe1Price
      chaosPerDivine?: number
    }

/** Предметы, которые торговцу не продают: валюта, карточки, всё, что лежит стопкой. */
export function noVendor(item: Pick<ParsedItem, 'category' | 'stackSize'>): boolean {
  return (
    item.stackSize != null || item.category === ItemCategory.Currency || item.category === ItemCategory.DivinationCard
  )
}

// ---------------------------------------------------------------- округление

function step(v: number, s: number): number {
  return Math.round(v / s) * s
}

/** chaos: до 1 — десятые, до 20 — целые, до 100 — по 5, до 1000 — по 10, дальше — по 50. */
export function niceChaos(v: number): number {
  if (!(v > 0)) return 0
  if (v < 1) return Math.max(0.1, Math.round(v * 10) / 10)
  if (v < 20) return Math.max(1, Math.round(v))
  if (v < 100) return step(v, 5)
  if (v < 1000) return step(v, 10)
  return step(v, 50)
}

/** divine: до 3 — десятые, до 10 — по 0.5, до 100 — целые, дальше — по 5. */
export function niceDivine(v: number): number {
  if (!(v > 0)) return 0
  if (v < 3) return Math.max(0.1, Math.round(v * 10) / 10)
  if (v < 10) return step(v, 0.5)
  if (v < 100) return Math.round(v)
  return step(v, 5)
}

/** Цена для показа: по chaos-эквиваленту (от 1 div — в divine), иначе — в своей валюте. */
export function displayPrice(ref: Poe1Price, chaos: number | undefined, chaosPerDivine: number | undefined): Poe1Price {
  if (chaos != null) {
    if (chaosPerDivine && chaosPerDivine > 0 && chaos >= chaosPerDivine * VALUABLE_DIVINE) {
      return { amount: niceDivine(chaos / chaosPerDivine), currency: 'divine' }
    }
    return { amount: niceChaos(chaos), currency: 'chaos' }
  }
  if (ref.currency === 'divine') return { amount: niceDivine(ref.amount), currency: 'divine' }
  return { amount: niceChaos(ref.amount), currency: ref.currency }
}

/** Заметка цены для игры: `~price 25 chaos`, `~price 1.5 divine` (точка, без лишних нулей). */
export function priceNote(p: Poe1Price): string {
  const amount = String(Math.round(p.amount * 100) / 100)
  return `~price ${amount} ${p.currency}`
}

// ---------------------------------------------------------------- цена

/** Самый дешёвый честный лот: меньший из минимумов двух групп (без приманок). */
export function referencePrice(h: HonestPrice, chaosPerDivine?: number): Poe1Price | undefined {
  const [a, b] = [h.instant.min, h.person.min].filter((p): p is Poe1Price => p != null)
  if (!a || !b) return a
  const ca = toChaos(a, chaosPerDivine)
  const cb = toChaos(b, chaosPerDivine)
  if (ca != null && cb != null) return ca <= cb ? a : b
  if (a.currency === b.currency) return a.amount <= b.amount ? a : b
  // разные валюты без курса: мгновенный выкуп — цена, по которой точно покупают
  return a
}

/** Разброс цен лотов без приманок: верхняя четверть / самый дешёвый (chaos-эквивалент). */
export function priceSpread(
  listings: readonly Poe1Listing[],
  honest: HonestPrice,
  chaosPerDivine?: number
): { ratio: number; min: number; max: number } | undefined {
  const skip = new Set([...honest.instant.outliers, ...honest.person.outliers])
  const values = listings
    .filter((l) => !skip.has(l.id) && l.price && l.price.amount > 0)
    .map((l) => toChaos(l.price!, chaosPerDivine))
    .filter((v): v is number => v != null)
    .sort((x, y) => x - y)
  if (values.length < SPREAD_MIN_LOTS) return undefined
  const min = values[0]
  const max = values[Math.floor((values.length - 1) * 0.75)]
  return { ratio: max / min, min, max }
}

// ---------------------------------------------------------------- вердикт

export function priceVerdict(input: VerdictInput): Verdict {
  const rate = input.chaosPerDivine
  if (input.kind === 'bulk') {
    const confidence = input.each ? confidenceOf(input.total) : 0
    if (!input.each) return { kind: 'none', count: 0, confidence }
    const chaos = toChaos(input.each, rate)
    const price = displayPrice(input.each, chaos, rate)
    const base = { price, chaos, count: input.total, confidence }
    // опт — это валюта, карточки, карты: «ценная вещь — проверьте свойства» не к месту, заметку не даём
    if (confidence <= FEW_CONFIDENCE) return { kind: 'few', ...base }
    if (chaos != null && chaos < JUNK_CHAOS) return { kind: 'cheap', ...base }
    return { kind: 'list', ...base }
  }

  const { honest, total, listings } = input
  const priced = honest.instant.count + honest.person.count
  if (total <= 0 && priced === 0) return { kind: 'none', count: 0, confidence: 0 }
  const confidence = honest.confidence
  const count = Math.max(total, priced)
  const ref = referencePrice(honest, rate)
  // лоты есть, но без цены — судить не по чему
  if (!ref) return { kind: 'few', count, confidence }

  const chaos = toChaos(ref, rate)
  const price = displayPrice(ref, chaos, rate)
  const note = confidence >= NOTE_MIN_CONFIDENCE ? priceNote(price) : undefined
  const base = { price, chaos, count, confidence }

  const isDiv = chaos != null && rate ? chaos >= rate * VALUABLE_DIVINE : ref.currency === 'divine' && ref.amount >= VALUABLE_DIVINE
  const expensive = isDiv || (chaos != null && chaos >= EXPENSIVE_CHAOS)
  if (expensive) {
    if (confidence <= EXPENSIVE_FEW_CONFIDENCE) return { kind: 'valuable', reason: 'few', ...base, note }
    const spread = priceSpread(listings, honest, rate)
    if (spread && spread.ratio >= SPREAD_RATIO) {
      return {
        kind: 'valuable',
        reason: 'spread',
        ...base,
        note,
        range: { min: displayPrice({ amount: spread.min, currency: 'chaos' }, spread.min, rate), max: displayPrice({ amount: spread.max, currency: 'chaos' }, spread.max, rate) }
      }
    }
    if (isDiv) return { kind: 'valuable', reason: 'div', ...base, note }
  }
  if (confidence <= FEW_CONFIDENCE) return { kind: 'few', ...base }
  if (chaos != null && chaos < JUNK_CHAOS) return { kind: input.noVendor ? 'cheap' : 'junk', ...base }
  return { kind: 'list', ...base, note }
}
