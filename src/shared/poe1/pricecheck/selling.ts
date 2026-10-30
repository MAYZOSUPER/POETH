// POETH (S50): режим «Продаю» окна цены — какую цену поставить своей вещи в мерчант-вкладку. Тот же поиск, что
// и для «Покупаю» (новых запросов нет), другой вывод:
//
//  - лестница мгновенных лотов (мерчант-вкладки — лоты с комиссией `fee` в золоте) без приманок: самый дешёвый,
//    5-й, медиана;
//  - «поставьте ~P, не дешевле N»: N — самый дешёвый честный мгновенный лот (так купят быстрее всего, дешевле
//    ставить незачем), P — 3-й по цене (середина пяти самых дешёвых: выгоднее, но придётся подождать);
//  - мгновенных меньше пяти — «мало лотов, цена — ориентир»; нет совсем — ориентир по лотам «лично» (whisper);
//  - заметка `~price`/`~b/o` из текста предмета: заметно дешевле N — «вы продаёте дешевле рынка на ~X%»;
//  - валюта и всё, что меняют у Фаустуса, — по цене обмена за час (S24): «~P за 1 шт., не дешевле нижней сделки».
//
// Одна строка — одна единица (как в S24): от 1 div по курсу — divine, ниже — chaos; без курсов — валюта лотов.
// Число для буфера — без валюты, с точкой (как в заметке цены). Чистый TS; tests/pricecheck/selling.test.ts.

import { EXTRA_STRINGS } from '../parser/extra-strings'
import { chaosIn, roundDivine, toChaos, unitFor, type ChaosRates } from './currency'
import type { FaustusBase, FaustusPrice } from './faustus'
import type { HonestPrice, Poe1Listing, Poe1ListingKind, Poe1Price } from './results'
import { JUNK_CHAOS, SPREAD_MIN_LOTS, SPREAD_RATIO } from './verdict'

/** столько мгновенных лотов — уверенная рекомендация (есть «5-й»); P — середина стольких самых дешёвых */
export const SELL_MIN_INSTANT = 5
/** заметка дешевле «не дешевле N» на эту долю и больше — «продаёте дешевле рынка» */
export const UNDER_RATIO = 0.2
/** заметка дороже рекомендованной цены во столько раз — «может долго не продаваться» */
export const OVER_RATIO = 1.5

// ---------------------------------------------------------------- заметка цены

export interface SaleNote {
  /** цена за 1 шт. (дробь `1/2` уже поделена) */
  price: Poe1Price
  /** как в игре: `~price 5 chaos` */
  text: string
}

const NOTE_PREFIXES = Object.values(EXTRA_STRINGS).map((s) => s.NOTE)
const NUM = String.raw`(\d*\.?\d+)`
const NOTE_PRICE = new RegExp(String.raw`^~(?:price|b\/o)\s+${NUM}(?:\/${NUM})?\s+([a-z][\w-]*)$`, 'i')

/**
 * Заметка цены из текста предмета (Ctrl+C): строка «Note: ~price 5 chaos» / «Примечание: ~b/o 1/2 divine».
 * Игра пишет `~price`/`~b/o` и тег валюты без перевода на обоих клиентах; заметка без цены (`~skip`, текст) — нет.
 */
export function saleNoteOf(text: string): SaleNote | undefined {
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    const prefix = NOTE_PREFIXES.find((p) => line.startsWith(p))
    if (!prefix) continue
    const note = line.slice(prefix.length).trim()
    const m = NOTE_PRICE.exec(note)
    if (!m) return undefined
    const amount = Number(m[1]) / (m[2] ? Number(m[2]) : 1)
    if (!(amount > 0) || !Number.isFinite(amount)) return undefined
    return { price: { amount, currency: m[3].toLowerCase() }, text: note }
  }
  return undefined
}

// ---------------------------------------------------------------- числа

/** Цена для игры: divine — десятые до 10, дальше целые; chaos и прочее — целые, меньше 1 — сотые. */
export function sellAmount(v: number, currency: string): number {
  if (!(v > 0)) return 0
  if (currency === 'divine') return v < 10 ? Math.max(0.1, Math.round(v * 10) / 10) : Math.round(v)
  return v < 1 ? Math.max(0.01, Math.round(v * 100) / 100) : Math.round(v)
}

/** Число для буфера: точка, без лишних нулей (`25`, `1.5`). */
export function copyNumber(amount: number): string {
  return String(Math.round(amount * 100) / 100)
}

/** В чём считаем лоты: chaos (курсы известны) или валюта самого дешёвого лота. */
type Scale = { chaos: true; rate?: number } | { chaos: false; currency: string }

interface Valued {
  l: Poe1Listing
  v: number
}

