import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { leagueHour, parseFeedHour, type FullHour, type FullMarket } from '../../src/shared/flip/feed'
import { divineTrack } from '../../src/shared/flip/divine'
import { computeExchangePrices } from '../../src/shared/wealth/exchange'
import { toCompactHour } from '../../src/shared/flip/feed'
import { CHAOS_ID, DIVINE_ID } from '../../src/shared/wealth/exchange'

const raw = JSON.parse(readFileSync(join(__dirname, '../fixtures/flip/allflame-24h.json'), 'utf8')) as Array<{ hour: number; json: unknown }>
const hours: FullHour[] = raw.map((h) => leagueHour(parseFeedHour(h.hour, h.json)!, 'Allflame'))

const H = 1_793_142_000
const hour = (i: number, chaos: number, div: number): FullHour => ({
  hour: H - i * 3600,
  markets: [['L', CHAOS_ID, DIVINE_ID, chaos, div, 0, 0, 0, 0, 0, 0, 0, 0] as FullMarket]
})

describe('трекер курса divine:chaos', () => {
  it('«сейчас» — тот же курс, что у учёта богатства (S11a) и плашки окна цены (S4)', () => {
    const t = divineTrack(hours, 'Allflame')!
    const wealth = computeExchangePrices(hours.map(toCompactHour), 'Allflame').divineRate
    expect(t.current).toBeCloseTo(wealth, 2)
    expect(t.series.length).toBeGreaterThan(20)
    expect(t.day && t.day.lo <= t.day.hi).toBe(true)
  })

  it('коридор мин–макс по часам до последнего; последний час вне коридора недели — выход', () => {
    const hs = [hour(0, 4000, 10), ...Array.from({ length: 10 }, (_, i) => hour(i + 1, 3000 + i * 10, 10))]
    const t = divineTrack(hs, 'L')!
    expect(t.lastHour).toBe(400)
    expect(t.outside).toBe('above')
    expect(t.week).toEqual({ lo: 300, hi: 309 })
    expect(t.day).toEqual({ lo: 300, hi: 309 })
    // последний час — посередине обычного
    const calm = divineTrack([hour(0, 3050, 10), ...hs.slice(1)], 'L')!
    expect(calm.outside).toBeNull()
    expect(divineTrack([], 'L')).toBeNull()
  })
})
