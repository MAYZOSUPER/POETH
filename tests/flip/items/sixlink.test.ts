import { describe, expect, it } from 'vitest'
import { BENCH_FUSING, BENCH_JEWELLERS, benchCost, sixLinkRows } from '@shared/flip/items/sixlink'
import { buildRows, SELL_FACTOR } from '@shared/flip/items/tiers'
import { DIVINE, sampleSnapshot } from './helpers'

const rows = buildRows(sampleSnapshot().lines, DIVINE)
// курсы сфер для теста: Fusing 0,2 c, Jeweller's 0,05 c
const FUSING = 0.2
const JEWELLERS = 0.05

describe('«6L против без связей»', () => {
  it('верстак: 1500 Fusing + 350 Jeweller’s по курсу фида; нет курса — стоимость неизвестна', () => {
    expect(benchCost(FUSING, JEWELLERS)).toBeCloseTo(BENCH_FUSING * FUSING + BENCH_JEWELLERS * JEWELLERS)
    expect(benchCost(null, JEWELLERS)).toBeNull()
    expect(benchCost(0, 1)).toBeNull()
  })

  it('пары одного уника и варианта; выгода = продажа 6L − покупка без связей − верстак', () => {
    const six = sixLinkRows(rows, FUSING, JEWELLERS)
    // надёжные — по выгоде; Foulborn Covenant (2 наблюдения) и Starforge 6L (1 наблюдение) — вниз, «мало данных»
    expect(six.map((r) => [r.id, r.thin])).toEqual([
      ['the-covenant-spidersilk-robe-6l', false],
      ['shavronnes-wrappings-occultists-vestment-6l', false],
      ['the-golden-charlatan-lion-sword-6l', false],
      ['starforge-infernal-sword-6l', true],
      ['foulborn-the-covenant-blood-magic-spidersilk-robe-6l', true]
    ])
    // The Covenant: 6L 1011 c (продаётся за несколько часов) − 70 c без связей − верстак ≈ +522 c
    expect(six[0].profit).toBe(Math.round(1011 * SELL_FACTOR.normal - 70 - (BENCH_FUSING * FUSING + BENCH_JEWELLERS * JEWELLERS)))
    const shav = six.find((r) => r.id === 'shavronnes-wrappings-occultists-vestment-6l')!
    const cost = BENCH_FUSING * FUSING + BENCH_JEWELLERS * JEWELLERS
    expect(shav).toMatchObject({ baseId: 'shavronnes-wrappings-occultists-vestment', buy: 10, cost: Math.round(cost), liquidity: 'slow' })
    expect(shav.profit).toBe(Math.round(318.6 * SELL_FACTOR.slow - 10 - cost))
    // Tabula Rasa — только 6L, пары нет
    expect(six.some((r) => r.name === 'Tabula Rasa')).toBe(false)
    // Foulborn — в паре со своим вариантом, не с обычным
    expect(six.find((r) => r.foulborn)).toMatchObject({ foulborn: true, baseId: 'foulborn-the-covenant-blood-magic-spidersilk-robe', variant: 'Blood Magic' })
  })

  it('без курса сфер — выгода не считается, строки остаются', () => {
    const six = sixLinkRows(rows, null, null)
    expect(six.length).toBe(5)
    expect(six.every((r) => r.cost === null && r.profit === null)).toBe(true)
  })
})
