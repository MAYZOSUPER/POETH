import { describe, expect, it } from 'vitest'
import { convertPrice2, exaltedIn, exaltedRates, roundExalted, toExalted, unitFor2 } from '@shared/poe2/pricecheck/currency'

// S61: шкала цен PoE 2 — exalted; от 1 div по курсу — divine.

const RATE = { exaltedPerDivine: 690, exaltedPerChaos: 71.5 }

describe('курсы и единицы PoE 2', () => {
  it('exaltedRates: exalted 1, divine и chaos по курсу, прочие — по Ange; без курса divine — нет', () => {
    expect(exaltedRates(RATE, { regal: 2.1 })).toEqual({ regal: 2.1, exalted: 1, divine: 690, chaos: 71.5 })
    expect(exaltedRates({ exaltedPerDivine: 690 })).toEqual({ exalted: 1, divine: 690 })
    expect(exaltedRates(null)).toBeUndefined()
    expect(exaltedRates({ exaltedPerDivine: 0 })).toBeUndefined()
  })

  it('toExalted: exalted как есть, остальное по курсу, без курса — undefined', () => {
    const r = exaltedRates(RATE)!
    expect(toExalted({ amount: 3, currency: 'exalted' })).toBe(3)
    expect(toExalted({ amount: 2, currency: 'divine' }, r)).toBe(1380)
    expect(toExalted({ amount: 1, currency: 'chaos' }, r)).toBe(71.5)
    expect(toExalted({ amount: 1, currency: 'annul' }, r)).toBeUndefined()
    expect(toExalted({ amount: 1, currency: 'divine' })).toBeUndefined()
  })

  it('единица: от 1 div — divine; округление как у PoE 1', () => {
    expect(unitFor2(689, 690)).toBe('exalted')
    expect(unitFor2(690, 690)).toBe('divine')
    expect(unitFor2(5000, undefined)).toBe('exalted')
    expect(exaltedIn(1035, 'divine', 690)).toEqual({ amount: 1.5, currency: 'divine' })
    expect(exaltedIn(0.333, 'exalted', 690)).toEqual({ amount: 0.33, currency: 'exalted' })
    expect(exaltedIn(12.46, 'exalted', 690)).toEqual({ amount: 12, currency: 'exalted' })
    expect(roundExalted(2.13)).toBe(2.1)
    expect(roundExalted(0.01)).toBe(0.1)
  })

  it('подсказка у цены: divine → ex, ex → div, chaos → ex; без курса — нет', () => {
    const r = exaltedRates(RATE)!
    expect(convertPrice2({ amount: 1, currency: 'divine' }, r)).toEqual({ amount: 690, currency: 'exalted' })
    expect(convertPrice2({ amount: 345, currency: 'exalted' }, r)).toEqual({ amount: 0.5, currency: 'divine' })
    expect(convertPrice2({ amount: 1, currency: 'exalted' }, r)).toBeNull()
    expect(convertPrice2({ amount: 2, currency: 'chaos' }, r)).toEqual({ amount: 143, currency: 'exalted' })
    expect(convertPrice2({ amount: 1, currency: 'divine' }, undefined)).toBeNull()
  })
})
