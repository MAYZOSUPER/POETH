import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { leagueHour, parseFeedHour, type FullHour } from '../../src/shared/flip/feed'
import { buildRoute, computeRoutes, DEFAULT_FILTERS, lcm, MAX_FLIPS, ratioOrder, topFlips, type RouteContext } from '../../src/shared/flip/routes'
import { divineTrack } from '../../src/shared/flip/divine'
import type { PairStats } from '../../src/shared/flip/stats'

const ROOT = join(__dirname, '../..')
const names = JSON.parse(readFileSync(join(ROOT, 'resources/data/poe1/wealth/exchange-ids.json'), 'utf8')).names as Record<string, string>
const fees = JSON.parse(readFileSync(join(ROOT, 'resources/data/poe1/flip/gold-fees.json'), 'utf8')).fees as Record<string, number>
// 24 реальных часа фида обмена GGG (Allflame), урезанные до нескольких пар
const raw = JSON.parse(readFileSync(join(__dirname, '../fixtures/flip/allflame-24h.json'), 'utf8')) as Array<{ hour: number; json: unknown }>
const hours: FullHour[] = raw.map((h) => leagueHour(parseFeedHour(h.hour, h.json)!, 'Allflame'))

describe('целые ордера', () => {
  it('покупка — не дороже цены, продажа — не дешевле; маленькие числа', () => {
    expect(ratioOrder(121, 'buy')).toEqual({ m: 121, n: 1 })
    expect(ratioOrder(147, 'sell')).toEqual({ m: 147, n: 1 })
    expect(ratioOrder(1 / 6, 'buy')).toEqual({ m: 1, n: 6 })
    expect(ratioOrder(0.2, 'sell')).toEqual({ m: 1, n: 5 })
    const b = ratioOrder(5.86, 'buy')!
    expect(b.m / b.n).toBeLessThanOrEqual(5.86)
    expect(5.86 - b.m / b.n).toBeLessThan(0.05)
    const s = ratioOrder(5.86, 'sell')!
    expect(s.m / s.n).toBeGreaterThanOrEqual(5.86)
    expect(ratioOrder(0, 'buy')).toBeNull()
    expect(lcm(6, 4)).toBe(12)
  })
})

function stats(p: Partial<PairStats>): PairStats {
  return { window: 24, vwap: 100, lo: 95, hi: 105, spread: 0.1, liquidity: 50_000, activeHours: 24, volatility: 0.02, depth: 1000, volume: 24_000, ...p }
}
const ctx: RouteContext = {
  rate: 300,
  names: { 'Scarabs/X': 'Test Scarab' },
  fees: { 'Test Scarab': 30, 'Chaos Orb': 15, 'Divine Orb': 250 },
  filters: { ...DEFAULT_FILTERS, budgetDiv: 100 }
}

describe('маршрут и комиссии в золоте', () => {
  it('C→X→C: прибыль со штуки, золото = комиссия X + chaos при продаже × 15', () => {
    const m = { base: 'chaos' as const, s24: stats({}), s6: stats({}) }
    const r = buildRoute('CXC', 'Scarabs/X', m, m, ctx)!
    expect(r.buy).toEqual({ base: 'chaos', price: 95, order: { give: 95, get: 1 } })
    expect(r.sell).toEqual({ base: 'chaos', price: 105, order: { give: 1, get: 105 } })
    expect(r.profit).toBe(10)
    expect(r.goldPerUnit).toBe(30 + 105 * 15)
    expect(r.per1000Gold).toBeCloseTo((10 / 1605) * 1000, 2)
    expect(r.rejects).toEqual([])
    expect(r.units).toBeGreaterThan(0)
    expect(r.units % 1).toBe(0)
  })

  it('C→X→D: продать за divine дешевле по золоту, прибыль считается по курсу', () => {
    const c = { base: 'chaos' as const, s24: stats({}), s6: stats({}) }
    const d = { base: 'divine' as const, s24: stats({ vwap: 0.35, lo: 0.33, hi: 0.36, spread: 0.08 }), s6: stats({ vwap: 0.35 }) }
    const r = buildRoute('CXD', 'Scarabs/X', c, d, ctx)!
    // продажа: 0.36 div = 9 : 25 → 108 chaos за штуку
    expect(r.sell.order).toEqual({ give: 25, get: 9 })
    expect(r.profit).toBeCloseTo(0.36 * 300 - 95, 3)
    expect(r.goldPerUnit).toBe(30 + 0.36 * 250)
    expect(r.per1000Gold).toBeGreaterThan(50)
  })

  it('фильтры: ликвидность, активность, спред, волатильность, тренд, бюджет', () => {
    const bad = { base: 'chaos' as const, s24: stats({ liquidity: 100, activeHours: 5, spread: 0.5, volatility: 0.5, vwap: 100 }), s6: stats({ vwap: 130 }) }
    const r = buildRoute('CXC', 'Scarabs/X', bad, bad, { ...ctx, filters: { ...ctx.filters, budgetDiv: 0.1 } })!
    expect(r.rejects).toEqual(['liquidity', 'activity', 'spread', 'volatility', 'budget', 'trend'])
    expect(r.confidence).toBeLessThan(0.5)
  })

  it('без имени предмета — маршрута нет', () => {
    const m = { base: 'chaos' as const, s24: stats({}), s6: stats({}) }
    expect(buildRoute('CXC', 'Scarabs/Unknown', m, m, ctx)).toBeNull()
  })
})

describe('маршруты на реальных часах фида (Allflame, 24 ч)', () => {
  const lastHour = Math.max(...hours.map((h) => h.hour))
  const div = divineTrack(hours, 'Allflame')!
  const { routes, rejected } = computeRoutes({ hours, league: 'Allflame', lastHour, ctx: { rate: div.current, names, fees, filters: DEFAULT_FILTERS } })

  it('топ флипов стабилен на зафиксированных часах', () => {
    const top = topFlips(routes)
    expect(top.length).toBeLessThanOrEqual(MAX_FLIPS)
    expect(top.map((r) => `${r.kind} ${r.name} ≤${r.buy.price} ${r.buy.base} ≥${r.sell.price} ${r.sell.base} ×${r.units}`)).toMatchSnapshot()
    for (const r of top) {
      expect(r.rejects).toEqual([])
      expect(r.profit).toBeGreaterThan(0)
      expect(r.buy.order.give / r.buy.order.get).toBeCloseTo(r.buy.price, 3)
      expect(r.units % r.buy.order.get).toBe(0)
      expect(r.units % r.sell.order.give).toBe(0)
      expect(r.confidence).toBeGreaterThanOrEqual(0)
      expect(r.confidence).toBeLessThanOrEqual(1)
    }
  })

  it('каждый маршрут — либо прошёл, либо с причинами', () => {
    for (const r of rejected) expect(r.rejects.length).toBeGreaterThan(0)
    expect(new Set([...routes, ...rejected].map((r) => r.id)).size).toBe(routes.length + rejected.length)
  })
})
