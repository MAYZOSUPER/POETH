import { readFileSync } from 'fs'
import { join, resolve } from 'path'
import { describe, expect, it } from 'vitest'
import type { FullHour } from '@shared/flip/feed'
import { feedIdsByName } from '@shared/poe2/pricecheck/ange'
import { loadPoe2Prices } from '@shared/poe2/prices/load'
import { collectPrices } from '@shared/rumours/prices'
import { exchangePriceSource, ninjaPriceSource, type ExchangeFeed } from '@shared/rumours/sources'
import { mainItem } from '@shared/rumours/schema'
import { rumourRow } from '@shared/rumours/view'
import { pickRumour } from '@shared/rumours/pick'
import { ROOT, bundled } from './fixtures'

// Источники цен главных наград (S65): адаптеры к цене у Ange по фиду GGG (S61) и к снимку poe.ninja (S67).
// Данные настоящие: часы фида realm poe2 31.10 (tests/fixtures/poe2/exchange, только нужные рынки), имена id фида и
// встроенный снимок poe.ninja (resources/data/poe2). Сети нет.

const LG = 'Forbidden Rites'
const { hours } = JSON.parse(readFileSync(resolve(ROOT, 'tests/fixtures/poe2/exchange/hours.json'), 'utf8')) as { hours: FullHour[] }
const ids = JSON.parse(readFileSync(resolve(ROOT, 'resources/data/poe2/exchange/exchange-ids.json'), 'utf8')) as { names: Record<string, string> }
const feed: ExchangeFeed = { hours, byName: feedIdsByName(ids.names) }
const readPoe2 = async (rel: string): Promise<string | null> => {
  try {
    return readFileSync(join(ROOT, 'resources/data/poe2', rel), 'utf8')
  } catch {
    return null
  }
}
const ninjaLoad = (league: string) => loadPoe2Prices(readPoe2, league)
const list = bundled().rumours
const rewardRefs = list.flatMap((r) => {
  const it = mainItem(r)
  return it ? [{ ns: it.ns, ref: it.ref, meta: it.meta }] : []
})

describe('обменник GGG (цена у Ange, S61)', () => {
  const src = exchangePriceSource(async () => feed)

  it('цена по английскому имени — в exalted, час фида, признак «мало сделок»', async () => {
    const q = await src.quote([{ ns: 'ITEM', ref: 'Regal Orb', meta: null }, { ns: 'ITEM', ref: 'Made Up Orb', meta: null }], LG)
    expect(Object.keys(q)).toEqual(['ITEM:Regal Orb'])
    const regal = q['ITEM:Regal Orb']
    expect(regal).toMatchObject({ unit: 'exalted', source: 'exchange' })
    expect(regal.value).toBeGreaterThan(1)
    expect(regal.value).toBeLessThan(10)
    expect(typeof regal.low).toBe('boolean')
    expect(Date.parse(regal.at!)).toBeGreaterThan(0)
  })

  it('курс лиги: exalted за divine и за chaos', async () => {
    const r = await src.rates!(LG)
    expect(r.divineInExalted).toBeGreaterThan(600)
    expect(r.divineInExalted).toBeLessThan(800)
    expect(r.chaosInExalted).toBeGreaterThan(60)
  })

  it('нет фида (сеть, чужая лига) — ни цен, ни курса', async () => {
    const none = exchangePriceSource(async () => null)
    expect(await none.quote(rewardRefs, LG)).toEqual({})
    expect(await none.rates!(LG)).toEqual({})
    expect(await src.quote(rewardRefs, 'Нет такой лиги')).toEqual({})
  })
})

describe('снимок poe.ninja (S67)', () => {
  const src = ninjaPriceSource(ninjaLoad)

  it('главные награды слухов есть в снимке, кроме базы амулета', async () => {
    const q = await src.quote(rewardRefs, LG)
    for (const ref of ['ITEM:Perfect Flux', "ITEM:Olroth's Reliquary Key", "GEM:Rakiata's Flow", "GEM:Uhtred's Exodus", "GEM:Vorana's Siege", "GEM:Medved's Felling"]) {
      expect(q[ref], ref).toBeDefined()
      expect(q[ref].value, ref).toBeGreaterThan(0)
      expect(q[ref].source).toBe('ninja')
    }
    expect(q['ITEM:Pearlescent Amulet']).toBeUndefined()
  })

  it('курс divine из снимка; снимка нет — пусто', async () => {
    expect((await src.rates!(LG)).divineInExalted).toBeGreaterThan(100)
    const none = ninjaPriceSource(async () => null)
    expect(await none.quote(rewardRefs, LG)).toEqual({})
    expect(await none.rates!(LG)).toEqual({ divineInExalted: null })
  })
})

describe('вместе: обменник первым, poe.ninja добирает', () => {
  it('сведение, подвал «Цены: обменник GGG, poe.ninja», цена в строке и «Бери …»', async () => {
    const refs = [...rewardRefs, { ns: 'ITEM' as const, ref: 'Regal Orb', meta: null }]
    const book = await collectPrices([exchangePriceSource(async () => feed), ninjaPriceSource(ninjaLoad)], refs, LG)
    expect(book.quotes['ITEM:Regal Orb'].source).toBe('exchange')
    expect(book.quotes['ITEM:Perfect Flux']).toBeDefined()
    expect(book.sources).toContain('ninja')
    expect(book.rates.divineInExalted).toBeGreaterThan(600)

    const fs = list.find((r) => r.id === 'fallen-stars')!
    const row = rumourRow(fs, 'ru', 'ru', undefined, book)
    expect(row.price).not.toBeNull()
    expect(['divine', 'exalted']).toContain(row.price!.unit)

    // острова боссов: у главных наград (именные камни) есть цены, Утред дороже Вораны
    const p = pickRumour(list, ['the-last-to-fall', 'stardrinker'], {}, book)
    expect(p.best).toBe('stardrinker')
    expect(p.ranked.every((x) => x.priceEx !== null)).toBe(true)
    expect(p.ranked[0].priceEx!).toBeGreaterThan(p.ranked[1].priceEx!)
  })
})
