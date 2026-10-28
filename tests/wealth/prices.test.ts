import { describe, expect, it } from 'vitest'
import { buildPriceIndex, matchPrice, type PriceEntry } from '../../src/shared/wealth/prices'
import { exchangeEntries, poeWatchEntries, compactPoeWatch } from '../../src/shared/wealth/sources'
import type { StashItem } from '../../src/shared/wealth/stash'
import type { ExchangePrices } from '../../src/shared/wealth/exchange'

function item(p: Partial<StashItem>): StashItem {
  return { name: '', typeLine: '', baseType: '', frameType: 0, qty: 1, identified: true, corrupted: false, links: 0, ...p }
}

const ex = (name: string, chaos: number, low?: boolean): PriceEntry => ({ name, kind: 'stackable', chaos, source: 'exchange', ...(low ? { low } : {}) })
const pw = (e: Omit<PriceEntry, 'source'>): PriceEntry => ({ ...e, source: 'poewatch' })

const index = buildPriceIndex([
  [ex('Chaos Orb', 1), ex('Divine Orb', 320), ex('The Apothecary', 4000, true)],
  [
    pw({ name: 'Divine Orb', kind: 'stackable', chaos: 999 }), // фид обмена главнее
    pw({ name: 'Sacrifice at Dusk', kind: 'stackable', chaos: 2 }),
    pw({ name: 'Doppelgänger Guise', kind: 'unique', chaos: 3 }),
    pw({ name: 'Doppelgänger Guise', kind: 'unique', chaos: 1600, links: 6 }),
    pw({ name: 'Atziri’s Splendour', kind: 'unique', chaos: 50 }),
    pw({ name: 'Atziri’s Splendour', kind: 'unique', chaos: 70 }),
    pw({ name: 'Vaal Grace', kind: 'gem', chaos: 1, gemLevel: 1, gemQuality: 0, corrupted: false }),
    pw({ name: 'Vaal Grace', kind: 'gem', chaos: 30, gemLevel: 20, gemQuality: 20, corrupted: false }),
    pw({ name: 'Vaal Grace', kind: 'gem', chaos: 90, gemLevel: 21, gemQuality: 20, corrupted: true }),
    pw({ name: 'Vaal Grace', kind: 'gem', chaos: 110, gemLevel: 21, gemQuality: 23, corrupted: true }),
    pw({ name: 'Added Fire Damage Support', kind: 'gem', chaos: 0.5, gemLevel: 1, gemQuality: 0, corrupted: false }),
    pw({ name: 'Added Fire Damage Support', kind: 'gem', chaos: 4, gemLevel: 20, gemQuality: 20, corrupted: false }),
    pw({ name: 'Cemetery Map', kind: 'map', chaos: 3, mapTier: 14 }),
    pw({ name: 'Cemetery Map', kind: 'map', chaos: 9, mapTier: 16 }),
    pw({ name: 'Maelström of Chaos', kind: 'unique', chaos: 5, mapTier: 5 })
  ]
])

