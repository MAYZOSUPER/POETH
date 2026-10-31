import { describe, expect, it } from 'vitest'
import type { Poe1Listing } from '@shared/poe1/pricecheck/results'
import { parseClipboard } from '@shared/poe2/parser'
import { ItemRarity } from '@shared/poe2/parser/ParsedItem'
import { createPriceCheck } from '@shared/poe2/pricecheck'
import { checkedMods2, hasStrongWarning, poe2Warnings, searchContext2 } from '@shared/poe2/pricecheck/warnings'
import { readFixture, store } from './helpers'

// S61 (хвост S47): предупреждения окна цены PoE 2 «цена может быть не про ваш предмет» — как S15 у PoE 1.

const NOW = Date.parse('2026-10-31T21:00:00.000Z')
let seq = 0
function lot(p: Partial<Poe1Listing> = {}): Poe1Listing {
  return { id: `l${++seq}`, kind: 'instant', price: { amount: 10 + seq, currency: 'exalted' }, accountName: `a${seq}`, online: 'online', indexed: '2026-10-31T20:00:00.000Z', corrupted: false, ...p }
}
const rare = { isCorrupted: false, rarity: ItemRarity.Rare, isUnidentified: false }
const ctx = { corruptedFilter: true, mods: { on: 3, all: 5 } }

describe('предупреждения PoE 2', () => {
  it('осквернённость не как у большинства лотов — сильное предупреждение (заметку цены не даём)', () => {
    const lots = Array.from({ length: 5 }, () => lot({ corrupted: true }))
    const ws = poe2Warnings({ item: rare, ...ctx, listings: lots, inexact: false, now: NOW })
    expect(ws.map((w) => w.key)).toEqual(['pc1.warn.corrupted.theirs'])
    expect(hasStrongWarning(ws)).toBe(true)
    // у предмета нет фильтра осквернённости — не судим
    expect(poe2Warnings({ item: rare, ...ctx, corruptedFilter: false, listings: lots, inexact: false, now: NOW })).toEqual([])
  })

  it('широкий поиск редкого: снято почти всё — «отмечено 1 из 5»; сайт добавил похожие — inexact', () => {
    const lots = Array.from({ length: 5 }, () => lot())
    const ws = poe2Warnings({ item: rare, corruptedFilter: false, mods: { on: 1, all: 5 }, defaultOn: 3, listings: lots, inexact: false, now: NOW })
    expect(ws).toEqual([{ kind: 'broad', key: 'pc1.warn.broad.mods', params: { on: 1, all: 5 } }])
    expect(poe2Warnings({ item: rare, ...ctx, listings: lots, inexact: true, now: NOW })[0].key).toBe('pc1.warn.broad.inexact')
    expect(hasStrongWarning(ws)).toBe(false)
  })

  it('накрутка и старые лоты — по самым дешёвым', () => {
    const fixed = Array.from({ length: 6 }, () => lot({ accountName: 'one' }))
    expect(poe2Warnings({ item: rare, ...ctx, listings: fixed, inexact: false, now: NOW }).map((w) => w.kind)).toContain('fixing')
    const old = Array.from({ length: 5 }, () => lot({ indexed: '2026-10-01T00:00:00.000Z' }))
    expect(poe2Warnings({ item: rare, ...ctx, listings: old, inexact: false, now: NOW }).map((w) => w.kind)).toEqual(['old'])
  })

  it('счётчик свойств пресета одинаков на RU и EN клиенте; есть фильтр осквернённости', async () => {
    const counts: Array<{ on: number; all: number }> = []
    for (const lang of ['en', 'ru'] as const) {
      const d = await store.ensureLanguage(lang)
      const parsed = parseClipboard(readFixture(lang, 'ee2-ring-implicit'), d)
      if (!parsed.ok) throw new Error(parsed.error)
      const pc = createPriceCheck(parsed.value, d, { league: 'Standard' })
      const preset = pc.presets.find((p) => p.id === pc.active)!
      counts.push(checkedMods2(preset))
      expect(searchContext2(preset).corruptedFilter, lang).toBe(true)
    }
    expect(counts[0]).toEqual(counts[1])
    // сопротивления у кольца уходят в псевдо-свойства — их в счётчик не берём
    expect(counts[0].all).toBeGreaterThanOrEqual(2)
  })
})
