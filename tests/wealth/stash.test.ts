import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { cleanName, isRemoveOnlyName, maxLinks, parseStashResponse } from '../../src/shared/wealth/stash'

// Фикстуры — вымышленные вкладки и предметы в формате legacy-эндпоинта (без имён аккаунтов).
const fixture = (name: string): unknown => JSON.parse(readFileSync(join(__dirname, '../fixtures/wealth', name), 'utf8'))

describe('разбор ответа стэша', () => {
  it('список вкладок: id, позиция, имя без разметки, цвет; скрытые убраны, карты/уники помечены', () => {
    const r = parseStashResponse(fixture('stash-tabs.json'))
    expect(r?.numTabs).toBe(6)
    expect(r?.tabs?.map((t) => [t.id, t.index, t.name, t.type])).toEqual([
      ['a1b2c3d4e5', 0, 'Валюта', 'CurrencyStash'],
      ['f6a7b8c9d0', 1, 'Свалка 1', 'QuadStash'],
      ['0a0b0c0d0e', 2, 'Карты', 'MapStash'],
      ['1a1b1c1d1e', 3, 'Div', 'DivinationCardStash'],
      ['2a2b2c2d2e', 4, 'Продажа', 'PremiumStash']
    ])
    expect(r?.tabs?.[0].colour).toBe('124,81,50')
    // цвет вне 0..255 — без цвета
    expect(r?.tabs?.[4].colour).toBeUndefined()
    expect(r?.tabs?.filter((t) => t.unsupported).map((t) => t.type)).toEqual(['MapStash'])
  })

  it('стопки валюты: qty = stackSize', () => {
    const r = parseStashResponse(fixture('stash-tabs.json'))
    expect(r?.items.map((i) => [i.typeLine, i.frameType, i.qty])).toEqual([
      ['Chaos Orb', 5, 147],
      ['Divine Orb', 5, 3],
      ['Winged Breach Scarab', 5, 2]
    ])
  })

  it('уник 6L, камни (в гнёздах тоже), рарка, магическая карта с ярусом, карта Таро; мусор пропущен', () => {
    const r = parseStashResponse(fixture('stash-tab-dump.json'))
    expect(r?.tabs).toBeUndefined()
    const items = r?.items ?? []
    expect(items).toHaveLength(6)
    const [chest, vaal, support, ring, map, card] = items
    expect(chest).toMatchObject({ name: 'Doppelgänger Guise', baseType: 'Sadist Garb', frameType: 3, links: 6, qty: 1 })
    expect(vaal).toMatchObject({ typeLine: 'Vaal Grace', frameType: 4, gemLevel: 21, gemQuality: 20, corrupted: true })
    expect(support).toMatchObject({ typeLine: 'Added Fire Damage Support', gemLevel: 18, gemQuality: 13, corrupted: false })
    expect(ring).toMatchObject({ name: 'Doom Loop', frameType: 2 })
    expect(map).toMatchObject({ baseType: 'Cemetery Map', frameType: 1, mapTier: 14 })
    expect(card).toMatchObject({ typeLine: 'The Apothecary', frameType: 6, qty: 2 })
  })

  it('не ответ стэша → null', () => {
    expect(parseStashResponse(null)).toBeNull()
    expect(parseStashResponse({ error: { code: 6, message: 'Forbidden' } })).toBeNull()
  })

  it('разметка имён и группы гнёзд', () => {
    expect(cleanName('<<set:MS>><<set:M>><<set:S>>Kaom’s Heart')).toBe('Kaom’s Heart')
    expect(cleanName(5)).toBe('')
    expect(maxLinks([{ group: 0 }, { group: 0 }, { group: 1 }, { group: 1 }, { group: 1 }])).toBe(3)
    expect(maxLinks(undefined)).toBe(0)
  })
})

describe('вкладки «только изъятие»', () => {
  it('по имени: EN и RU', () => {
    expect(isRemoveOnlyName('Dump (Remove-only)')).toBe(true)
    expect(isRemoveOnlyName('Склад (только изъятие)')).toBe(true)
    expect(isRemoveOnlyName('Remove')).toBe(false)
    const r = parseStashResponse({ numTabs: 1, tabs: [{ n: '1 (Remove-only)', i: 0, id: 'abc123', type: 'PremiumStash' }], items: [] })
    expect(r?.tabs?.[0].removeOnly).toBe(true)
  })
})
