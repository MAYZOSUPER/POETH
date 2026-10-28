import { describe, expect, it } from 'vitest'
import { leagueHour, parseFeedHour, toCompactHour, type FullMarket } from '../../src/shared/flip/feed'
import { indexPairs, normalizeMarket, pairHours, pairStats, weightedMedian, type PairHour } from '../../src/shared/flip/stats'
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
