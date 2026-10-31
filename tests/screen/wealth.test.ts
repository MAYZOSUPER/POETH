import path from 'path'
import { describe, expect, it } from 'vitest'
import { buildPriceIndex, matchPrice } from '@shared/wealth/prices'
import { buildSnapshot, diffSnapshots, qtyProfit } from '@shared/wealth/snapshot'
import { recognizeStash } from '@shared/screen/recognize'
import { screenTabId, screenTabItems, stackItem } from '@shared/screen/wealth'
import type { ScreenCell, ScreenRead } from '@shared/types/screen'
import { readPng } from '../ocr/png'
import { embed, FIX, loadIcons, loadLayouts } from './helpers'

// Распознавание вкладки → TabItems «Богатства» (S68): те же StashItem, что у снимка тайника PoE 1, — оценка, разница
// снимков и прибыль считаются кодом src/shared/wealth без переделки (он здесь только вызывается).

const cell = (item: string | null, count: number | null, extra: Partial<ScreenCell> = {}): ScreenCell => ({
  rect: { x: 0, y: 0, width: 70, height: 70 },
  item,
  present: true,
  count,
  countSure: true,
  match: 0.9,
  ...extra
})

const read = (cells: ScreenCell[], tab: string | null = 'orbs'): ScreenRead => ({
  game: 'poe2',
  window: 'stash',
  tab,
  scale: 1,
  client: { width: 2560, height: 1440 },
  cells,
  at: 0,
  ms: { find: 0, match: 0, ocr: 0, total: 0 }
})

const index = buildPriceIndex([
  [
    { name: 'Divine Orb', kind: 'stackable', chaos: 400, source: 'exchange' },
    { name: 'Exalted Orb', kind: 'stackable', chaos: 1, source: 'exchange' },
    { name: 'Chaos Orb', kind: 'stackable', chaos: 5, source: 'exchange' }
  ]
])

describe('адаптер к «Богатству»', () => {
  it('стопочный предмет находит цену как у API тайника', () => {
    const m = matchPrice(stackItem('Divine Orb', 3), index)
    expect(m).toMatchObject({ ns: 'ITEM', name: 'Divine Orb', unit: 400 })
  })

  it('пустые, неузнанные, без числа и уровни без раскладки — мимо снимка, с подсчётом', () => {
    const r = screenTabItems(
      read(
        [
          cell('Divine Orb', 2),
          cell('Exalted Orb', 10, { countSure: false }),
          cell(null, 4),
          cell('Chaos Orb', null),
          cell('Chaos Orb', 1, { present: false }),
          cell('Greater Chaos Orb', 3, { alt: ['Chaos Orb', 'Perfect Chaos Orb'] })
        ],
        null
      )
    )
    // неуверенное число по умолчанию в снимок не идёт (ошибка бывает в разы)
    expect(r.tab.items.map((i) => [i.baseType, i.qty])).toEqual([['Divine Orb', 2]])
    expect(r.skipped).toEqual({ unknown: 1, ambiguous: 1, uncounted: 2 })
    expect(r.approx).toBe(false)
    expect(r.cells[0].cell.count).toBe(2)
    const loose = screenTabItems(read([cell('Exalted Orb', 10, { countSure: false })]), { sureOnly: false })
    expect(loose.tab.items[0].qty).toBe(10)
    expect(loose.approx).toBe(true)
    expect(screenTabItems(read([cell('Chaos Orb', null)]), { uncounted: 'one' }).tab.items[0].qty).toBe(1)
  })

  it('снимок, разница и прибыль — кодом «Богатства»', () => {
    const before = screenTabItems(read([cell('Divine Orb', 2), cell('Exalted Orb', 10)]))
    const after = screenTabItems(read([cell('Divine Orb', 3), cell('Exalted Orb', 4), cell('Chaos Orb', 20)]))
    expect(before.tab.id).toBe(after.tab.id)
    const s0 = buildSnapshot({ id: 'a', at: 0, league: 'L', tabs: [before.tab], index, divineRate: 400 })
    const s1 = buildSnapshot({ id: 'b', at: 1, league: 'L', tabs: [after.tab], index, divineRate: 400 })
    expect(s0.summary.chaos).toBe(810)
    expect(s1.summary.chaos).toBe(1304)
    expect(qtyProfit(s0, s1).chaos).toBe(400 - 6 + 100)
    expect(diffSnapshots(s0, s1).lines.length).toBeGreaterThan(0)
  })

  it('настоящий эталон PoE 2 «Орбы» → снимок', () => {
    const shot = embed(readPng(path.join(FIX, 'poe2/p2p-orbs-1440-gray.png')), 2560, 1440, 40, 240)
    const r = recognizeStash({ img: shot, clientHeight: 1440, icons: loadIcons('poe2'), layouts: loadLayouts('poe2') })
    const rd: ScreenRead = { ...read([]), cells: r.cells, tab: r.tab }
    // чисел здесь нет (без распознавателя) — каждая узнанная ячейка как одна штука
    const t = screenTabItems(rd, { uncounted: 'one' })
    expect(screenTabId(rd)).toBe('screen:poe2:stash:orbs')
    const names = t.tab.items.map((i) => i.baseType)
    expect(names).toContain('Divine Orb')
    expect(names).toContain('Perfect Exalted Orb')
    const s = buildSnapshot({ id: 'x', at: 0, league: 'L', tabs: [t.tab], index, divineRate: 400 })
    expect(s.lines.find((l) => l.name === 'Divine Orb')?.unit).toBe(400)
  }, 30_000)
})
