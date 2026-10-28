import { describe, expect, it } from 'vitest'
import { chartPoints, farmView, netWorthAt, ratePerHour, startSession, stopSession } from '../../src/shared/wealth/farm'
import type { WealthPoint } from '../../src/shared/types/wealth'

const MIN = 60_000
const T0 = 1_800_000_000_000
const pt = (min: number, chaos: number): WealthPoint => ({ at: T0 + min * MIN, chaos, divineRate: 300 })

describe('стоимость на момент времени', () => {
  const points = [pt(0, 1000), pt(20, 1200), pt(60, 1100)]

  it('точно, между снимками — линейно, вне диапазона — null (после последнего — по флагу)', () => {
    expect(netWorthAt(points, T0)).toBe(1000)
    expect(netWorthAt(points, T0 + 10 * MIN)).toBe(1100)
    expect(netWorthAt(points, T0 + 40 * MIN)).toBe(1150)
    expect(netWorthAt(points, T0 - 1)).toBeNull()
    expect(netWorthAt(points, T0 + 61 * MIN)).toBeNull()
    expect(netWorthAt(points, T0 + 61 * MIN, true)).toBe(1100)
    expect(netWorthAt([], T0, true)).toBeNull()
    // порядок точек не важен
    expect(netWorthAt([points[2], points[0], points[1]], T0 + 10 * MIN)).toBe(1100)
  })
})

describe('фарм в час', () => {
  it('доход / время между «Начать» и последним снимком', () => {
    expect(ratePerHour(pt(0, 1000), pt(30, 1300))).toBe(600)
    expect(ratePerHour(pt(0, 1000), pt(90, 850))).toBe(-100)
    // короче 5 минут — не считаем
    expect(ratePerHour(pt(0, 1000), pt(4, 1300))).toBeNull()
  })

  it('сессия идёт: прибыль, в час, за последний час, число снимков', () => {
    const s = startSession('Allflame', T0, 'start', 1000)
    const points = [pt(-30, 900), pt(0, 1000), pt(30, 1150), pt(60, 1300), pt(90, 1600)]
    const v = farmView(s, points)
    expect(v.snapshots).toBe(4)
    expect(v.gain).toBe(600)
    expect(v.perHour).toBe(400)
    // час назад от 90 мин = 30 мин → 1150; 1600 − 1150
    expect(v.lastHour).toBe(450)
  })

  it('сессия короче часа — «за последний час» = от начала; короче 5 мин — без «в час»', () => {
    const s = startSession('L', T0, 'start', 1000)
    expect(farmView(s, [pt(0, 1000), pt(40, 1100)])).toMatchObject({ gain: 100, perHour: 150, lastHour: 100 })
    const short = farmView(s, [pt(0, 1000), pt(3, 1100)])
    expect(short.gain).toBe(100)
    expect(short.perHour).toBeUndefined()
    expect(short.lastHour).toBeNull()
  })

  it('остановленная сессия не видит снимков после «Стоп»', () => {
    let s = startSession('L', T0, 'start', 1000)
    s = stopSession(s, T0 + 60 * MIN, 'end', 1500)
    const v = farmView(s, [pt(0, 1000), pt(60, 1500), pt(120, 100)])
    expect(v.gain).toBe(500)
    expect(v.perHour).toBe(500)
    expect(v.snapshots).toBe(2)
  })

  it('без сессии и только со стартовым снимком', () => {
    expect(farmView(null, [pt(0, 1)])).toEqual({ session: null, snapshots: 0 })
    const s = startSession('L', T0, 'start', 1000)
    expect(farmView(s, [pt(0, 1000)])).toMatchObject({ gain: 0, lastHour: null, snapshots: 1 })
  })
})

describe('точки графика', () => {
  it('последние 7 дней — все, раньше — по одной на день (последняя), много свежих — каждая n-я + последняя', () => {
    const DAY = 24 * 60 * MIN
    const now = T0 + 30 * DAY
    const old = Array.from({ length: 6 }, (_, i) => ({ at: T0 + Math.floor(i / 3) * DAY + (i % 3) * 60 * MIN, chaos: i, divineRate: 300 }))
    const recent = Array.from({ length: 10 }, (_, i) => ({ at: now - 2 * DAY + i * 20 * MIN, chaos: 100 + i, divineRate: 300 }))
    const out = chartPoints([...recent, ...old], now)
    expect(out.map((p) => p.chaos)).toEqual([2, 5, ...recent.map((p) => p.chaos)])
    const thin = chartPoints(recent, now, 4)
    expect(thin.map((p) => p.chaos)).toEqual([100, 103, 106, 109])
    expect(chartPoints(recent, now, 3).map((p) => p.chaos)).toEqual([100, 104, 108, 109])
  })
})
