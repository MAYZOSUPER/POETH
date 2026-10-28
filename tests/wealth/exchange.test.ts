import { describe, expect, it } from 'vitest'
import {
  CHAOS_ID,
  DIVINE_ID,
  compactFeedHour,
  computeExchangePrices,
  hourStart,
  isLowVolume,
  type CompactHour
} from '../../src/shared/wealth/exchange'

const M = 'Metadata/Items/'
const H0 = 1_793_142_000 // час фида (секунды)

function market(league: string, a: string, b: string, va: number, vb: number): unknown {
  return {
    league,
    market_id: `${M}${a}|${M}${b}`,
    market_pair: [`${M}${a}`, `${M}${b}`],
    volume_traded: { [`${M}${a}`]: va, [`${M}${b}`]: vb },
    lowest_stock: {},
    highest_stock: {},
    lowest_ratio: {},
    highest_ratio: {}
  }
}

describe('фид обмена GGG', () => {
  it('сжатие часа: только рынки с объёмом, id без Metadata/Items/', () => {
    const h = compactFeedHour(H0, {
      next_change_id: H0 + 3600,
      markets: [
        market('Allflame', CHAOS_ID, DIVINE_ID, 348_465, 1034),
        market('Allflame', 'Currency/CurrencyCorrupt', CHAOS_ID, 0, 0),
        { league: 'Allflame', market_pair: ['x'] }
      ]
    })
    expect(h).toEqual({ hour: H0, trades: [['Allflame', CHAOS_ID, DIVINE_ID, 348_465, 1034]] })
    expect(compactFeedHour(H0, { markets: 'нет' })).toBeNull()
  })

  it('начало часа', () => {
    expect(hourStart(1_793_147_149_000)).toBe(1_793_145_600)
  })

  it('курс divine и VWAP по сделкам против chaos и divine (обе стороны пары)', () => {
    const hours: CompactHour[] = [
      {
        hour: H0,
        trades: [
          ['Allflame', CHAOS_ID, DIVINE_ID, 3000, 10], // 300 c/div
          ['Allflame', 'Scarabs/ScarabBreachNew4', CHAOS_ID, 10, 50], // 10 шт за 50 c
          ['Allflame', DIVINE_ID, 'Scarabs/ScarabBreachNew4', 1, 50], // 50 шт за 1 div = 300 c
          ['Allflame', 'Currency/CurrencyRerollMagic', 'Currency/CurrencyCorrupt', 5, 1], // без якоря — не считается
          ['Standard', CHAOS_ID, DIVINE_ID, 100, 1]
        ]
      },
      {
        hour: H0 - 3600,
        trades: [['Allflame', DIVINE_ID, CHAOS_ID, 10, 3400]] // 340 c/div
      }
    ]
    const p = computeExchangePrices(hours, 'Allflame')
    expect(p.divineRate).toBeCloseTo(6400 / 20, 6) // 320
    const scarab = p.byId.get('Scarabs/ScarabBreachNew4')
    // (50 + 1·320) / (10 + 50)
    expect(scarab?.chaos).toBeCloseTo(370 / 60, 6)
    expect(scarab?.volume).toBe(60)
    expect(p.byId.get('Currency/CurrencyRerollMagic')).toBeUndefined()
    expect(p.byId.get(CHAOS_ID)?.chaos).toBe(1)
    expect(p.byId.get(DIVINE_ID)?.chaos).toBeCloseTo(320, 6)
    expect(p.lastHour).toBe(H0)
    // другая лига — свой курс
    expect(computeExchangePrices(hours, 'Standard').divineRate).toBe(100)
  })

  it('окна 6/24/48 ч: берётся самое короткое со сделками', () => {
    const hours: CompactHour[] = [
      { hour: H0, trades: [['L', 'Currency/A', CHAOS_ID, 1, 10]] },
      { hour: H0 - 10 * 3600, trades: [['L', 'Currency/A', CHAOS_ID, 1, 100], ['L', 'Currency/B', CHAOS_ID, 2, 8]] },
      { hour: H0 - 30 * 3600, trades: [['L', 'Currency/C', CHAOS_ID, 1, 7]] }
    ]
    const p = computeExchangePrices(hours, 'L')
    expect(p.byId.get('Currency/A')?.chaos).toBe(10) // только последние 6 ч
    expect(p.byId.get('Currency/B')?.chaos).toBe(4) // 24 ч
    expect(p.byId.get('Currency/C')?.chaos).toBe(7) // 48 ч
    expect(p.divineRate).toBe(0) // нет сделок chaos↔divine
    expect(isLowVolume(p.byId.get('Currency/A')!)).toBe(true)
  })

  it('пустой фид', () => {
    const p = computeExchangePrices([], 'L')
    expect(p.divineRate).toBe(0)
    expect(p.byId.size).toBe(0)
  })
})