/** Лоты группы без приманок, по возрастанию цены в сравнимых единицах. */
function valuedLots(
  listings: readonly Poe1Listing[],
  honest: HonestPrice,
  kind: Poe1ListingKind,
  rate: number | undefined,
  rates: ChaosRates | undefined
): { lots: Valued[]; scale?: Scale } {
  const skip = new Set([...honest.instant.outliers, ...honest.person.outliers])
  const priced = listings.filter((l) => l.kind === kind && !skip.has(l.id) && l.price != null && l.price.amount > 0)
  if (!priced.length) return { lots: [] }
  const inChaos = priced.flatMap((l) => {
    const v = toChaos(l.price!, rate, rates)
    return v != null ? [{ l, v }] : []
  })
  if (inChaos.length) return { lots: inChaos.sort((a, b) => a.v - b.v), scale: { chaos: true, rate } }
  const currency = priced[0].price!.currency
  const lots = priced.filter((l) => l.price!.currency === currency).map((l) => ({ l, v: l.price!.amount }))
  return { lots: lots.sort((a, b) => a.v - b.v), scale: { chaos: false, currency } }
}

/** Цена в единице показа: chaos → divine от 1 div по курсу; без курсов — валюта лотов как есть. */
function shown(v: number, unit: string, scale: Scale): Poe1Price {
  if (scale.chaos && unit === 'divine' && scale.rate) return { amount: sellAmount(v / scale.rate, 'divine'), currency: 'divine' }
  return { amount: sellAmount(v, unit), currency: unit }
}

/** Обратно в единицы сравнения (chaos или валюта лотов) — для места в очереди по округлённой цене. */
function backToScale(p: Poe1Price, scale: Scale): number {
  return scale.chaos && p.currency === 'divine' && scale.rate ? p.amount * scale.rate : p.amount
}

/** Место цены среди лотов: 1 — дешевле всех (лоты с такой же ценой не обгоняют). */
function placeOf(v: number, values: readonly number[]): number {
  return 1 + values.filter((x) => x < v - 1e-9).length
}

// ---------------------------------------------------------------- «Продаю»: лоты сайта

export type SellKind = 'ok' | 'few' | 'whisper' | 'junk' | 'cheap' | 'none'

export interface SellLadder {
  /** мгновенных лотов в выдаче (без приманок) */
  count: number
  cheapest?: Poe1Price
  fifth?: Poe1Price
  median?: Poe1Price
}

export type NoteStatus = 'under' | 'fair' | 'over' | 'unknown'

export interface NoteCheck {
  note: SaleNote
  status: NoteStatus
  /** «дешевле рынка на ~X%» — от рекомендованной цены (status 'under') */
  percent?: number
  /** место заметки среди мгновенных лотов (или лотов «лично», если мгновенных нет) */
  place?: number
}

export interface SellAdvice {
  kind: SellKind
  /** по каким лотам рекомендация: мгновенный выкуп или «лично» (мгновенных нет) */
  basis: 'instant' | 'person'
  ladder: SellLadder
  /** «поставьте ~P» */
  price?: Poe1Price
  /** «не дешевле N» */
  floor?: Poe1Price
  /** chaos-эквивалент P (курсы известны) */
  chaos?: number
  /** место P среди лотов основы: 1 — первым в очереди */
  place?: number
  /** лотов основы (для «вы будете k-м из n») */
  lots: number
  /** число для буфера — P без валюты */
  copy?: string
  /** комиссия в золоте у мгновенного лота с ценой ближе всего к P (платит покупатель) */
  fee?: number
  /** цены мгновенных лотов сильно разные — сравните свойства */
  spread?: boolean
  /** мгновенных в выдаче мало, а похожих больше: «Продавцы» → «Только мгновенный выкуп» */
  moreInstant?: boolean
  /** выдача, похоже, про другой вариант предмета (сильные предупреждения S15) */
  caution?: boolean
  note?: NoteCheck
}

export interface SellInput {
  listings: readonly Poe1Listing[]
  honest: HonestPrice
  /** сколько похожих нашёл сайт */
  total: number
  chaosPerDivine?: number
  /** chaos за 1 шт. валют лотов (chaosRates: chaos, divine и прочие по обмену) */
  rates?: ChaosRates
  /** валюта, карточки, стопки — «продайте торговцу» не говорим */
  noVendor: boolean
  /** поиск уже только по мгновенному выкупу (статус «Продавцы») */
  instantOnly?: boolean
  caution?: boolean
  /** заметка цены из текста предмета */
  note?: SaleNote
}

/** Заметка против рынка: p — рекомендованная цена, floor — «не дешевле», values — лоты основы (для места). */
function checkNote(
  note: SaleNote,
  p: number,
  floor: number,
  values: readonly number[],
  scale: Scale,
  rates?: ChaosRates
): NoteCheck {
  const v = scale.chaos ? toChaos(note.price, scale.rate, rates) : note.price.currency === scale.currency ? note.price.amount : undefined
  if (v == null) return { note, status: 'unknown' }
  const place = placeOf(v, values)
  if (v < floor * (1 - UNDER_RATIO)) return { note, status: 'under', percent: Math.round((1 - v / p) * 100), place }
  if (v > p * OVER_RATIO) return { note, status: 'over', place }
  return { note, status: 'fair', place }
}

