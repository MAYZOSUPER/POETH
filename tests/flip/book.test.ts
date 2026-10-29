import { describe, expect, it } from 'vitest'
import type { BookReading, BookRow, FlipBase, FlipLeg, FlipRoute } from '../../src/shared/types'
import {
  BOOK_STALE_MS,
  bookDoubts,
  bookLevels,
  bookUsable,
  fillBook,
  isBookStale,
  legFill,
  matchLeg,
  topPrice,
  unitsWithin
} from '../../src/shared/flip/book'

// Стакан «Курс / Кол-во» из игры (S28): Valdo's Puzzle Box за Chaos Orb, скриншот пользователя 29.10.
const VALDO: BookRow[] = [
  { want: 1, have: 296, stock: 2 },
  { want: 1, have: 299, stock: 1 },
  { want: 1, have: 303, stock: 16 },
  { want: 1, have: 310, stock: 1 },
  { want: 1, have: 318, stock: 6 },
  { want: 1, have: 318, stock: 200, beyond: true }
]

const reading = (rows: BookRow[], at = 0): BookReading => ({ at, rows, doubt: bookDoubts(rows), source: 'screen' })

function leg(base: FlipBase, price: number): FlipLeg {
  return { base, price, order: { give: 1, get: 1 }, range: { lo: price, hi: price } }
}

function route(buy: number, sell: number, units = 12): FlipRoute {
  return {
    id: 'CXC:valdo',
    kind: 'CXC',
    item: 'Currency/Valdo',
    name: "Valdo's Puzzle Box",
    buy: leg('chaos', buy),
    sell: leg('chaos', sell),
    profit: sell - buy,
    roi: (sell - buy) / buy,
    goldPerUnit: 30,
    gold: { x: 15, base: 0 },
    per1000Gold: 1,
    units,
    flow: 6,
    perHour: 1,
    confidence: 0.6,
    liquidity: 1000,
    activeHours: 24,
    volatility: 0.05,
    spread: 0.05,
    trend: 0,
    rejects: []
  }
}

describe('уровни стакана', () => {
  it('покупка: цена = имею / хочу, запас — штуки X', () => {
    const lv = bookLevels(VALDO, 'buy')
    expect(lv.map((l) => l.price)).toEqual([296, 299, 303, 310, 318, 318])
    expect(lv.map((l) => l.units)).toEqual([2, 1, 16, 1, 6, 200])
    expect(lv[5].beyond).toBe(true)
    expect(topPrice(VALDO, 'buy')).toBe(296)
  })

  it('продажа: цена = хочу / имею, запас в базе → штуки X', () => {
    // хочу chaos : имею Valdo — «290 : 1», 580 chaos = 2 Valdo
    const lv = bookLevels(
      [
        { want: 290, have: 1, stock: 580 },
        { want: 288, have: 1, stock: 2880 }
      ],
      'sell'
    )
    expect(lv.map((l) => l.price)).toEqual([290, 288])
    expect(lv.map((l) => l.units)).toEqual([2, 10])
    // дробный курс «1 : 1,04» (хочу 1 div, имею 1,04 X) → 0,96 div за штуку
    expect(topPrice([{ want: 1, have: 1.04, stock: 3 }], 'sell')).toBeCloseTo(0.9615, 4)
  })
})

