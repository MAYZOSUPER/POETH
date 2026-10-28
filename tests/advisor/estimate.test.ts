import { describe, expect, it } from 'vitest'
import { estimateStrategy, priceOf } from '@shared/advisor/estimate'
import { buildPriceIndex, type PriceEntry } from '@shared/wealth/prices'
import { strategy, T } from './fixtures'

const ex = (name: string, chaos: number, low = false): PriceEntry => ({
  name,
  kind: 'stackable',
  chaos,
  source: 'exchange',
  ...(low ? { low: true } : {})
})

const index = (...entries: PriceEntry[]) => buildPriceIndex([entries])

describe('советник: цена предмета', () => {
  it('стакающийся — по английскому имени; без имени или без записи — нет цены', () => {
    const idx = index(ex('Essence Scarab', 1.5))
    expect(priceOf({ kind: 'stackable', name: 'Essence Scarab' }, idx)).toEqual({ chaos: 1.5, source: 'exchange', low: false })
    expect(priceOf({ kind: 'stackable', name: 'Unknown' }, idx)).toBeNull()
    expect(priceOf({ kind: 'stackable', label: T('Прочее') }, idx)).toBeNull()
  })

  it('карта Таро ищется среди стакающихся', () => {
    const idx = buildPriceIndex([[{ name: 'The Doctor', kind: 'stackable', chaos: 900, source: 'poewatch' }]])
    expect(priceOf({ kind: 'card', name: 'The Doctor' }, idx)?.chaos).toBe(900)
  })

  it('карта — по ярусу, несколько кандидатов — медиана с пометкой «мало сделок»', () => {
    const idx = buildPriceIndex([
      [
        { name: 'Strand Map', kind: 'map', chaos: 3, source: 'poewatch', mapTier: 16 },
        { name: 'Strand Map', kind: 'map', chaos: 1, source: 'poewatch', mapTier: 14 }
      ],
      [{ name: 'Lair Map', kind: 'map', chaos: 2, source: 'poewatch' }]
    ])
    expect(priceOf({ kind: 'map', name: 'Strand Map', tier: 16 }, idx)).toEqual({ chaos: 3, source: 'poewatch', low: false })
    expect(priceOf({ kind: 'map', name: 'Strand Map', tier: 10 }, idx)).toBeNull()
    const many = buildPriceIndex([
      [
        { name: 'X', kind: 'stackable', chaos: 1, source: 'poewatch' },
        { name: 'X', kind: 'stackable', chaos: 5, source: 'poewatch' },
        { name: 'X', kind: 'stackable', chaos: 3, source: 'poewatch' }
      ]
    ])
    expect(priceOf({ kind: 'stackable', name: 'X' }, many)).toEqual({ chaos: 3, source: 'poewatch', low: true })
  })

  it('уник — без 5–6 связей, камень — уровень и качество, не осквернённый', () => {
    const idx = buildPriceIndex([
      [
        { name: 'Tabula Rasa', kind: 'unique', chaos: 10, source: 'poewatch' },
        { name: 'Tabula Rasa', kind: 'unique', chaos: 50, source: 'poewatch', links: 6 },
        { name: 'Enlighten Support', kind: 'gem', chaos: 400, source: 'poewatch', gemLevel: 3, gemQuality: 0 },
        { name: 'Enlighten Support', kind: 'gem', chaos: 20, source: 'poewatch', gemLevel: 1, gemQuality: 0 },
        { name: 'Enlighten Support', kind: 'gem', chaos: 300, source: 'poewatch', gemLevel: 3, gemQuality: 0, corrupted: true }
      ]
    ])
    expect(priceOf({ kind: 'unique', name: 'Tabula Rasa' }, idx)?.chaos).toBe(10)
    expect(priceOf({ kind: 'gem', name: 'Enlighten Support' }, idx)?.chaos).toBe(20)
    expect(priceOf({ kind: 'gem', name: 'Enlighten Support', level: 3 }, idx)?.chaos).toBe(400)
  })
})

