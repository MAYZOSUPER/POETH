import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { leagueHour, parseFeedHour, type FullHour } from '../../src/shared/flip/feed'
import { buildRoute, computeRoutes, DEFAULT_FILTERS, lcm, MAX_FLIPS, ratioOrder, topFlips, type Market, type RouteContext } from '../../src/shared/flip/routes'
import { divineTrack } from '../../src/shared/flip/divine'
import type { PairStats, RealPrices } from '../../src/shared/flip/stats'
import type { FlipBase, FlipRoute } from '../../src/shared/types/flip'

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
/** реалистичные цены рынка: свежий VWAP, покупка [VWAP, hi] и продажа [lo, VWAP], цели — посередине */
function real(mid: number, lo: number, hi: number): RealPrices {
  return { mid, buy: { at: (mid + hi) / 2, lo: mid, hi }, sell: { at: (mid + lo) / 2, lo, hi: mid } }
}
function market(base: FlipBase, r: RealPrices, s24: Partial<PairStats> = {}, s6: Partial<PairStats> = {}): Market {
  return { base, s24: stats({ vwap: r.mid, ...s24 }), s6: stats({ vwap: r.mid, ...s6 }), real: r }
}
const ctx: RouteContext = {
  rate: 300,
  names: { 'Scarabs/X': 'Test Scarab' },
  fees: { 'Test Scarab': 30, 'Chaos Orb': 15, 'Divine Orb': 250 },
  filters: { ...DEFAULT_FILTERS, budgetDiv: 100 }
}
// X за chaos: VWAP 100, сделки 95–105; за divine: VWAP 0,37 (111 c), сделки 0,35–0,38
const C = market('chaos', real(100, 95, 105))
const D = market('divine', real(0.37, 0.35, 0.38))

