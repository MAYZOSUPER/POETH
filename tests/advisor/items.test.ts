import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { buildItemCatalog, searchItems, type ItemRecord } from '@shared/advisor/items'

// Поиск предмета в редакторе (S17): по русскому или английскому имени, в стратегию — английский ref.

const DATA = resolve(__dirname, '../../resources/data/poe1')

describe('советник: поиск предмета для редактора', () => {
  const records: ItemRecord[] = [
    { name: 'Скарабей Засады', refName: 'Ambush Scarab', namespace: 'ITEM', exchangeable: true },
    { name: 'Скарабей Засады могущества', refName: 'Ambush Scarab of Potency', namespace: 'ITEM', exchangeable: true },
    { name: 'Сфера хаоса', refName: 'Chaos Orb', namespace: 'ITEM', exchangeable: true },
    { name: 'Сфера хаоса', refName: 'Chaos Orb', namespace: 'ITEM', exchangeable: true }, // повтор
    { name: 'Двуручный меч', refName: 'Two-Handed Sword', namespace: 'ITEM' }, // не обменный — не нужен
    { name: 'Дом', refName: 'House', namespace: 'DIVINATION_CARD' },
    { name: 'Кладбище', refName: 'Cemetery', namespace: 'AREA' }
  ]
  const cat = buildItemCatalog(records, ['Chaos Orb', 'New League Shard'])

  it('кандидаты: обменные предметы, карты; новые имена фида без русского имени', () => {
    expect(cat).toEqual([
      { ref: 'Ambush Scarab', ru: 'Скарабей Засады', kind: 'stackable' },
      { ref: 'Ambush Scarab of Potency', ru: 'Скарабей Засады могущества', kind: 'stackable' },
      { ref: 'Chaos Orb', ru: 'Сфера хаоса', kind: 'stackable' },
      { ref: 'House', ru: 'Дом', kind: 'card' },
      { ref: 'New League Shard', kind: 'stackable' }
    ])
  })

  it('по-русски и по-английски, без учёта регистра и ё; сначала начало имени', () => {
    expect(searchItems(cat, 'скарабей засад').map((c) => c.ref)).toEqual(['Ambush Scarab', 'Ambush Scarab of Potency'])
    expect(searchItems(cat, 'AMBUSH').map((c) => c.ref)).toEqual(['Ambush Scarab', 'Ambush Scarab of Potency'])
    expect(searchItems(cat, 'хаоса').map((c) => c.ref)).toEqual(['Chaos Orb'])
    expect(searchItems(cat, 'potency').map((c) => c.ref)).toEqual(['Ambush Scarab of Potency'])
    expect(searchItems(cat, 'shard')[0]).toEqual({ ref: 'New League Shard', kind: 'stackable' })
    expect(searchItems(cat, 'с')).toEqual([])
    expect(searchItems(cat, 'нет такого')).toEqual([])
  })

  it('на настоящих данных: скарабей засады находится по-русски, ref — английский', () => {
    const lines = readFileSync(resolve(DATA, 'ru/items.ndjson'), 'utf8').split('\n').filter(Boolean)
    const ex = Object.values(JSON.parse(readFileSync(resolve(DATA, 'wealth/exchange-ids.json'), 'utf8')).names as Record<string, string>)
    const real = buildItemCatalog(lines.map((l) => JSON.parse(l) as ItemRecord), ex)
    const hit = searchItems(real, 'скарабей засад')
    expect(hit.length).toBeGreaterThan(0)
    expect(hit[0].ref).toMatch(/^Ambush Scarab/)
    expect(searchItems(real, 'Essence Scarab')[0].ref).toBe('Essence Scarab')
    // предметы обмена выше камней и уников: «засад» — скарабей, а не камень «Засада»
    expect(searchItems(real, 'засад')[0]).toMatchObject({ kind: 'stackable', ref: expect.stringMatching(/^Ambush Scarab/) })
  })
})
