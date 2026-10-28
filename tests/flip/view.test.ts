import { describe, expect, it } from 'vitest'
import type { DivineTrack, FlipRoute } from '../../src/shared/types'
import {
  DEFAULT_VIEW,
  fillHours,
  hiddenByTrend,
  niceStep,
  orderTotals,
  pickRoute,
  pips,
  rateView,
  roundProfit,
  visibleRoutes
} from '../../src/renderer/src/panels/flip/view'

// Вид вкладки «Обмен» (макет v2): фильтры простого режима, сортировка, числа для окна обмена, ряд курса.

function route(p: Partial<FlipRoute> & { id: string }): FlipRoute {
  return {
    kind: 'CXC',
    item: `Currency/${p.id}`,
    name: p.id,
    buy: { base: 'chaos', price: 1, order: { give: 1, get: 1 } },
    sell: { base: 'chaos', price: 1.1, order: { give: 1, get: 1 } },
    profit: 0.1,
    roi: 0.1,
    goldPerUnit: 20,
    per1000Gold: 5,
    units: 100,
    perHour: 10,
    confidence: 0.8,
    liquidity: 2000,
    activeHours: 24,
    volatility: 0.05,
    spread: 0.1,
    trend: 0,
    rejects: [],
    ...p
  }
}

const div = (id: string, p: Partial<FlipRoute> = {}): FlipRoute =>
  route({
    id,
    kind: 'DXD',
    buy: { base: 'divine', price: 0.1, order: { give: 1, get: 10 } },
    sell: { base: 'divine', price: 0.11, order: { give: 9, get: 1 } },
    ...p
  })

const ROUTES = [
  route({ id: 'Fusing', perHour: 40, per1000Gold: 3, confidence: 0.6 }),
  route({ id: 'Alchemy', perHour: 25, per1000Gold: 9, confidence: 0.9 }),
  route({ id: 'Regret', perHour: 60, per1000Gold: 1, confidence: 0.3, rejects: ['trend'], trend: 0.2 }),
  div('Exalted', { perHour: 30, per1000Gold: 12 }),
  div('Annul', { perHour: 50, rejects: ['trend'] })
]
const ru: Record<string, string> = { Fusing: 'Сфера соединения', Alchemy: 'Сфера алхимии' }
const nameOf = (r: FlipRoute): string => ru[r.name] ?? r.name
const ids = (rs: FlipRoute[]): string[] => rs.map((r) => r.name)

describe('фильтры и сортировка', () => {
  it('по умолчанию: за chaos, без тренда, по прибыли в час', () => {
    expect(ids(visibleRoutes(ROUTES, DEFAULT_VIEW, nameOf))).toEqual(['Fusing', 'Alchemy'])
    expect(hiddenByTrend(ROUTES, DEFAULT_VIEW)).toBe(1)
  })

  it('база «Все» и «За divine»; чип «Без тренда» выключен — тренд виден, «скрыто» не считается', () => {
    const all = { ...DEFAULT_VIEW, base: 'all' as const }
    expect(ids(visibleRoutes(ROUTES, all, nameOf))).toEqual(['Fusing', 'Exalted', 'Alchemy'])
    expect(hiddenByTrend(ROUTES, all)).toBe(2)
    const divine = { ...DEFAULT_VIEW, base: 'divine' as const, noTrend: false }
    expect(ids(visibleRoutes(ROUTES, divine, nameOf))).toEqual(['Annul', 'Exalted'])
    expect(hiddenByTrend(ROUTES, divine)).toBe(0)
  })

  it('«Только надёжные» — ●● и выше; сортировка «На 1000 золота»', () => {
    const v = { ...DEFAULT_VIEW, base: 'all' as const, noTrend: false, sure: true, sort: 'perGold' as const }
    expect(ids(visibleRoutes(ROUTES, v, nameOf))).toEqual(['Exalted', 'Alchemy', 'Annul', 'Fusing'])
    expect([pips(0.3), pips(0.5), pips(0.74), pips(0.75)]).toEqual([1, 2, 2, 3])
  })

  it('поиск — по имени на языке интерфейса и по английскому', () => {
    expect(ids(visibleRoutes(ROUTES, { ...DEFAULT_VIEW, q: 'алхим' }, nameOf))).toEqual(['Alchemy'])
    expect(ids(visibleRoutes(ROUTES, { ...DEFAULT_VIEW, q: ' FUS ' }, nameOf))).toEqual(['Fusing'])
  })

  it('выбранная строка — прежняя, если видна, иначе первая', () => {
    const rows = visibleRoutes(ROUTES, DEFAULT_VIEW, nameOf)
    expect(pickRoute(rows, 'Alchemy')?.name).toBe('Alchemy')
    expect(pickRoute(rows, 'нет такой')?.name).toBe('Fusing')
    expect(pickRoute([], null)).toBeNull()
  })
})