export function sellAdvice(input: SellInput): SellAdvice {
  const { listings, honest, total, chaosPerDivine: rate, rates } = input
  const instant = valuedLots(listings, honest, 'instant', rate, rates)
  const n = instant.lots.length
  const caution = input.caution ? { caution: true } : {}

  // лестница — всегда по мгновенным (их может и не быть)
  const ladderOf = (unit: string, scale: Scale): SellLadder => {
    const at = (i: number): Poe1Price | undefined => (instant.lots[i] ? shown(instant.lots[i].v, unit, scale) : undefined)
    if (!n) return { count: 0 }
    return {
      count: n,
      cheapest: at(0),
      ...(n >= SELL_MIN_INSTANT ? { fifth: at(SELL_MIN_INSTANT - 1) } : {}),
      median: at((n - 1) >> 1)
    }
  }

  const person = n ? undefined : valuedLots(listings, honest, 'person', rate, rates)
  const basis = n ? instant : person!
  const scale = basis.scale
  if (!scale || !basis.lots.length) return { kind: 'none', basis: n ? 'instant' : 'person', ladder: { count: 0 }, lots: 0, ...caution }

  const values = basis.lots.map((x) => x.v)
  const m = values.length
  // P: середина пяти самых дешёвых (3-й по цене); лотов меньше — нижняя середина того, что есть
  const pV = values[(Math.min(m, SELL_MIN_INSTANT) - 1) >> 1]
  const unit = scale.chaos ? unitFor(pV, scale.rate) : scale.currency
  const price = shown(pV, unit, scale)
  const floor = shown(values[0], unit, scale)
  const pRounded = backToScale(price, scale)
  const chaos = scale.chaos ? pRounded : undefined

  let kind: SellKind = !n ? 'whisper' : n < SELL_MIN_INSTANT ? 'few' : 'ok'
  if (chaos != null && chaos < JUNK_CHAOS) kind = input.noVendor ? 'cheap' : 'junk'

  // комиссия в золоте — у мгновенного лота с ценой ближе всего к P
  const withFee = instant.lots.filter((x) => x.l.fee != null)
  const nearest = withFee.reduce<Valued | undefined>((best, x) => (!best || Math.abs(x.v - pV) < Math.abs(best.v - pV) ? x : best), undefined)

  const q3 = n >= SPREAD_MIN_LOTS ? instant.lots[Math.floor((n - 1) * 0.75)].v / instant.lots[0].v : 0

  return {
    kind,
    basis: n ? 'instant' : 'person',
    ladder: ladderOf(unit, scale),
    price,
    floor,
    ...(chaos != null ? { chaos } : {}),
    place: placeOf(pRounded, values),
    lots: m,
    copy: copyNumber(price.amount),
    ...(nearest?.l.fee != null ? { fee: nearest.l.fee } : {}),
    ...(q3 >= SPREAD_RATIO ? { spread: true } : {}),
    // похожих больше, чем загружено: поиск «только мгновенный выкуп» покажет больше мгновенных
    ...(n < SELL_MIN_INSTANT && !input.instantOnly && total > listings.length ? { moreInstant: true } : {}),
    ...caution,
    ...(input.note ? { note: checkNote(input.note, pRounded, backToScale(floor, scale), values, scale, rates) } : {})
  }
}

// ---------------------------------------------------------------- «Продаю»: обмен у Фаустуса

export interface ExchangeSell {
  /** few — мало сделок за час или данные не за последний час */
  kind: 'ok' | 'few'
  /** валюта главного рынка */
  base: FaustusBase
  /** «~P за 1 шт.» — средняя цена сделок часа */
  price: Poe1Price
  /** «не дешевле» — нижняя сделка часа */
  floor: Poe1Price
  /** верхняя сделка часа */
  top: Poe1Price
  /** chaos за 1 шт. */
  chaos: number
  /** число для буфера (цена 1 шт. от 1 базы) */
  copy?: string
  /** дешевле 1 базы за штуку: сколько штук отдать за 1 базу (в окне обмена задают соотношение) */
  perBase?: number
  note?: NoteCheck
}

/** Цена обмена в валюте рынка — с тем же округлением, что в блоке «Цена у Фаустуса» (S24). */
function exchangeAmount(v: number, base: FaustusBase): number {
  return base === 'divine' ? roundDivine(v) : chaosIn(v, 'chaos', undefined).amount
}

export function exchangeSell(f: FaustusPrice, confidence: number, note?: SaleNote): ExchangeSell {
  const { base, each, lo, hi } = f.main
  const at = (v: number): Poe1Price => ({ amount: exchangeAmount(v, base), currency: base })
  const price = at(each)
  const toBase = base === 'divine' ? f.chaosPerDivine : 1
  const out: ExchangeSell = {
    kind: f.low || confidence <= 1 ? 'few' : 'ok',
    base,
    price,
    floor: at(lo),
    top: at(hi),
    chaos: f.chaos,
    ...(each >= 1 ? { copy: copyNumber(price.amount) } : { perBase: Math.round(1 / each) })
  }
  if (note) {
    // «место» среди сделок часа ничего не говорит — его не показываем
    const c = checkNote(note, each * toBase, lo * toBase, [], { chaos: true, rate: f.chaosPerDivine })
    out.note = { note: c.note, status: c.status, ...(c.percent != null ? { percent: c.percent } : {}) }
  }
  return out
}
