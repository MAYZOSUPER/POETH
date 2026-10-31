import { describe, expect, it } from 'vitest'
import {
  collectPrices,
  inExalted,
  shownPrice,
  staticPriceSource,
  stubPriceSource,
  type RumourPriceSource
} from '@shared/rumours/prices'

// Источник цен главных наград (S65): заглушка до S61/S67, порядок доверия, курс, вид цены для новичка.

const refs = [
  { ns: 'ITEM' as const, ref: 'Perfect Flux', meta: 'Metadata/Items/Currency/CurrencyUpgradeInherentTo20' },
  { ns: 'GEM' as const, ref: "Rakiata's Flow", meta: null }
]
const rates = { divineInExalted: 500, chaosInExalted: 2 }

describe('collectPrices', () => {
  it('заглушка: цен нет, источник не числится ответившим', async () => {
    const book = await collectPrices([stubPriceSource], refs, 'Standard')
    expect(book.quotes).toEqual({})
    expect(book.sources).toEqual([])
    expect(book.league).toBe('Standard')
  })

  it('без лиги не спрашиваем никого', async () => {
    let asked = 0
    const s: RumourPriceSource = { id: 'ninja', quote: async () => (asked++, {}) }
    await collectPrices([s], refs, null)
    expect(asked).toBe(0)
  })

  it('первый источник с ценой выигрывает; второй спрашиваем только о недостающем', async () => {
    const exchange = staticPriceSource('exchange', { 'ITEM:Perfect Flux': { value: 25, unit: 'divine', at: '2026-10-31T10:00:00Z' } }, { divineInExalted: 480 })
    const asked: string[] = []
    const ninja: RumourPriceSource = {
      id: 'ninja',
      quote: async (want) => {
        asked.push(...want.map((r) => r.ref))
        return {
          'ITEM:Perfect Flux': { value: 1, unit: 'exalted', source: 'ninja', at: null },
          "GEM:Rakiata's Flow": { value: 300, unit: 'exalted', source: 'ninja', at: null }
        }
      },
      rates: async () => ({ divineInExalted: 999, chaosInExalted: 3 })
    }
    const book = await collectPrices([exchange, ninja], refs, 'Rise of the Abyssal')
    expect(book.quotes['ITEM:Perfect Flux']).toMatchObject({ value: 25, unit: 'divine', source: 'exchange' })
    expect(book.quotes["GEM:Rakiata's Flow"]).toMatchObject({ value: 300, source: 'ninja' })
    expect(asked).toEqual(["Rakiata's Flow"])
    expect(book.rates).toEqual({ divineInExalted: 480, chaosInExalted: 3 })
    expect(book.sources).toEqual(['exchange', 'ninja'])
  })

  it('падение источника не мешает остальным; плохие числа отбрасываем', async () => {
    const broken: RumourPriceSource = {
      id: 'exchange',
      quote: async () => {
        throw new Error('сеть')
      }
    }
    const weird = staticPriceSource('ninja', { 'ITEM:Perfect Flux': { value: -1, unit: 'exalted', at: null }, "GEM:Rakiata's Flow": { value: 7, unit: 'exalted', at: null } })
    const errors: string[] = []
    const book = await collectPrices([broken, weird], refs, 'Standard', (id) => errors.push(id))
    expect(errors).toEqual(['exchange'])
    expect(Object.keys(book.quotes)).toEqual(["GEM:Rakiata's Flow"])
  })
})

describe('inExalted / shownPrice', () => {
  const q = (value: number, unit: 'exalted' | 'divine' | 'chaos') => ({ value, unit, source: 'stub' as const, at: null })

  it('пересчёт в exalted по курсу; без курса — null', () => {
    expect(inExalted(q(2, 'divine'), rates)).toBe(1000)
    expect(inExalted(q(10, 'chaos'), rates)).toBe(20)
    expect(inExalted(q(2, 'divine'), { divineInExalted: null, chaosInExalted: null })).toBe(null)
    expect(inExalted(null, rates)).toBe(null)
  })

  it('от 1 divine — в divine с одним знаком, иначе в целых exalted', () => {
    expect(shownPrice(q(1250, 'exalted'), rates)).toEqual({ value: 2.5, unit: 'divine' })
    expect(shownPrice(q(40.4, 'exalted'), rates)).toEqual({ value: 40, unit: 'exalted' })
    expect(shownPrice(q(0.2, 'exalted'), rates)).toEqual({ value: 1, unit: 'exalted' })
    expect(shownPrice(q(0.5, 'divine'), rates)).toEqual({ value: 250, unit: 'exalted' })
  })

  it('без курса — в единице источника; chaos без курса не показываем', () => {
    const none = { divineInExalted: null, chaosInExalted: null }
    expect(shownPrice(q(3, 'divine'), none)).toEqual({ value: 3, unit: 'divine' })
    expect(shownPrice(q(30, 'chaos'), none)).toBe(null)
  })
})
