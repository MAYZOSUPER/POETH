import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { POE2_INSTILL_FILE, instillCost, instillEmotions, parseInstillData, type InstillData } from '@shared/poe2/build/instill'
import { mergeEmotionPrices } from '@shared/poe2/build/instillPrices'
import type { Poe2AngeResult } from '@shared/poe2/pricecheck/ange'
import { loadPoe2Prices } from '@shared/poe2/prices'
import { DATA2 } from './helpers'

// Цены эмоций «Вложения» (S66): обмен у Ange (S61) — главный, снимок poe.ninja (S67, встроенный в resources) —
// запасной для эмоций без сделок у Ange; курс — Ange, иначе снимка; источник — для подвала.

const data = parseInstillData(JSON.parse(readFileSync(join(DATA2, POE2_INSTILL_FILE), 'utf8'))) as InstillData
const read = async (rel: string): Promise<string | null> => {
  try {
    return readFileSync(join(DATA2, rel), 'utf8')
  } catch {
    return null
  }
}

/** Ответ Ange: цены только у части эмоций (остальные за сутки не меняли). */
const ange = (prices: Record<string, { exalted: number; low?: boolean }>): Poe2AngeResult =>
  ({
    ok: true,
    rate: { exaltedPerDivine: 560, hour: Date.UTC(2026, 10, 1, 12) },
    prices: Object.fromEntries(Object.entries(prices).map(([k, v]) => [k, { exalted: v.exalted, low: !!v.low }]))
  }) as unknown as Poe2AngeResult

describe('цены эмоций', () => {
  it('Ange — главный, снимок poe.ninja — для эмоций без сделок у Ange', async () => {
    const ninja = await loadPoe2Prices(read, 'Runes of Aldur')
    expect(ninja?.match).toBe('exact')
    const p = mergeEmotionPrices(data.emotions, ange({ 'Liquid Paranoia': { exalted: 12 } }), ninja)!
    expect(p.each.get('Liquid Paranoia')).toEqual({ exalted: 12, source: 'ange', low: false })
    const greed = p.each.get('Diluted Liquid Greed')
    expect(greed?.source).toBe('ninja')
    expect(greed?.exalted).toBeGreaterThan(0)
    expect(p.exaltedPerDivine).toBe(560)
    expect(p.ange).toEqual({ hour: Date.UTC(2026, 10, 1, 12) })
    expect(p.ninja).toMatchObject({ league: 'Runes of Aldur', match: 'exact' })
    // рецепт Fast Acting Toxins: сумма считается, когда цены есть у всех трёх эмоций
    const cost = instillCost(instillEmotions(data, 55)!, p.byName)
    if (cost.each.every((x) => x !== null)) expect(cost.total).toBeCloseTo(cost.each.reduce<number>((s, x) => s + (x ?? 0), 0))
  })

  it('только снимок: курс — снимка; только Ange — без poe.ninja в источниках', async () => {
    const ninja = await loadPoe2Prices(read, 'auto')
    const onlyNinja = mergeEmotionPrices(data.emotions, { ok: false }, ninja)!
    expect(onlyNinja.ange).toBeNull()
    expect(onlyNinja.ninja?.match).toBe('current')
    expect(onlyNinja.exaltedPerDivine).toBe(ninja?.table.exaltedPerDivine ?? null)
    expect([...onlyNinja.each.values()].every((x) => x.source === 'ninja')).toBe(true)
    // все 13 эмоций в снимке есть
    expect(onlyNinja.each.size).toBe(13)

    const onlyAnge = mergeEmotionPrices(data.emotions, ange({ 'Liquid Envy': { exalted: 3, low: true } }), null)!
    expect(onlyAnge.ninja).toBeNull()
    expect(onlyAnge.each.get('Liquid Envy')).toEqual({ exalted: 3, source: 'ange', low: true })
  })

  it('нет ни одной цены — null; мусор в ответе — не цена', () => {
    expect(mergeEmotionPrices(data.emotions, null, null)).toBeNull()
    expect(mergeEmotionPrices(data.emotions, ange({ 'Liquid Envy': { exalted: -1 } }), null)).toBeNull()
  })
})