describe('сопоставление цен', () => {
  it('валюта и карты Таро — фид обмена; poe.watch — только если обмен имени не знает', () => {
    expect(matchPrice(item({ typeLine: 'Divine Orb', baseType: 'Divine Orb', frameType: 5 }), index)).toMatchObject({ unit: 320, source: 'exchange' })
    expect(matchPrice(item({ typeLine: 'Sacrifice at Dusk', baseType: 'Sacrifice at Dusk' }), index)).toMatchObject({ unit: 2, source: 'poewatch' })
    expect(matchPrice(item({ typeLine: 'The Apothecary', baseType: 'The Apothecary', frameType: 6 }), index)).toMatchObject({
      ns: 'DIVINATION_CARD',
      unit: 4000,
      low: true
    })
  })

  it('уник: 6L — своя цена; без линков — цена без линков; 5L без цены 5L — цена без линков', () => {
    const guise = { name: 'Doppelgänger Guise', typeLine: 'Sadist Garb', baseType: 'Sadist Garb', frameType: 3 }
    expect(matchPrice(item({ ...guise, links: 6 }), index)).toMatchObject({ ns: 'UNIQUE', name: 'Doppelgänger Guise', unit: 1600 })
    expect(matchPrice(item({ ...guise, links: 4 }), index).unit).toBe(3)
    expect(matchPrice(item({ ...guise, links: 5 }), index).unit).toBe(3)
  })

  it('уник с несколькими вариантами — «без оценки» (кандидат не один)', () => {
    const m = matchPrice(item({ name: 'Atziri’s Splendour', baseType: 'Sacrificial Garb', frameType: 3 }), index)
    expect(m).toMatchObject({ reason: 'ambiguous' })
    expect(m.unit).toBeUndefined()
  })

  it('уникальная карта — по ярусу', () => {
    expect(matchPrice(item({ name: 'Maelström of Chaos', baseType: 'Atoll Map', frameType: 3, mapTier: 5 }), index).unit).toBe(5)
    expect(matchPrice(item({ name: 'Maelström of Chaos', baseType: 'Atoll Map', frameType: 3, mapTier: 6 }), index).reason).toBe('no-price')
  })

  it('камень: осквернение, уровень и качество — ближайшие не выше', () => {
    const vaal = { typeLine: 'Vaal Grace', baseType: 'Vaal Grace', frameType: 4 }
    expect(matchPrice(item({ ...vaal, gemLevel: 21, gemQuality: 20, corrupted: true }), index).unit).toBe(90)
    expect(matchPrice(item({ ...vaal, gemLevel: 21, gemQuality: 23, corrupted: true }), index).unit).toBe(110)
    expect(matchPrice(item({ ...vaal, gemLevel: 20, gemQuality: 20 }), index).unit).toBe(30)
    // уровень 19 → цена камня 1-го уровня
    expect(matchPrice(item({ ...vaal, gemLevel: 19, gemQuality: 20 }), index).unit).toBe(1)
    // осквернённого 20/20 в ценах нет
    expect(matchPrice(item({ ...vaal, gemLevel: 20, gemQuality: 20, corrupted: true }), index).reason).toBe('no-price')
    const support = { typeLine: 'Added Fire Damage Support', baseType: 'Added Fire Damage Support', frameType: 4 }
    expect(matchPrice(item({ ...support, gemLevel: 18, gemQuality: 13 }), index).unit).toBe(0.5)
  })

  it('карта (не уник) — базовое имя + ярус; рарки и магические вещи — без оценки', () => {
    expect(matchPrice(item({ typeLine: 'Fecund Cemetery Map of Exposure', baseType: 'Cemetery Map', frameType: 1, mapTier: 14 }), index)).toMatchObject({
      name: 'Cemetery Map',
      unit: 3
    })
    expect(matchPrice(item({ name: 'Doom Loop', typeLine: 'Amethyst Ring', baseType: 'Amethyst Ring', frameType: 2 }), index).reason).toBe('rare')
    expect(matchPrice(item({ typeLine: 'Glinting Amethyst Ring', baseType: 'Amethyst Ring', frameType: 1 }), index).reason).toBe('no-price')
  })

  it('цен нет вовсе — no-source', () => {
    expect(matchPrice(item({ typeLine: 'Chaos Orb', baseType: 'Chaos Orb', frameType: 5 }), buildPriceIndex([])).reason).toBe('no-source')
  })
})

describe('источники → записи цен', () => {
  it('фид обмена: id → имя по файлу сопоставления; без имени — пропуск', () => {
    const prices: ExchangePrices = {
      divineRate: 320,
      byId: new Map([
        ['Currency/CurrencyRerollRare', { chaos: 1, volume: 0, hours: 0 }],
        ['Scarabs/ScarabBreachNew4', { chaos: 6.2, volume: 60, hours: 3 }],
        ['Currency/Unknown', { chaos: 5, volume: 1, hours: 1 }]
      ])
    }
    const e = exchangeEntries(prices, { 'Currency/CurrencyRerollRare': 'Chaos Orb', 'Scarabs/ScarabBreachNew4': 'Winged Breach Scarab' })
    expect(e).toEqual([
      { name: 'Chaos Orb', kind: 'stackable', chaos: 1, source: 'exchange' },
      { name: 'Winged Breach Scarab', kind: 'stackable', chaos: 6.2, source: 'exchange' }
    ])
  })

  it('poe.watch /compact: уники, камни, карты, стакающиеся; базы экипировки и нулевые цены — мимо', () => {
    const json = {
      items: [
        { name: 'Kaom’s Heart', category: 'armour', group: 'bodyarmours', frame: 3, mean: 337, linkCount: 0, lowConfidence: false },
        { name: 'Tabula Rasa', category: 'armour', group: 'bodyarmours', frame: 3, mean: 20, linkCount: 6 },
        { name: 'Vaal Grace', category: 'gem', group: 'vaalgems', frame: 4, mean: 90, gemLevel: 21, gemQuality: 20, gemIsCorrupted: true },
        { name: 'Drox’s Map', category: 'maps', group: 'maps', frame: 2, mean: 10, mapTier: 16 },
        { name: 'Chronicle of Atzoatl', category: 'maps', group: 'currency', frame: 5, mean: 5 },
        { name: 'Sacrifice at Dusk', category: 'fragment', group: 'maps', frame: 0, mean: 2, lowConfidence: true },
        { name: 'Opal Ring', category: 'accessories', group: 'rings', frame: 0, mean: 40 },
        { name: 'Free', category: 'currency', group: 'currency', frame: 5, mean: 0 }
      ]
    }
    const e = poeWatchEntries(compactPoeWatch(json))
    expect(e.map((x) => [x.name, x.kind])).toEqual([
      ['Kaom’s Heart', 'unique'],
      ['Tabula Rasa', 'unique'],
      ['Vaal Grace', 'gem'],
      ['Drox’s Map', 'map'],
      ['Chronicle of Atzoatl', 'stackable'],
      ['Sacrifice at Dusk', 'stackable']
    ])
    expect(e[1].links).toBe(6)
    expect(e[0].links).toBeUndefined()
    expect(e[2]).toMatchObject({ gemLevel: 21, gemQuality: 20, corrupted: true })
    expect(e[3].mapTier).toBe(16)
    expect(e[5].low).toBe(true)
  })
})
