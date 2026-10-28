import { describe, expect, it } from 'vitest'
import { buildSnapshot, diffSnapshots, lineKey } from '../../src/shared/wealth/snapshot'
import { buildPriceIndex, type PriceEntry } from '../../src/shared/wealth/prices'
import type { StashItem } from '../../src/shared/wealth/stash'

function item(p: Partial<StashItem>): StashItem {
  return { name: '', typeLine: '', baseType: '', frameType: 0, qty: 1, identified: true, corrupted: false, links: 0, ...p }
}
const cur = (name: string, qty: number): StashItem => item({ typeLine: name, baseType: name, frameType: 5, qty })

const entries: PriceEntry[] = [
  { name: 'Chaos Orb', kind: 'stackable', chaos: 1, source: 'exchange' },
  { name: 'Divine Orb', kind: 'stackable', chaos: 300, source: 'exchange' },
  { name: 'Vaal Grace', kind: 'gem', chaos: 90, gemLevel: 21, gemQuality: 20, corrupted: true, source: 'poewatch' }
]
const index = buildPriceIndex([entries])

describe('снимок', () => {
  const snap = buildSnapshot({
    id: 'abc123-0001',
    at: 1000,
    league: 'Allflame',
    index,
    divineRate: 300,
    tabs: [
      { id: 't0', name: 'Валюта', items: [cur('Chaos Orb', 150), cur('Divine Orb', 2)] },
      {
        id: 't1',
        name: 'Свалка',
        items: [
          cur('Chaos Orb', 50),
          item({ typeLine: 'Vaal Grace', baseType: 'Vaal Grace', frameType: 4, gemLevel: 21, gemQuality: 20, corrupted: true }),
          item({ name: 'Doom Loop', typeLine: 'Amethyst Ring', baseType: 'Amethyst Ring', frameType: 2 })
        ]
      }
    ]
  })

  it('одинаковые предметы со всех вкладок — одна строка; итоги по вкладкам и общий', () => {
    expect(snap.summary).toMatchObject({ chaos: 890, divineRate: 300, priced: 3, unpriced: 1, league: 'Allflame' })
    expect(snap.summary.tabs).toEqual([
      { id: 't0', name: 'Валюта', chaos: 750, items: 152, unpriced: 0 },
      { id: 't1', name: 'Свалка', chaos: 140, items: 52, unpriced: 1 }
    ])
    expect(snap.lines.map((l) => [l.name, l.qty, l.total])).toEqual([
      ['Divine Orb', 2, 600],
      ['Chaos Orb', 200, 200],
      ['Vaal Grace', 1, 90],
      ['Amethyst Ring', 1, 0]
    ])
    expect(snap.lines[2]).toMatchObject({ gemLevel: 21, gemQuality: 20, corrupted: true, source: 'poewatch' })
    expect(snap.lines[3].reason).toBe('rare')
  })

  it('ключ строки различает линки, уровень/качество камня, ярус и осквернение', () => {
    expect(lineKey('UNIQUE', 'Tabula Rasa', item({ links: 6 }))).not.toBe(lineKey('UNIQUE', 'Tabula Rasa', item({ links: 4 })))
    expect(lineKey('GEM', 'Vaal Grace', item({ gemLevel: 20, gemQuality: 20 }))).not.toBe(
      lineKey('GEM', 'Vaal Grace', item({ gemLevel: 20, gemQuality: 20, corrupted: true }))
    )
    expect(lineKey('ITEM', 'Cemetery Map', item({ mapTier: 14 }))).toBe('ITEM|Cemetery Map|T14')
  })

  it('«что прибавилось»: разница штук и стоимости, пропавшее — минусом', () => {
    const later = buildSnapshot({
      id: 'abc124-0002',
      at: 2000,
      league: 'Allflame',
      index,
      divineRate: 300,
      tabs: [{ id: 't0', name: 'Валюта', items: [cur('Chaos Orb', 260), cur('Divine Orb', 3)] }]
    })
    const d = diffSnapshots(snap, later)
    expect(d.chaosDelta).toBe(1160 - 890)
    expect(d.lines.map((l) => [l.name, l.qtyDelta, l.chaosDelta])).toEqual([
      ['Divine Orb', 1, 300],
      ['Vaal Grace', -1, -90],
      ['Chaos Orb', 60, 60],
      ['Amethyst Ring', -1, 0]
    ])
  })
})