describe('советник: оценка карты', () => {
  it('все цены есть: вход без своей карты, доход, прибыль, высокая уверенность', () => {
    const e = estimateStrategy(strategy(), index(ex('Essence Scarab', 2), ex('Deafening Essence of Greed', 5)))
    expect(e.inputs[0]).toEqual({ unit: null, total: 0 }) // своя карта без имени — бесплатно
    expect(e.inputs[1]).toEqual({ unit: 2, total: 2, source: 'exchange' })
    expect(e.cost).toBe(2)
    expect(e.income).toBe(10)
    expect(e.incomePartial).toBe(false)
    expect(e.profit).toBe(8)
    expect(e.confidence).toBe(3)
    expect(e.reasons).toEqual([])
  })

  it('своя карта с ценой на рынке: цена видна, в стоимость не идёт', () => {
    const s = strategy({
      inputs: [{ item: { kind: 'stackable', name: 'Essence Scarab' }, qty: 2, own: true }]
    })
    const e = estimateStrategy(s, index(ex('Essence Scarab', 2), ex('Deafening Essence of Greed', 5)))
    expect(e.inputs[0]).toEqual({ unit: 2, total: 0, source: 'exchange' })
    expect(e.cost).toBe(0)
  })

  it('нет цены у покупного входа — стоимость и прибыль null (не 0), уверенность низкая', () => {
    const e = estimateStrategy(strategy(), index(ex('Deafening Essence of Greed', 5)))
    expect(e.inputs[1]).toEqual({ unit: null, total: null })
    expect(e.cost).toBeNull()
    expect(e.income).toBe(10)
    expect(e.profit).toBeNull()
    expect(e.confidence).toBe(1)
    expect(e.reasons).toContain('noPrice')
  })

  it('нет цен совсем (нет источника) — всё null', () => {
    const e = estimateStrategy(strategy(), buildPriceIndex([]))
    expect(e.cost).toBeNull()
    expect(e.income).toBeNull()
    expect(e.profit).toBeNull()
    expect(e.outputs[0]).toEqual({ unit: null, total: null })
  })

  it('часть добычи без цены — доход «не меньше», уверенность средняя', () => {
    const s = strategy({
      outputs: [
        { item: { kind: 'stackable', name: 'Deafening Essence of Greed' }, qty: 2 },
        { item: { kind: 'stackable', label: T('Прочие сущности') }, qty: 3 }
      ]
    })
    const e = estimateStrategy(s, index(ex('Essence Scarab', 2), ex('Deafening Essence of Greed', 5)))
    expect(e.income).toBe(10)
    expect(e.incomePartial).toBe(true)
    expect(e.profit).toBe(8)
    expect(e.outputs[1]).toEqual({ unit: null, total: null })
    expect(e.confidence).toBe(2)
    expect(e.reasons).toEqual(['partial'])
  })

  it('low: малая доля — средняя уверенность, больше половины стоимости — низкая', () => {
    const small = estimateStrategy(strategy(), index(ex('Essence Scarab', 2, true), ex('Deafening Essence of Greed', 5)))
    expect(small.confidence).toBe(2)
    expect(small.reasons).toEqual(['low'])
    expect(small.inputs[1].low).toBe(true)
    const big = estimateStrategy(strategy(), index(ex('Essence Scarab', 2), ex('Deafening Essence of Greed', 5, true)))
    expect(big.confidence).toBe(1)
    expect(big.reasons).toEqual(['low'])
  })

  it('черновик — не выше средней уверенности', () => {
    const e = estimateStrategy(strategy({ draft: true }), index(ex('Essence Scarab', 2), ex('Deafening Essence of Greed', 5)))
    expect(e.confidence).toBe(2)
    expect(e.reasons).toEqual(['draft'])
  })

  it('убыточная стратегия — отрицательная прибыль, а не null', () => {
    const e = estimateStrategy(strategy(), index(ex('Essence Scarab', 20), ex('Deafening Essence of Greed', 5)))
    expect(e.profit).toBe(-10)
  })
})
