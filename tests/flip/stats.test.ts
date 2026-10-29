import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { leagueHour, parseFeedHour, toCompactHour, type FullHour, type FullMarket } from '../../src/shared/flip/feed'
import { indexPairs, normalizeMarket, pairHours, pairStats, realPrices, weightedMedian, type PairHour, type RealSide } from '../../src/shared/flip/stats'
import { CHAOS_ID, DIVINE_ID } from '../../src/shared/wealth/exchange'

const M = 'Metadata/Items/'
const H = 1_793_142_000
const X = 'Scarabs/ScarabHarvest2'

/** рынок в формате фида */
function market(league: string, a: string, b: string, v: Record<string, [number, number, number, number, number, number]>): unknown {
  // v[id] = [объём, lowRatio, highRatio, lowStock, highStock, —]
  const pick = (i: number): Record<string, number> => ({ [`${M}${a}`]: v[a][i], [`${M}${b}`]: v[b][i] })
  return {
    league,
    market_id: `${M}${a}|${M}${b}`,
    market_pair: [`${M}${a}`, `${M}${b}`],
    volume_traded: pick(0),
    lowest_ratio: pick(1),
    highest_ratio: pick(2),
    lowest_stock: pick(3),
    highest_stock: pick(4)
  }
}

describe('часы фида в полном виде', () => {
  it('рынки с активностью, id без Metadata/Items/, объёмы → вид учёта богатства', () => {
    const h = parseFeedHour(H, {
      markets: [
        market('Allflame', CHAOS_ID, X, { [CHAOS_ID]: [41037, 121, 147, 179981, 188484, 0], [X]: [305, 1, 1, 652, 773, 0] }),
        market('Allflame', CHAOS_ID, 'Currency/CurrencyCorrupt', { [CHAOS_ID]: [0, 0, 0, 0, 0, 0], 'Currency/CurrencyCorrupt': [0, 0, 0, 0, 0, 0] }),
        market('Standard', CHAOS_ID, DIVINE_ID, { [CHAOS_ID]: [0, 300, 310, 10, 10, 0], [DIVINE_ID]: [0, 1, 1, 1, 1, 0] })
      ]
    })
    expect(h?.markets).toHaveLength(2)
    expect(h?.markets[0]).toEqual(['Allflame', CHAOS_ID, X, 41037, 305, 121, 1, 147, 1, 179981, 652, 188484, 773])
    expect(toCompactHour(h!).trades).toEqual([['Allflame', CHAOS_ID, X, 41037, 305]])
    expect(leagueHour(h!, 'Standard').markets).toHaveLength(1)
    expect(parseFeedHour(H, { markets: 5 })).toBeNull()
  })
})

describe('нормализация направления пары', () => {
  const row = (a: string, b: string, va: number, vb: number, loA: number, loB: number, hiA: number, hiB: number): FullMarket => [
    'L', a, b, va, vb, loA, loB, hiA, hiB, 100, 200, 0, 0
  ]

  it('X первым и X вторым дают одну и ту же цену «базы за штуку»', () => {
    // [chaos, X]: 121:1 и 147:1 → 121 и 147 chaos за штуку
    const a = normalizeMarket(row(CHAOS_ID, X, 41037, 305, 121, 1, 147, 1), H, X, 'chaos')
    expect(a).toMatchObject({ volX: 305, volBase: 41037, lo: 121, hi: 147, stockX: 200, stockBase: 100 })
    // [X, chaos]: lowest_ratio 1:7, highest 1:5 — после разворота min/max меняются местами
    const b = normalizeMarket(row('DivinationCards/DivinationCardDeck', CHAOS_ID, 5178, 30356, 1, 7, 1, 5), H, 'DivinationCards/DivinationCardDeck', 'chaos')
    expect(b).toMatchObject({ volX: 5178, volBase: 30356, lo: 5, hi: 7, stockX: 100, stockBase: 200 })
    // не та пара
    expect(normalizeMarket(row(CHAOS_ID, X, 1, 1, 1, 1, 1, 1), H, X, 'divine')).toBeNull()
  })

  it('взвешенная медиана', () => {
    expect(weightedMedian([{ v: 1, w: 1 }, { v: 2, w: 1 }, { v: 10, w: 5 }])).toBe(10)
    expect(weightedMedian([{ v: 3, w: 2 }, { v: 1, w: 1 }, { v: 2, w: 1 }])).toBe(2)
    expect(weightedMedian([])).toBe(0)
  })
})

