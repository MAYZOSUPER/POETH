import { describe, expect, it } from 'vitest'
import { MIN_MAPS, mapTime, myResult, perHour } from '@shared/advisor/time'
import { done, farm } from './fixtures'

const MIN = 60_000
const HOUR = 3_600_000

describe('советник: время карты', () => {
  it('без трекера — время из стратегии; нулевое время стратегии — null', () => {
    expect(mapTime('a', null, 5)).toEqual({ minutes: 5, maps: 0, source: 'default' })
    expect(mapTime('a', farm([]), 0)).toBeNull()
    expect(mapTime('a', farm([]), Number.NaN)).toBeNull()
  })

  it('свои сессии с этой стратегией главнее всех сессий', () => {
    const f = farm([done({ maps: 6, durationMs: 36 * MIN }, 'a'), done({ maps: 10, durationMs: 40 * MIN })])
    expect(mapTime('a', f, 5)).toEqual({ minutes: 6, maps: 6, source: 'mine' })
    // у стратегии b своих сессий нет — среднее по всем: 76 мин / 16 карт
    expect(mapTime('b', f, 5)).toEqual({ minutes: 76 / 16, maps: 16, source: 'tracker' })
  })

  it(`меньше ${MIN_MAPS} карт или нулевое время — следующий источник`, () => {
    const few = farm([done({ maps: 2, durationMs: 10 * MIN }, 'a')])
    expect(mapTime('a', few, 5)?.source).toBe('default')
    const zero = farm([done({ maps: 5, durationMs: 0 }, 'a')])
    expect(mapTime('a', zero, 5)?.source).toBe('default')
  })

  it('идущая сессия тоже считается', () => {
    const f = farm([], { st: { maps: 4, durationMs: 20 * MIN }, strategy: 'a' })
    expect(mapTime('a', f, 9)).toEqual({ minutes: 5, maps: 4, source: 'mine' })
  })
})

describe('советник: доход в час', () => {
  it('прибыль за карту × карт в час', () => {
    expect(perHour(10, 5)).toBe(120)
    expect(perHour(-3, 6)).toBe(-30)
  })

  it('нет прибыли или нулевое/битое время — null', () => {
    expect(perHour(null, 5)).toBeNull()
    expect(perHour(10, 0)).toBeNull()
    expect(perHour(10, null)).toBeNull()
    expect(perHour(10, -1)).toBeNull()
    expect(perHour(10, Infinity)).toBeNull()
  })
})

describe('советник: мой результат', () => {
  it('нет сессий с этой стратегией — null', () => {
    expect(myResult('a', null)).toBeNull()
    expect(myResult('a', farm([done({ maps: 5, durationMs: HOUR })]))).toBeNull()
  })

  it('сумма по сессиям; доход в час — только по сессиям с прибылью', () => {
    const f = farm([
      done({ maps: 10, durationMs: HOUR, profitChaos: 300 }, 'a'),
      done({ maps: 5, durationMs: HOUR / 2 }, 'a'),
      done({ maps: 8, durationMs: HOUR, profitChaos: 999 }, 'b')
    ])
    const r = myResult('a', f)
    expect(r).toEqual({
      sessions: 2,
      maps: 15,
      durationMs: 1.5 * HOUR,
      profitChaos: 300,
      perHour: 300,
      mapMinutes: 6,
      live: false
    })
  })

  it('без прибыли (нет учёта тайника) — карты и время есть, доход null', () => {
    const r = myResult('a', farm([], { st: { maps: 0, durationMs: 30_000 }, strategy: 'a' }))
    expect(r).toMatchObject({ sessions: 1, maps: 0, profitChaos: null, perHour: null, mapMinutes: null, live: true })
  })

  it('сессия короче минуты — доход в час не считаем', () => {
    const r = myResult('a', farm([done({ maps: 1, durationMs: 30_000, profitChaos: 50 }, 'a')]))
    expect(r?.profitChaos).toBe(50)
    expect(r?.perHour).toBeNull()
  })
})