describe('числа для окна обмена', () => {
  it('итоги ордеров — целые: отдать базы, получить штук, получить за продажу', () => {
    // 6 c за 1 шт., продажа 5 шт. за 33 c; размер 30 шт.
    const r = route({
      id: 'Deck',
      buy: { base: 'chaos', price: 6, order: { give: 6, get: 1 } },
      sell: { base: 'chaos', price: 6.6, order: { give: 5, get: 33 } },
      units: 30
    })
    expect(orderTotals(r)).toEqual({ buyGive: 180, units: 30, sellGet: 198 })
    // D→X→D: 1 div за 6 шт., продажа 5 шт. за 1 div; 60 шт.
    const d = div('Orb', {
      buy: { base: 'divine', price: 1 / 6, order: { give: 1, get: 6 } },
      sell: { base: 'divine', price: 0.2, order: { give: 5, get: 1 } },
      units: 60
    })
    expect(orderTotals(d)).toEqual({ buyGive: 10, units: 60, sellGet: 12 })
  })

  it('итог круга: в chaos, для D→X→D — ещё в divine', () => {
    expect(roundProfit(route({ id: 'A', profit: 2, units: 30 }), 300)).toEqual({ chaos: 60, div: null })
    expect(roundProfit(div('B', { profit: 15, units: 60 }), 300)).toEqual({ chaos: 900, div: 3 })
    expect(roundProfit(div('C', { profit: 15, units: 60 }), 0).div).toBeNull()
  })

  it('время исполнения по модели маршрута: в пределах часа или часы', () => {
    // perHour = прибыль × min(units, штук в час)
    expect(fillHours(route({ id: 'A', profit: 1, units: 12, perHour: 12 }))).toBeNull()
    expect(fillHours(route({ id: 'B', profit: 1, units: 669, perHour: 469 }))).toBe(1.5)
    expect(fillHours(route({ id: 'C', profit: 2, units: 100, perHour: 20 }))).toBe(10)
    expect(fillHours(route({ id: 'D', profit: 0, units: 100, perHour: 0 }))).toBeNull()
  })
})

describe('курс divine для графика', () => {
  const H = 3_600_000
  const T = 1_793_142_000_000
  const track = (rates: number[]): DivineTrack => ({
    current: rates[rates.length - 1],
    lastHour: rates[rates.length - 1],
    hour: T,
    day: null,
    week: null,
    outside: null,
    series: rates.map((rate, i) => ({ at: T - (rates.length - 1 - i) * H, rate }))
  })

  it('24 ч — последние сутки; коридор без последнего часа; выход последней точки', () => {
    const rates = Array.from({ length: 30 }, (_, i) => 300 + (i % 5))
    rates[29] = 310
    const v = rateView(track(rates), '24h')!
    expect(v.points).toHaveLength(25)
    expect(v.t1 - v.t0).toBe(24 * H)
    expect([v.lo, v.hi]).toEqual([300, 304])
    expect(v.outside).toBe(true)
    expect(v.delta).toBe(310 - rates[5])
  })

  it('7 дн — весь ряд; внутри коридора — обычная точка; меньше 3 часов — без коридора', () => {
    const v = rateView(track([300, 305, 302, 303]), '7d')!
    expect(v.points).toHaveLength(4)
    expect([v.lo, v.hi, v.outside]).toEqual([300, 305, false])
    const short = rateView(track([300, 320]), '7d')!
    expect([short.lo, short.hi, short.outside]).toEqual([null, null, false])
    expect(rateView({ ...track([1]), series: [] }, '24h')).toBeNull()
  })

  it('шаг сетки 1-2-5', () => {
    expect(niceStep(27)).toBe(10)
    expect(niceStep(9)).toBe(5)
    expect(niceStep(3)).toBe(1)
    expect(niceStep(1.2)).toBe(0.5)
    expect(niceStep(60)).toBe(20)
  })
})
