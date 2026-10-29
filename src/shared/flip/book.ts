// Стакан «Курс / Кол-во» из игры (S28, чистый модуль; tests/flip/book.test.ts): проверка строк, цена
// исполнения ордера по глубине и привязка к ноге маршрута. Читает стакан игрок (Alt над «Рыночным курсом» +
// хоткей), POETH только распознаёт снимок и считает — ничего в игре не нажимает.
//
// Курс в игре — «Хочу : Имею», меньшая сторона обычно 1: покупка Valdo за chaos «1 : 296» (хочу 1 Valdo, отдаю
// 296 chaos), продажа за chaos «296 : 1». «Кол-во» — сколько штук того, что хочу, есть по этому курсу. Строки
// идут от лучшего курса к худшему; последняя «‹ 1 : 318» — всё, что ещё дороже, одной суммой: её курс — только
// граница, поэтому цена с её участием — «не меньше» (покупка) или «не больше» (продажа).

import type { BookDoubt, BookReading, BookRow, FlipRoute } from '../types/flip'

/** Нога флипа: покупка X за базу (Хочу X : Имею базу) или продажа X за базу (Хочу базу : Имею X). */
export type BookSide = 'buy' | 'sell'

/** Через столько стакан считается устаревшим (курс в игре меняется за минуты). */
export const BOOK_STALE_MS = 5 * 60_000

export const isBookStale = (r: BookReading, now: number): boolean => now - r.at > BOOK_STALE_MS

/** Уровень стакана в ценах ноги: цена штуки X в базе и сколько штук X по ней. */
export interface BookLevel {
  price: number
  units: number
  /** строка «‹»: цена — граница, точнее неизвестна */
  beyond: boolean
}

/**
 * Строки → уровни ноги, лучшие сначала. Покупка: цена = имею / хочу, запас — штук X. Продажа: цена =
 * хочу / имею (базы за штуку X), запас — в базе, поэтому штук X = запас / цена.
 */
export function bookLevels(rows: readonly BookRow[], side: BookSide): BookLevel[] {
  return rows
    .filter((r) => r.want > 0 && r.have > 0 && r.stock > 0)
    .map((r) => {
      const price = side === 'buy' ? r.have / r.want : r.want / r.have
      return { price, units: side === 'buy' ? r.stock : r.stock / price, beyond: !!r.beyond }
    })
}

/** Цена лучшей строки в ценах ноги (null — строк нет). */
export function topPrice(rows: readonly BookRow[], side: BookSide): number | null {
  return bookLevels(rows, side)[0]?.price ?? null
}

const ONE = (v: number): boolean => Math.abs(v - 1) < 1e-9

/**
 * Что в строках подозрительно (распознавание или ручной ввод): курс без единицы ни с одной стороны, запас не
 * целый, курс не ухудшается сверху вниз, «‹» не в последней строке или лучше предыдущей.
 */
export function bookDoubts(rows: readonly BookRow[]): BookDoubt[] {
  const out: BookDoubt[] = []
  const add = (row: number, ...cells: Array<BookDoubt['cell']>): void => {
    for (const cell of cells) if (!out.some((d) => d.row === row && d.cell === cell)) out.push({ row, cell })
  }
  // «имею за одну хочу»: сверху вниз растёт (каждая следующая строка — хуже для меня)
  const q = (r: BookRow): number => r.have / r.want
  rows.forEach((r, i) => {
    if (!(r.want > 0) || !(r.have > 0) || (!ONE(r.want) && !ONE(r.have))) add(i, 'want', 'have')
    if (!(r.stock >= 1) || !Number.isInteger(r.stock)) add(i, 'stock')
    if (r.beyond && i !== rows.length - 1) add(i, 'want', 'have')
    if (i === 0 || !(rows[i - 1].want > 0 && rows[i - 1].have > 0 && r.want > 0 && r.have > 0)) return
    const prev = q(rows[i - 1])
    const cur = q(r)
    // курс в игре округлён: «‹ 1 : 318» после «1 : 318» — нормально, обычная строка — только хуже
    const ok = r.beyond ? cur >= prev * (1 - 1e-9) : cur > prev * (1 + 1e-9)
    if (!ok) {
      add(i - 1, 'want', 'have')
      add(i, 'want', 'have')
    }
  })
  return out.sort((a, b) => a.row - b.row || a.cell.localeCompare(b.cell))
}

/** Стакан годится в расчёт: строки есть и ни одной сомнительной ячейки. */
export function bookUsable(r: BookReading | null | undefined): r is BookReading {
  return !!r && r.rows.length > 0 && r.doubt.length === 0
}

export interface BookFill {
  /** сколько штук X исполнится (не больше запрошенного и запаса стакана) */
  units: number
  /** база на все units */
  total: number
  /** средняя цена штуки */
  avg: number
  /** цена последней задетой строки */
  worst: number
  /** запаса стакана хватило на всё запрошенное */
  enough: boolean
  /** задета строка «‹»: средняя — «не меньше» (покупка) / «не больше» (продажа) */
  bounded: boolean
}

/** Купить (продать) qty штук X «с рынка» по стакану, начиная с лучшего курса. */
export function fillBook(levels: readonly BookLevel[], qty: number): BookFill {
  let left = Math.max(0, qty)
  let units = 0
  let total = 0
  let worst = 0
  let bounded = false
  for (const l of levels) {
    if (left <= 1e-9) break
    const take = Math.min(left, l.units)
    if (take <= 0) continue
    units += take
    total += take * l.price
    worst = l.price
    left -= take
    if (l.beyond) bounded = true
  }
  return { units, total, avg: units > 0 ? total / units : 0, worst, enough: left <= 1e-9, bounded }
}

/**
 * Сколько штук X есть по цене не хуже limit: покупка — не дороже, продажа — не дешевле. Строку «‹» не
 * считаем: цены в ней неизвестны.
 */
export function unitsWithin(levels: readonly BookLevel[], side: BookSide, limit: number): number {
  let sum = 0
  for (const l of levels) {
    if (l.beyond) continue
    if (side === 'buy' ? l.price <= limit * (1 + 1e-9) : l.price >= limit * (1 - 1e-9)) sum += l.units
  }
  return sum
}

/**
 * К какой ноге маршрута относится стакан: лучшая строка как покупка и как продажа против оценки ноги по фиду.
 * Нога — если её цена близка (в 1,5 раза) и заметно ближе другой; иначе null — спросить игрока.
 */
export function matchLeg(rows: readonly BookRow[], r: FlipRoute): BookSide | null {
  const err = (side: BookSide): number => {
    const p = topPrice(rows, side)
    return p && r[side].price > 0 ? Math.abs(Math.log(p / r[side].price)) : Infinity
  }
  const buy = err('buy')
  const sell = err('sell')
  const near = Math.log(1.5)
  const apart = Math.log(1.2)
  if (buy < near && sell - buy > apart) return 'buy'
  if (sell < near && buy - sell > apart) return 'sell'
  return null
}

/** Цены ноги по стакану для размера маршрута: средняя исполнения r.units (null — стакана нет). */
export function legFill(r: FlipRoute, side: BookSide, book: BookReading | null | undefined): BookFill | null {
  if (!bookUsable(book)) return null
  const qty = r.units > 0 ? r.units : 1
  const fill = fillBook(bookLevels(book.rows, side), qty)
  return fill.units > 0 ? fill : null
}
