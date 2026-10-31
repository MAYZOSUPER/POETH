// POETH (S61): режим «Продаю» окна цены PoE 2 — какую цену поставить своей вещи в мерчант-вкладку. Логика S50
// (shared/poe1/pricecheck/selling.ts), но база PoE 2 — exalted, дорогое — divine (курс — фид обмена GGG, ange.ts):
//
//  - лестница мгновенных лотов (лоты с комиссией `fee` в золоте) без приманок: самый дешёвый, 5-й, медиана;
//  - «поставьте ~P, не дешевле N»: N — честная цена выкупа (из ≥ 4 лотов — вторая по дешевизне, как вердикт PoE 2:
//    одиночный дешёвый лот не считаем), P — середина пяти самых дешёвых мгновенных (3-й по цене);
//  - мгновенных меньше пяти — «мало лотов, цена — ориентир»; нет совсем — ориентир по лотам «лично» (whisper);
//  - заметка `~price`/`~b/o` из текста предмета (парсер PoE 2 кладёт её в item.note): заметно дешевле N — «вы
//    продаёте дешевле рынка на ~X%»;
//  - валюта и всё, что меняют у Ange, — по цене обмена за час: «~P за 1 шт., не дешевле нижней сделки часа».
//
// Одна строка — одна единица: от 1 div по курсу — divine, ниже — exalted; без курса — валюта лотов. Число для буфера —
// без валюты, с точкой. Чистый TS; tests/poe2/selling.test.ts.

import type { HonestPrice, Poe1Listing, Poe1ListingKind, Poe1Price } from '../../poe1/pricecheck/results'
import { copyNumber, sellAmount, type NoteCheck, type SaleNote, type SellAdvice, type SellKind, type SellLadder } from '../../poe1/pricecheck/selling'
import type { AngeBase, AngePrice } from './ange'
import { roundDivine2, toExalted, unitFor2, type ExaltedRates } from './currency'
import { FAIR_MIN_LOTS, JUNK_EXALTED, SPREAD_MIN_LOTS, SPREAD_RATIO } from './verdict'

export type { NoteCheck, SaleNote, SellAdvice, SellKind, SellLadder }

/** столько мгновенных лотов — уверенная рекомендация (есть «5-й»); P — середина стольких самых дешёвых */
export const SELL_MIN_INSTANT = 5
/** заметка дешевле «не дешевле N» на эту долю и больше — «продаёте дешевле рынка» */
export const UNDER_RATIO = 0.2
/** заметка дороже рекомендованной цены во столько раз — «может долго не продаваться» */
export const OVER_RATIO = 1.5

// ---------------------------------------------------------------- заметка цены

const NUM = String.raw`(\d*\.?\d+)`
const NOTE_PRICE = new RegExp(String.raw`^~(?:price|b\/o)\s+${NUM}(?:\/${NUM})?\s+([a-z][\w-]*)$`, 'i')

/**
 * Заметка цены PoE 2 (item.note — строка после «Note: » / «Примечание: », её читает парсер по строкам клиента):
 * `~price 5 exalted`, `~b/o 1/2 divine`. Игра пишет `~price`/`~b/o` и тег валюты без перевода на обоих клиентах.
 */
export function poe2SaleNote(note: string | undefined): SaleNote | undefined {
  const text = note?.trim()
  if (!text) return undefined
  const m = NOTE_PRICE.exec(text)
  if (!m) return undefined
  const amount = Number(m[1]) / (m[2] ? Number(m[2]) : 1)
  if (!(amount > 0) || !Number.isFinite(amount)) return undefined
  return { price: { amount, currency: m[3].toLowerCase() }, text }
}

// ---------------------------------------------------------------- шкала

/** В чём считаем лоты: exalted (курс известен) или валюта самого дешёвого лота. */
type Scale = { ex: true; rate?: number } | { ex: false; currency: string }

interface Valued {
  l: Poe1Listing
  v: number
}