describe('статистика пары', () => {
  const ph = (i: number, volX: number, price: number, lo: number, hi: number, stockX = 50, stockBase = 5000): PairHour => ({
    hour: H - i * 3600,
    volX,
    volBase: volX * price,
    lo,
    hi,
    stockX,
    stockBase
  })
  const hours = [ph(0, 10, 100, 95, 110), ph(1, 30, 110, 100, 120), ph(2, 0, 0, 0, 0), ph(7, 20, 90, 85, 95)]

  it('окно 6 ч: VWAP, медианы lo/hi по объёму, спред, ликвидность, активные часы, волатильность, глубина', () => {
    const s = pairStats(hours, H, 6, 1)
    // (1000 + 3300) / 40
    expect(s.vwap).toBeCloseTo(107.5, 6)
    expect(s.lo).toBe(100)
    expect(s.hi).toBe(120)
    expect(s.spread).toBeCloseTo(20 / 107.5, 6)
    expect(s.liquidity).toBeCloseTo(4300 / 6, 6)
    expect(s.activeHours).toBe(2)
    expect(s.volatility).toBeCloseTo(5 / 105, 6)
    // стакан: min(50 штук, 5000 / цена часа или VWAP окна) — медиана по часам со стаканом: 50, 45.45, 46.51
    expect(s.depth).toBeCloseTo(5000 / 107.5, 6)
    expect(s.volume).toBe(40)
  })

  it('окно 24 ч добавляет старые часы; база в divine — ликвидность в chaos по курсу', () => {
    const s = pairStats(hours, H, 24, 300)
    expect(s.activeHours).toBe(3)
    expect(s.liquidity).toBeCloseTo((6100 * 300) / 24, 6)
  })

  it('пары лиги за один проход совпадают с выборкой по одной', () => {
    const a = parseFeedHour(H, {
      markets: [
        market('L', CHAOS_ID, X, { [CHAOS_ID]: [100, 10, 12, 1, 1, 0], [X]: [10, 1, 1, 1, 1, 0] }),
        market('L', X, DIVINE_ID, { [X]: [30, 30, 25, 1, 1, 0], [DIVINE_ID]: [1, 1, 1, 1, 1, 0] }),
        market('L', CHAOS_ID, DIVINE_ID, { [CHAOS_ID]: [300, 290, 310, 1, 1, 0], [DIVINE_ID]: [1, 1, 1, 1, 1, 0] })
      ]
    })!
    const idx = indexPairs([a], 'L')
    expect([...idx.keys()]).toEqual([X])
    expect(idx.get(X)?.chaos).toEqual(pairHours([a], 'L', X, 'chaos'))
    expect(idx.get(X)?.divine?.[0]).toMatchObject({ volX: 30, volBase: 1, lo: 1 / 30, hi: 1 / 25 })
  })
})