describe('маршрут по реалистичным ценам и комиссии в золоте', () => {
  it('C→X→D: покупка — к стороне продавцов, продажа — к стороне покупателей; золото и прибыль по курсу', () => {
    const r = buildRoute('CXD', 'Scarabs/X', C, D, ctx)!
    // покупка: цель 102,5 → ордер 102 : 1; продажа: цель 0,36 → 9 div : 25 шт.
    expect(r.buy).toEqual({ base: 'chaos', price: 102, order: { give: 102, get: 1 }, range: { lo: 100, hi: 105 } })
    expect(r.sell).toEqual({ base: 'divine', price: 0.36, order: { give: 25, get: 9 }, range: { lo: 0.35, hi: 0.37 } })
    expect(r.profit).toBeCloseTo(0.36 * 300 - 102, 3)
    expect(r.spread).toBeCloseTo(6 / 102, 4)
    expect(r.gold).toEqual({ x: 30, base: 250 })
    expect(r.goldPerUnit).toBe(30 + 0.36 * 250)
    expect(r.per1000Gold).toBeCloseTo((6 / 120) * 1000, 2)
    expect(r.units % 25).toBe(0)
    expect(r.perHour).toBeCloseTo(r.profit * r.flow, 1)
    expect(r.rejects).toEqual([])
  })

  it('C→X→C: покупка не дешевле VWAP, продажа не дороже — в одном рынке прибыли нет, маршрут отсеян', () => {
    const r = buildRoute('CXC', 'Scarabs/X', C, C, ctx)!
    expect(r.buy.price).toBeGreaterThanOrEqual(C.real.mid - 0.5)
    expect(r.sell.price).toBeLessThanOrEqual(C.real.mid + 0.5)
    expect(r.profit).toBeLessThan(0)
    expect(r.rejects).toContain('profit')
    expect(r.rejects).toContain('spread')
  })

  it('старая цель «lo суток» дала бы прибыль на пустом месте — новая нет', () => {
    // сутки: lo 95, hi 105 (лучшие сделки), но торгуют по 100 — флип внутри рынка не исполнить
    const lucky = { ...C, real: { mid: 100, buy: { at: 95, lo: 95, hi: 95 }, sell: { at: 105, lo: 105, hi: 105 } } }
    expect(buildRoute('CXC', 'Scarabs/X', lucky, lucky, ctx)!.profit).toBe(10)
    expect(buildRoute('CXC', 'Scarabs/X', C, C, ctx)!.profit).toBeLessThan(0)
  })

  it('запас прочности: чем шире диапазон в игре против прибыли, тем ниже уверенность', () => {
    const narrow = buildRoute('CXD', 'Scarabs/X', market('chaos', real(100, 99, 101)), D, ctx)!
    const wide = buildRoute('CXD', 'Scarabs/X', market('chaos', real(100, 80, 104)), D, ctx)!
    expect(narrow.profit).toBeGreaterThan(wide.profit)
    expect(narrow.confidence).toBeGreaterThan(wide.confidence)
  })

  it('фильтры: ликвидность, активность, спред, волатильность, тренд, бюджет', () => {
    const bad = { liquidity: 100, activeHours: 5, volatility: 0.5 }
    const c = market('chaos', real(100, 95, 105), { ...bad, vwap: 100 }, { vwap: 130 })
    // продажа за divine на 50 % дороже — маржа выше потолка спреда
    const d = market('divine', real(0.5, 0.49, 0.52), bad)
    const r = buildRoute('CXD', 'Scarabs/X', c, d, { ...ctx, filters: { ...ctx.filters, budgetDiv: 0.1 } })!
    expect(r.rejects).toEqual(['liquidity', 'activity', 'spread', 'volatility', 'budget', 'trend'])
    expect(r.confidence).toBeLessThan(0.5)
  })

  it('без имени предмета — маршрута нет', () => {
    expect(buildRoute('CXC', 'Scarabs/Unknown', C, C, ctx)).toBeNull()
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

  it('топ: маршрут с трендом — только при выключенном «Без тренда»', () => {
    const trendy = { ...routes[0], id: 'x', item: 'Scarabs/Trendy', rejects: ['trend' as const] }
    expect(topFlips([trendy, ...routes]).some((r) => r.id === 'x')).toBe(false)
    expect(topFlips([trendy, ...routes], MAX_FLIPS, true)[0].id).toBe('x')
  })

  it('каждый маршрут — либо прошёл, либо с причинами', () => {
    for (const r of rejected) expect(r.rejects.length).toBeGreaterThan(0)
    expect(new Set([...routes, ...rejected].map((r) => r.id)).size).toBe(routes.length + rejected.length)
  })
})

describe('Valdo’s Puzzle Box на часах 29.10 (живая проверка rc.8)', () => {
  const hours = JSON.parse(readFileSync(join(__dirname, '../fixtures/flip/valdo-29oct.json'), 'utf8')) as FullHour[]
  const lastHour = hours[hours.length - 1].hour
  const rate = divineTrack(hours, 'Allflame')!.current
  const valdo = (budgetDiv: number) =>
    computeRoutes({ hours, league: 'Allflame', lastHour, ctx: { rate, names, fees, filters: { ...DEFAULT_FILTERS, budgetDiv } } })
  const find = (rs: { routes: FlipRoute[]; rejected: FlipRoute[] }) => [...rs.routes, ...rs.rejected].find((r) => r.id === 'CXD:Currency/CurrencyValdoPuzzleBox')!

  it('было «купить ≤ 272 c, продать ≥ 1 div, +65 c»; стало «≤ 301 c (в игре 286–317), ≥ 0,96 div»', () => {
    expect(rate).toBeCloseTo(339.5, 1)
    const r = find(valdo(25))
    expect(r.buy).toEqual({ base: 'chaos', price: 301, order: { give: 301, get: 1 }, range: { lo: 286.0028, hi: 317 } })
    expect(r.sell.price).toBe(0.96)
    expect(r.sell.order).toEqual({ give: 25, get: 24 })
    expect(r.profit).toBeCloseTo(0.96 * rate - 301, 2)
    expect(r.rejects).toEqual([])
  })

  it('при бюджете 10 div честный ордер на продажу (24 div : 25 шт.) не влезает — строки нет', () => {
    const rs = valdo(10)
    expect(rs.routes.some((r) => r.item === 'Currency/CurrencyValdoPuzzleBox')).toBe(false)
    expect(find(rs).rejects).toEqual(['budget'])
  })
})