function valuedLots(
  listings: readonly Poe1Listing[],
  honest: HonestPrice,
  kind: Poe1ListingKind,
  rates: ExaltedRates | undefined
): { lots: Valued[]; scale?: Scale } {
  const skip = new Set([...honest.instant.outliers, ...honest.person.outliers])
  const priced = listings.filter((l) => l.kind === kind && !skip.has(l.id) && l.price != null && l.price.amount > 0)
  if (!priced.length) return { lots: [] }
  const inEx = rates
    ? priced.flatMap((l) => {
        const v = toExalted(l.price!, rates)
        return v != null ? [{ l, v }] : []
      })
    : []
  if (inEx.length) return { lots: inEx.sort((a, b) => a.v - b.v), scale: { ex: true, rate: rates?.divine } }
  const currency = priced[0].price!.currency
  const lots = priced.filter((l) => l.price!.currency === currency).map((l) => ({ l, v: l.price!.amount }))
  return { lots: lots.sort((a, b) => a.v - b.v), scale: { ex: false, currency } }
}

/** Цена в единице показа: exalted → divine от 1 div по курсу; без курса — валюта лотов как есть. */
function shown(v: number, unit: string, scale: Scale): Poe1Price {
  if (scale.ex && unit === 'divine' && scale.rate) return { amount: sellAmount(v / scale.rate, 'divine'), currency: 'divine' }
  return { amount: sellAmount(v, unit), currency: unit }
}

/** Обратно в единицы сравнения — для места в очереди по округлённой цене. */
function backToScale(p: Poe1Price, scale: Scale): number {
  return scale.ex && p.currency === 'divine' && scale.rate ? p.amount * scale.rate : p.amount
}

/** Место цены среди лотов: 1 — дешевле всех (лоты с такой же ценой не обгоняют). */
function placeOf(v: number, values: readonly number[]): number {
  return 1 + values.filter((x) => x < v - 1e-9).length
}

// ---------------------------------------------------------------- «Продаю»: лоты сайта

export interface SellInput2 {
  listings: readonly Poe1Listing[]
  honest: HonestPrice
  /** сколько похожих нашёл сайт */
  total: number
  /** exalted за 1 шт. валют лотов (exaltedRates); нет — в валюте лотов */
  rates?: ExaltedRates
  /** валюта, стопки — «продайте торговцу» не говорим */
  noVendor: boolean
  /** поиск уже только по мгновенному выкупу (статус «Продавцы») */
  instantOnly?: boolean
  caution?: boolean
  note?: SaleNote
}

function checkNote(note: SaleNote, p: number, floor: number, values: readonly number[], scale: Scale, rates?: ExaltedRates): NoteCheck {
  const v = scale.ex ? toExalted(note.price, rates) : note.price.currency === scale.currency ? note.price.amount : undefined
  if (v == null) return { note, status: 'unknown' }
  const place = placeOf(v, values)
  if (v < floor * (1 - UNDER_RATIO)) return { note, status: 'under', percent: Math.round((1 - v / p) * 100), place }
  if (v > p * OVER_RATIO) return { note, status: 'over', place }
  return { note, status: 'fair', place }
}