describe('реалистичная цена «сейчас» (S25)', () => {
  /** час пары: i часов назад, объём, VWAP, lo, hi */
  const ph = (i: number, price: number, lo: number, hi: number, volX = 10): PairHour => ({
    hour: H - i * 3600,
    volX,
    volBase: volX * price,
    lo,
    hi,
    stockX: 100,
    stockBase: 100 * price
  })
  const day = (f: (i: number) => PairHour): PairHour[] => Array.from({ length: 24 }, (_, i) => f(23 - i))
  /** цель и диапазон с точностью до 1e-6 */
  const near = (side: RealSide, at: number, lo: number, hi: number): void => {
    expect(side.at).toBeCloseTo(at, 6)
    expect(side.lo).toBeCloseTo(lo, 6)
    expect(side.hi).toBeCloseTo(hi, 6)
  }

  it('последние часы весят больше суток', () => {
    const hs = day((i) => (i < 3 ? ph(i, 120, 118, 123) : ph(i, 100, 98, 103)))
    const r = realPrices(hs, H)!
    // VWAP суток — 102,5; свежий — ближе к 120
    expect(pairStats(hs, H, 24, 1).vwap).toBeCloseTo(102.5, 6)
    expect(r.mid).toBeGreaterThan(110)
    expect(r.buy.at).toBeGreaterThan(r.mid)
  })

  it('lo часа — одна глубокая сделка: цель покупки не lo, а между свежим VWAP и hi', () => {
    // каждый час кто-то один раз продал дёшево (lo 80), основная торговля — по 100
    const hs = day((i) => ph(i, 100, 80, 104))
    const r = realPrices(hs, H)!
    expect(pairStats(hs, H, 24, 1).lo).toBe(80)
    near(r.buy, 102, 100, 104)
    near(r.sell, 90, 80, 100)
  })

  it('выброс в одном часе (lo 10, hi 400) не сдвигает ни покупку, ни продажу', () => {
    const calm = day((i) => ph(i, 100, 98, 103))
    const spiked = calm.map((h, k) => (k === calm.length - 1 ? { ...h, lo: 10, hi: 400 } : h))
    expect(realPrices(spiked, H)).toEqual(realPrices(calm, H))
    expect(realPrices(calm, H)!.buy.at).toBeCloseTo(101.5, 6)
    expect(realPrices(calm, H)!.sell.at).toBeCloseTo(99, 6)
  })

  it('покупка не дешевле VWAP, продажа не дороже; цель внутри диапазона; без сделок — null', () => {
    // hi ниже VWAP (данные кривые) — диапазон покупки сжимается в VWAP
    const r = realPrices(day((i) => ph(i, 100, 101, 99)), H)!
    near(r.buy, 100, 100, 100)
    near(r.sell, 100, 100, 100)
    expect(realPrices(day((i) => ({ ...ph(i, 100, 0, 0), volX: 0, volBase: 0 })), H)).toBeNull()
    expect(realPrices([], H)).toBeNull()
  })

  it('Valdo’s Puzzle Box, 29.10 (живая проверка rc.8): в игре стакан 296–318 — у нас 286–317, а не 272', () => {
    // часы фида Allflame до 04:00–05:00 МСК — те, что видел пользователь; стакан снят в игре в следующем часу
    const hours = JSON.parse(readFileSync(join(__dirname, '../fixtures/flip/valdo-29oct.json'), 'utf8')) as FullHour[]
    const last = hours[hours.length - 1].hour
    const valdo = pairHours(hours, 'Allflame', 'Currency/CurrencyValdoPuzzleBox', 'chaos')
    const r = realPrices(valdo, last)!
    // в игре: Ratio 1:296 ×2, 1:299 ×1, 1:303 ×16, 1:310 ×1, 1:318 ×6, дороже — ещё 200
    const book: Array<[number, number]> = [
      [296, 2],
      [299, 1],
      [303, 16],
      [310, 1],
      [318, 6]
    ]
    let need = 12
    let cost = 0
    for (const [p, n] of book) {
      const k = Math.min(n, need)
      cost += k * p
      need -= k
    }
    const per12 = cost / 12
    expect(per12).toBe(301.5)
    // старая цель (медиана lo за сутки) ниже самой дешёвой строки стакана
    expect(pairStats(valdo, last, 24, 1).lo).toBeLessThan(book[0][0] * 0.95)
    // новая — в пределах 1 % от цены 12 штук прямо сейчас; диапазон накрывает стакан
    expect(Math.abs(r.buy.at / per12 - 1)).toBeLessThan(0.01)
    expect(r.buy.lo).toBeCloseTo(286, 0)
    expect(r.buy.hi).toBe(317)
    // продать за divine — к стороне покупателей: 0,91–1,01 div, цель 0,96
    const inDiv = realPrices(pairHours(hours, 'Allflame', 'Currency/CurrencyValdoPuzzleBox', 'divine'), last)!
    expect(inDiv.sell.at).toBeCloseTo(0.96, 2)
    expect(inDiv.sell.lo).toBeCloseTo(0.91, 2)
    expect(inDiv.sell.hi).toBeCloseTo(1.01, 2)
  })
})
