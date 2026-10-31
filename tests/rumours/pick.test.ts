import { describe, expect, it } from 'vitest'
import { pickRumour } from '@shared/rumours/pick'
import { EMPTY_PRICE_BOOK, type RumourPriceBook } from '@shared/rumours/prices'
import { bundled, rec } from './fixtures'

// «Бери …, потому что …» (S65): тир игрока → наш тир → цена главной награды → безопасность.

const item = (ref: string) => ({ item: { ns: 'ITEM' as const, ref, meta: null, name: { en: ref, ru: null } } })

describe('pickRumour на встроенных данных', () => {
  const list = bundled().rumours

  it('«Упавшие звёзды» против двух ●●○ — наш тир выше', () => {
    const p = pickRumour(list, ['cold-as-ice', 'fallen-stars', 'sulphite'])
    expect(p.best).toBe('fallen-stars')
    expect(p.why).toEqual({ kind: 'tier', than: expect.any(String) })
    expect(p.ranked.map((r) => r.id)[0]).toBe('fallen-stars')
  })

  it('пометка игрока: свой ●●● у «Сульфит!» и «не беру» у «Упавших звёзд»', () => {
    const marks = {
      sulphite: { tier: 3 as const, skip: false, note: null },
      'fallen-stars': { tier: null, skip: true, note: 'нет билда' }
    }
    const p = pickRumour(list, ['cold-as-ice', 'fallen-stars', 'sulphite'], marks)
    expect(p.best).toBe('sulphite')
    expect(p.why).toEqual({ kind: 'own' })
    expect(p.ranked.at(-1)).toMatchObject({ id: 'fallen-stars', skipped: true })
  })

  it('все «не беру» — выбирать не из чего', () => {
    const skip = { tier: null, skip: true, note: null }
    const p = pickRumour(list, ['sulphite', 'cold-as-ice'], { sulphite: skip, 'cold-as-ice': skip })
    expect(p.best).toBe(null)
    expect(p.why).toBe(null)
  })

  it('один слух — «single», ничего не выбрано — пусто, неизвестный id пропускаем', () => {
    expect(pickRumour(list, ['sulphite']).why).toEqual({ kind: 'single' })
    expect(pickRumour(list, []).best).toBe(null)
    expect(pickRumour(list, ['nope', 'sulphite']).ranked.map((r) => r.id)).toEqual(['sulphite'])
  })
})

describe('pickRumour: цена и риск', () => {
  const a = rec('aa-a', { rewards: [item('A')], risks: ['boss'], difficulty: 3 })
  const b = rec('bb-b', { rewards: [item('B')], difficulty: 1 })
  const c = rec('cc-c', { tier: null })
  const book = (pa: number | null, pb: number | null): RumourPriceBook => ({
    ...EMPTY_PRICE_BOOK,
    league: 'Rise of the Abyssal',
    rates: { divineInExalted: 500, chaosInExalted: null },
    quotes: {
      ...(pa !== null ? { 'ITEM:A': { value: pa, unit: 'exalted' as const, source: 'stub' as const, at: null } } : {}),
      ...(pb !== null ? { 'ITEM:B': { value: pb, unit: 'divine' as const, source: 'stub' as const, at: null } } : {})
    }
  })

  it('равный тир — решает заметно более дорогая награда (divine пересчитаны в exalted)', () => {
    const p = pickRumour([a, b], ['aa-a', 'bb-b'], {}, book(100, 2))
    expect(p.best).toBe('bb-b')
    expect(p.why).toEqual({ kind: 'price', than: 'aa-a' })
    expect(p.ranked[0].priceEx).toBe(1000)
  })

  it('цены почти равны (±15 %) — решает безопасность, а не копейки', () => {
    const p = pickRumour([a, b], ['aa-a', 'bb-b'], {}, book(1050, 2))
    expect(p.best).toBe('bb-b')
    expect(p.why).toEqual({ kind: 'safer', than: 'aa-a' })
  })

  it('цен нет — решает безопасность; совсем равны — «любой»', () => {
    expect(pickRumour([a, b], ['aa-a', 'bb-b']).why).toEqual({ kind: 'safer', than: 'aa-a' })
    const twin = rec('dd-d')
    const p = pickRumour([twin, rec('ee-e')], ['dd-d', 'ee-e'])
    expect(p.best).toBe('dd-d')
    expect(p.why).toEqual({ kind: 'equal', than: 'ee-e' })
  })

  it('неоценённый слух лучшим не становится, но и не «не беру»', () => {
    const p = pickRumour([b, c], ['cc-c', 'bb-b'])
    expect(p.best).toBe('bb-b')
    expect(p.why).toEqual({ kind: 'only' })
    expect(p.ranked.map((r) => r.id)).toEqual(['bb-b', 'cc-c'])
  })

  it('тир всегда важнее цены', () => {
    const cheap3 = rec('ff-f', { tier: 3, rewards: [item('A')] })
    const p = pickRumour([cheap3, b], ['bb-b', 'ff-f'], {}, book(1, 50))
    expect(p.best).toBe('ff-f')
    expect(p.why).toEqual({ kind: 'tier', than: 'bb-b' })
  })
})