describe('цена исполнения по глубине', () => {
  it('12 Valdo по стакану из игры ≈ 301,5 c в среднем (сверка S25)', () => {
    const f = fillBook(bookLevels(VALDO, 'buy'), 12)
    // 2 × 296 + 1 × 299 + 9 × 303 = 3618
    expect(f.total).toBe(3618)
    expect(f.avg).toBeCloseTo(301.5, 6)
    expect(f.worst).toBe(303)
    expect(f).toMatchObject({ units: 12, enough: true, bounded: false })
  })

  it('глубже последней точной строки — средняя «не меньше», запаса может не хватить', () => {
    const lv = bookLevels(VALDO, 'buy')
    const f = fillBook(lv, 30)
    // 26 шт. до 318 включительно + 4 из «‹ 1 : 318»
    expect(f.total).toBe(2 * 296 + 299 + 16 * 303 + 310 + 6 * 318 + 4 * 318)
    expect(f.bounded).toBe(true)
    const all = fillBook(lv, 1000)
    expect(all).toMatchObject({ units: 226, enough: false })
  })

  it('запас по цене не хуже лимита (строку «‹» не считаем)', () => {
    const lv = bookLevels(VALDO, 'buy')
    expect(unitsWithin(lv, 'buy', 300)).toBe(3)
    expect(unitsWithin(lv, 'buy', 303)).toBe(19)
    expect(unitsWithin(lv, 'buy', 400)).toBe(26)
    expect(unitsWithin(lv, 'buy', 290)).toBe(0)
    const sell = bookLevels([{ want: 290, have: 1, stock: 580 }, { want: 288, have: 1, stock: 2880 }], 'sell')
    expect(unitsWithin(sell, 'sell', 289)).toBe(2)
  })

  it('нулевой и пустой заказ', () => {
    expect(fillBook(bookLevels(VALDO, 'buy'), 0)).toMatchObject({ units: 0, avg: 0, enough: true })
    expect(fillBook([], 5)).toMatchObject({ units: 0, enough: false })
  })
})

describe('проверка строк', () => {
  it('стакан из игры — без сомнений', () => {
    expect(bookDoubts(VALDO)).toEqual([])
    expect(bookUsable(reading(VALDO))).toBe(true)
  })

  it('курс не ухудшается — обе строки на проверку', () => {
    const rows = VALDO.map((r) => ({ ...r }))
    rows[2].have = 289 // «1 : 289» после «1 : 299» — прочитано неверно
    expect(bookDoubts(rows)).toEqual([
      { row: 1, cell: 'have' },
      { row: 1, cell: 'want' },
      { row: 2, cell: 'have' },
      { row: 2, cell: 'want' }
    ])
    expect(bookUsable(reading(rows))).toBe(false)
  })

  it('без единицы в курсе, дробное количество, «‹» не в конце', () => {
    expect(bookDoubts([{ want: 7, have: 296, stock: 2 }])).toEqual([
      { row: 0, cell: 'have' },
      { row: 0, cell: 'want' }
    ])
    expect(bookDoubts([{ want: 1, have: 296, stock: 2.5 }])).toEqual([{ row: 0, cell: 'stock' }])
    const rows: BookRow[] = [
      { want: 1, have: 296, stock: 2, beyond: true },
      { want: 1, have: 299, stock: 1 }
    ]
    expect(bookDoubts(rows).filter((d) => d.row === 0)).toHaveLength(2)
  })

  it('курс «N : 1» (продажа за chaos) — тоже по возрастанию «имею за одну хочу»', () => {
    expect(
      bookDoubts([
        { want: 290, have: 1, stock: 580 },
        { want: 288, have: 1, stock: 2880 },
        { want: 288, have: 1, stock: 900, beyond: true }
      ])
    ).toEqual([])
  })

  it('стакан устаревает через 5 минут', () => {
    const r = reading(VALDO, 1000)
    expect(isBookStale(r, 1000 + BOOK_STALE_MS)).toBe(false)
    expect(isBookStale(r, 1001 + BOOK_STALE_MS)).toBe(true)
  })
})

describe('привязка к ноге маршрута', () => {
  it('«1 : 296» — покупка Valdo, «290 : 1» — продажа', () => {
    const r = route(301, 310)
    expect(matchLeg(VALDO, r)).toBe('buy')
    expect(matchLeg([{ want: 290, have: 1, stock: 580 }], r)).toBe('sell')
  })

  it('чужой предмет или цены около 1 — спросить игрока', () => {
    const r = route(301, 310)
    expect(matchLeg([{ want: 1, have: 5, stock: 10 }], r)).toBeNull()
    const near = route(0.91, 0.96)
    expect(matchLeg([{ want: 1.1, have: 1, stock: 10 }], near)).toBeNull()
  })

  it('цена ноги по стакану — средняя исполнения размера маршрута; сомнительный стакан не считаем', () => {
    const r = route(301, 310, 12)
    expect(legFill(r, 'buy', reading(VALDO))?.avg).toBeCloseTo(301.5, 6)
    const doubtful: BookReading = { ...reading(VALDO), doubt: [{ row: 0, cell: 'have' }] }
    expect(legFill(r, 'buy', doubtful)).toBeNull()
    expect(legFill(r, 'buy', null)).toBeNull()
  })
})