export function sellAdvice2(input: SellInput2): SellAdvice {
  const { listings, honest, total, rates } = input
  const instant = valuedLots(listings, honest, 'instant', rates)
  const n = instant.lots.length
  const caution = input.caution ? { caution: true } : {}

  const person = n ? undefined : valuedLots(listings, honest, 'person', rates)
  const basis = n ? instant : person!
  const scale = basis.scale
  if (!scale || !basis.lots.length) return { kind: 'none', basis: n ? 'instant' : 'person', ladder: { count: 0 }, lots: 0, ...caution }

  const values = basis.lots.map((x) => x.v)
  const m = values.length
  // P: середина пяти самых дешёвых (3-й по цене); лотов меньше — нижняя середина того, что есть
  const pV = values[(Math.min(m, SELL_MIN_INSTANT) - 1) >> 1]
  const unit = scale.ex ? unitFor2(pV, scale.rate) : scale.currency
  // N: честная цена выкупа — из ≥ 4 лотов вторая по дешевизне (одиночный дешёвый не считаем, приманку уже отсеяли)
  const baited = n > 0 && honest.instant.outliers.length > 0
  const floorV = n >= FAIR_MIN_LOTS && !baited ? Math.min(values[1], pV) : values[0]
  const price = shown(pV, unit, scale)
  const floor = shown(floorV, unit, scale)
  const pRounded = backToScale(price, scale)
  const ex = scale.ex ? pRounded : undefined

  const ladderOf = (): SellLadder => {
    const at = (i: number): Poe1Price | undefined => (instant.lots[i] ? shown(instant.lots[i].v, unit, scale) : undefined)
    if (!n) return { count: 0 }
    return {
      count: n,
      cheapest: at(0),
      ...(n >= SELL_MIN_INSTANT ? { fifth: at(SELL_MIN_INSTANT - 1) } : {}),
      median: at((n - 1) >> 1)
    }
  }

  let kind: SellKind = !n ? 'whisper' : n < SELL_MIN_INSTANT ? 'few' : 'ok'
  if (ex != null && ex < JUNK_EXALTED) kind = input.noVendor ? 'cheap' : 'junk'

  // комиссия в золоте — у мгновенного лота с ценой ближе всего к P
  const withFee = instant.lots.filter((x) => x.l.fee != null)
  const nearest = withFee.reduce<Valued | undefined>((best, x) => (!best || Math.abs(x.v - pV) < Math.abs(best.v - pV) ? x : best), undefined)
  const q3 = n >= SPREAD_MIN_LOTS ? instant.lots[Math.floor((n - 1) * 0.75)].v / instant.lots[0].v : 0

  return {
    kind,
    basis: n ? 'instant' : 'person',
    ladder: ladderOf(),
    price,
    floor,
    // поле chaos у типа S50 — здесь exalted-эквивалент P (для порога «хлам»)
    ...(ex != null ? { chaos: ex } : {}),
    place: placeOf(pRounded, values),
    lots: m,
    copy: copyNumber(price.amount),
    ...(nearest?.l.fee != null ? { fee: nearest.l.fee } : {}),
    ...(q3 >= SPREAD_RATIO ? { spread: true } : {}),
    ...(n < SELL_MIN_INSTANT && !input.instantOnly && total > listings.length ? { moreInstant: true } : {}),
    ...caution,
    ...(input.note ? { note: checkNote(input.note, pRounded, backToScale(floor, scale), values, scale, rates) } : {})
  }
}

// ---------------------------------------------------------------- «Продаю»: обмен у Ange

export interface AngeSell {
  /** few — мало сделок за час или данные не за последний час */
  kind: 'ok' | 'few'
  /** валюта главного рынка */
  base: AngeBase
  /** «~P за 1 шт.» — средняя цена сделок часа, в валюте главного рынка */
  price: Poe1Price
  /** «не дешевле» — нижняя сделка часа */
  floor: Poe1Price
  /** верхняя сделка часа */
  top: Poe1Price
  /** exalted за 1 шт. */
  exalted: number
  /** число для буфера (цена 1 шт. от 1 базы) */
  copy?: string
  /** дешевле 1 базы за штуку: сколько штук отдать за 1 базу (в окне обмена задают соотношение) */
  perBase?: number
  note?: NoteCheck
}

/** Цена обмена в валюте рынка: divine — сотые, exalted/chaos — как exaltedIn (меньше 1 — сотые). */
function inBase(v: number, base: AngeBase): number {
  if (base === 'divine') return roundDivine2(v)
  return v < 1 ? Math.max(0.01, Math.round(v * 100) / 100) : v < 10 ? Math.round(v * 10) / 10 : Math.round(v)
}

export function angeSell(a: AngePrice, confidence: number, note?: SaleNote): AngeSell {
  const { base, each, lo, hi } = a.main
  const at = (v: number): Poe1Price => ({ amount: inBase(v, base), currency: base })
  const price = at(each)
  const toEx = base === 'exalted' ? 1 : base === 'divine' ? a.exaltedPerDivine : (a.exaltedPerChaos ?? 0)
  const out: AngeSell = {
    kind: a.low || confidence <= 1 ? 'few' : 'ok',
    base,
    price,
    floor: at(lo),
    top: at(hi),
    exalted: a.exalted,
    ...(each >= 1 ? { copy: copyNumber(price.amount) } : { perBase: Math.round(1 / each) })
  }
  if (note && toEx > 0) {
    const rates = { exalted: 1, divine: a.exaltedPerDivine, ...(a.exaltedPerChaos ? { chaos: a.exaltedPerChaos } : {}) }
    const c = checkNote(note, each * toEx, lo * toEx, [], { ex: true, rate: a.exaltedPerDivine }, rates)
    out.note = { note: c.note, status: c.status, ...(c.percent != null ? { percent: c.percent } : {}) }
  }
  return out
}
