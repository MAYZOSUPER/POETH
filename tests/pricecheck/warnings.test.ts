import { describe, expect, it } from 'vitest'
import { honestPrice, normalizeListing } from '@shared/poe1/pricecheck/results'
import {
  CHEAP_WINDOW,
  VISIBLE_WARNINGS,
  WARNING_ORDER,
  broadWarning,
  checkedMods,
  corruptedWarning,
  fixingWarning,
  keptListings,
  linksWarning,
  oldWarning,
  priceWarnings,
  searchContext,
  variantWarning,
  type PriceWarning
} from '@shared/poe1/pricecheck/warnings'
import { createPriceCheck, type FilterPreset } from '@shared/poe1/pricecheck'
import { ItemRarity, parseItem, type ParsedItem } from '@shared/poe1/parser'
import { ModifierType } from '@shared/poe1/parser/modifiers'
import { readFixture, store } from '../poe1/helpers'
import { DAY, NOW, fetchItem, lot, text, type LotSpec } from './helpers'

/** n одинаковых лотов + m других. */
function mix(n: number, a: LotSpec, m: number, b: LotSpec) {
  return [
    ...Array.from({ length: n }, (_, i) => lot(`a${i}`, { amount: 10 + i, ...a })),
    ...Array.from({ length: m }, (_, i) => lot(`b${i}`, { amount: 20 + i, ...b }))
  ]
}

const unique = (over: Partial<ParsedItem> = {}) =>
  ({ rarity: ItemRarity.Unique, isFoulborn: false, newMods: [], unknownModifiers: [], ...over }) as Pick<
    ParsedItem,
    'rarity' | 'isFoulborn' | 'newMods' | 'unknownModifiers'
  >

describe('ответ fetch → поля лота для предупреждений', () => {
  it('связи — самая длинная группа гнёзд; флаги сайта только при true', () => {
    expect(lot('6l', { sockets: [6] })).toMatchObject({ links: 6, corrupted: false, foulborn: false, enchanted: false })
    expect(lot('4l', { sockets: [4, 2] }).links).toBe(4)
    expect(lot('x', { corrupted: true, mutated: true, enchant: true })).toMatchObject({ corrupted: true, foulborn: true, enchanted: true })
    expect(lot('none').links).toBeUndefined()
    // нет item в ответе — ничего не знаем
    const bare = normalizeListing({ id: 'b', listing: { account: { name: 'A' } } })
    expect(bare).toMatchObject({ corrupted: undefined, foulborn: undefined, enchanted: undefined, links: undefined })
    expect(normalizeListing({ ...fetchItem('s'), item: { sockets: [null, { group: 0 }] } }).links).toBe(1)
  })
})

describe('связи', () => {
  it('у вас 5L, у большинства лотов 6L — ваш дешевле (граница 60 %)', () => {
    const w = linksWarning({ sockets: { linked: 5, white: 0 } }, false, mix(3, { sockets: [6] }, 2, { sockets: [5] }))
    expect(w).toMatchObject({ kind: 'links', key: 'pc1.warn.links.more', params: { ours: '5', theirs: '6' } })
    expect(linksWarning({ sockets: { linked: 5, white: 0 } }, false, mix(2, { sockets: [6] }, 2, { sockets: [5] }))).toBeNull()
  })

  it('у вас меньше 5 связей (≤4), у лотов 6L', () => {
    const w = linksWarning({ sockets: { white: 0 } }, false, mix(4, { sockets: [6] }, 1, { sockets: [5] }))
    expect(w).toMatchObject({ key: 'pc1.warn.links.more', params: { ours: '≤4', theirs: '6' } })
    expect(text('ru', w!.key, w!.params)).toBe('Связей у вас ≤4, а у большинства лотов 6 — ваш предмет стоит дешевле.')
    expect(text('en', w!.key, w!.params)).toBe('Yours has ≤4 links, most listings have 6 — yours is worth less.')
    // 3L против 4L — для цены одно и то же
    expect(linksWarning({ sockets: { white: 0 } }, false, mix(4, { sockets: [4] }, 1, { sockets: [3] }))).toBeNull()
  })

  it('у вас 6L, у большинства меньше; фильтр снят — хватает 30 %', () => {
    const six = { sockets: { linked: 6, white: 0 } }
    expect(linksWarning(six, false, mix(3, { sockets: [5] }, 2, { sockets: [6] }))).toMatchObject({ key: 'pc1.warn.links.fewer' })
    expect(linksWarning(six, false, mix(2, { sockets: [5] }, 5, { sockets: [6] }))).toBeNull()
    const off = linksWarning(six, true, mix(3, { sockets: [4] }, 7, { sockets: [6] }))
    expect(off).toMatchObject({ key: 'pc1.warn.links.off', params: { ours: '6' } })
    expect(text('ru', off!.key, off!.params)).toContain('«Связи: 6»')
    expect(linksWarning(six, true, mix(2, { sockets: [4] }, 8, { sockets: [6] }))).toBeNull()
  })

  it('без гнёзд у предмета или мало лотов с гнёздами — молчим', () => {
    expect(linksWarning({}, false, mix(5, { sockets: [6] }, 0, {}))).toBeNull()
    expect(linksWarning({ sockets: { white: 0 } }, false, mix(2, { sockets: [6] }, 5, {}))).toBeNull()
  })
})

describe('осквернённость', () => {
  it('ваш не осквернён, а большинство лотов — да', () => {
    const w = corruptedWarning({ isCorrupted: false }, true, mix(3, { corrupted: true }, 2, {}))
    expect(w).toMatchObject({ kind: 'corrupted', key: 'pc1.warn.corrupted.theirs' })
    expect(corruptedWarning({ isCorrupted: true }, true, mix(1, { corrupted: true }, 4, {}))).toMatchObject({
      key: 'pc1.warn.corrupted.yours'
    })
  })
  it('совпадает или у предмета нет фильтра осквернённости (валюта и т.п.) — молчим', () => {
    expect(corruptedWarning({ isCorrupted: true }, true, mix(4, { corrupted: true }, 1, {}))).toBeNull()
    expect(corruptedWarning({ isCorrupted: false }, false, mix(5, { corrupted: true }, 0, {}))).toBeNull()
  })
})

describe('другой вариант уника', () => {
  it('Foulborn (`mutated`) у вас, а лоты обычные — и наоборот', () => {
    expect(variantWarning(unique({ isFoulborn: true }), mix(4, {}, 1, { mutated: true }))).toMatchObject({
      kind: 'variant',
      key: 'pc1.warn.foulborn.yours'
    })
    expect(variantWarning(unique(), mix(3, { mutated: true }, 2, {}))).toMatchObject({ key: 'pc1.warn.foulborn.theirs' })
    expect(variantWarning(unique(), mix(2, { mutated: true }, 3, {}))).toBeNull()
  })

  it('зачарование: у большинства лотов есть, у вашего нет', () => {
    expect(variantWarning(unique(), mix(4, { enchant: true }, 1, {}))).toMatchObject({ key: 'pc1.warn.enchant.theirs' })
    const enchanted = unique({
      newMods: [{ info: { type: ModifierType.Enchant, tags: [] }, stats: [] }]
    })
    expect(variantWarning(enchanted, mix(4, {}, 1, { enchant: true }))).toMatchObject({ key: 'pc1.warn.enchant.yours' })
    // Foulborn важнее зачарования
    expect(variantWarning(unique({ isFoulborn: true }), mix(5, { enchant: true }, 0, {}))).toMatchObject({
      key: 'pc1.warn.foulborn.yours'
    })
  })

  it('только для уников', () => {
    expect(variantWarning(unique({ rarity: ItemRarity.Rare }), mix(5, { mutated: true, enchant: true }, 0, {}))).toBeNull()
  })
})

describe('накрутка', () => {
  it('один-два продавца держат ≥ 80 % дешёвых лотов', () => {
    const list = [
      ...Array.from({ length: 5 }, (_, i) => lot(`x${i}`, { amount: 10 + i, account: 'X' })),
      ...Array.from({ length: 3 }, (_, i) => lot(`y${i}`, { amount: 15 + i, account: 'Y' })),
      lot('z', { amount: 20 }),
      lot('w', { amount: 21 })
    ]
    const w = fixingWarning(list)
    expect(w).toMatchObject({ kind: 'fixing', key: 'pc1.warn.fixing.few', params: { lots: 8, n: 10 } })
    expect(text('ru', w!.key, w!.params)).toBe('8 из 10 самых дешёвых лотов — у одного-двух продавцов: цену могут держать искусственно.')
    // 7 из 10 — ещё не «почти все» (и одинаковых по цене лотов нет)
    const seven = [...list.slice(0, 4), ...list.slice(5, 8), lot('a', { amount: 30 }), lot('b', { amount: 31 }), lot('c', { amount: 32 })]
    expect(fixingWarning(seven)).toBeNull()
  })

  it('один аккаунт — 3 лота по одной цене; обычная выдача (у каждого продавца по лоту) — молчим', () => {
    const same = [
      ...Array.from({ length: 3 }, (_, i) => lot(`s${i}`, { amount: 12, account: 'S' })),
      ...Array.from({ length: 7 }, (_, i) => lot(`o${i}`, { amount: 13 + i }))
    ]
    expect(fixingWarning(same)).toMatchObject({ key: 'pc1.warn.fixing.same', params: { n: 3 } })
    expect(fixingWarning(Array.from({ length: 10 }, (_, i) => lot(`n${i}`, { amount: 10 + i })))).toBeNull()
    // мало лотов — не судим
    expect(fixingWarning(Array.from({ length: 4 }, (_, i) => lot(`f${i}`, { amount: 10, account: 'F' })))).toBeNull()
  })

  it('смотрим только самые дешёвые лоты', () => {
    const list = [
      ...Array.from({ length: CHEAP_WINDOW }, (_, i) => lot(`n${i}`, { amount: 10 + i })),
      ...Array.from({ length: 5 }, (_, i) => lot(`x${i}`, { amount: 50, account: 'X' }))
    ]
    expect(fixingWarning(list)).toBeNull()
  })
})

describe('старые лоты', () => {
  it('большинство старше 7 дней (граница 60 %)', () => {
    const w = oldWarning(mix(3, { days: 8 }, 2, { days: 1 }), NOW)
    expect(w).toMatchObject({ kind: 'old', key: 'pc1.warn.old', params: { days: 7 } })
    expect(text('en', w!.key, w!.params)).toBe('Old listings: most are over 7 days old — nobody seems to buy at this price.')
    expect(oldWarning(mix(2, { days: 8 }, 3, { days: 1 }), NOW)).toBeNull()
    expect(oldWarning(mix(3, { days: 7 }, 0, {}), NOW - 1)).toBeNull()
    expect(oldWarning(mix(2, { days: 30 }, 0, {}), NOW)).toBeNull()
  })
})

describe('широкий поиск (вместе с inexact сайта)', () => {
  const rare = { rarity: ItemRarity.Rare, isUnidentified: false }
  it('у редкого сняты почти все свойства — меньше, чем было по умолчанию', () => {
    const w = broadWarning({ inexact: false, item: rare, mods: { on: 1, all: 6 }, defaultOn: 4 })
    expect(w).toMatchObject({ kind: 'broad', key: 'pc1.warn.broad.mods', params: { on: 1, all: 6 } })
    expect(text('ru', w!.key, w!.params)).toBe('Поиск широкий: отмечено 1 из 6 свойств — это цена похожих предметов, а не именно вашего.')
    expect(broadWarning({ inexact: false, item: rare, mods: { on: 2, all: 6 }, defaultOn: 4 })).toBeNull()
    // так отметили умолчания (у предмета нет сильных свойств) — не ругаемся
    expect(broadWarning({ inexact: false, item: rare, mods: { on: 1, all: 6 }, defaultOn: 1 })).toBeNull()
    expect(broadWarning({ inexact: false, item: rare, mods: { on: 0, all: 3 }, defaultOn: 3 })).toBeNull()
    expect(broadWarning({ inexact: false, item: { ...rare, rarity: ItemRarity.Unique }, mods: { on: 0, all: 6 }, defaultOn: 4 })).toBeNull()
  })

  it('inexact сайта — та же строка «поиск широкий», без дубля', () => {
    expect(broadWarning({ inexact: true, item: rare })).toMatchObject({ key: 'pc1.warn.broad.inexact' })
    expect(broadWarning({ inexact: true, item: rare, mods: { on: 0, all: 6 }, defaultOn: 4 })).toMatchObject({
      key: 'pc1.warn.broad.mods'
    })
  })

  it('счёт свойств по пресету реального редкого предмета (RU и EN)', async () => {
    const data = await store.ensureAll()
    for (const lang of ['ru', 'en'] as const) {
      const res = parseItem(readFixture(lang, 'adv-ring'), data)
      if (!res.ok) throw new Error(res.error)
      const pc = createPriceCheck(res.value, await store.ensureLanguage(lang), { league: 'Standard' })
      const preset = pc.presets.find((p) => p.id === pc.active)!
      const before = checkedMods(preset)
      expect(before.on).toBeGreaterThan(0)
      expect(before.all).toBeGreaterThanOrEqual(before.on)
      for (const s of preset.stats) if (!s.group) s.disabled = true
      expect(checkedMods(preset)).toEqual({ on: 0, all: before.all })
    }
  })
})

describe('все предупреждения вместе', () => {
  function preset(over: Partial<FilterPreset['filters']> = {}): Pick<FilterPreset, 'stats' | 'filters'> {
    return { stats: [], filters: { searchExact: {}, trade: {} as FilterPreset['filters']['trade'], ...over } }
  }

  it('порядок по важности, приманки не учитываются, больше двух — сворачиваются в UI', () => {
    const item = {
      rarity: ItemRarity.Unique,
      isCorrupted: false,
      isFoulborn: false,
      isUnidentified: false,
      sockets: { white: 0 },
      newMods: [],
      unknownModifiers: []
    } as unknown as ParsedItem
    const listings = [
      // приманка: дешёвый 6L не должен влиять
      lot('bait', { amount: 1, sockets: [4] }),
      ...Array.from({ length: 6 }, (_, i) => lot(`l${i}`, { amount: 20 + i, sockets: [6], corrupted: true, mutated: true, days: 10 }))
    ]
    const honest = honestPrice(listings, 30)
    expect(honest.person.outliers).toEqual(['bait'])
    expect(keptListings(listings, honest).map((l) => l.id)).not.toContain('bait')
    const ws = priceWarnings({
      item,
      ...searchContext(preset({ corrupted: { value: false } })),
      listings,
      honest,
      inexact: true,
      now: NOW
    })
    expect(ws.map((w) => w.kind)).toEqual(['links', 'variant', 'corrupted', 'broad', 'old'])
    expect(ws.map((w) => w.kind)).toEqual(WARNING_ORDER.filter((k) => ws.some((w) => w.kind === k)))
    expect(VISIBLE_WARNINGS).toBe(2)
  })

  it('снимок поиска: снятый фильтр связей, фильтр осквернённости, отмеченные свойства', () => {
    expect(searchContext(preset({ linkedSockets: { value: 6, disabled: true }, corrupted: { value: false } }))).toEqual({
      linksOff: true,
      corruptedFilter: true,
      mods: { on: 0, all: 0 }
    })
    expect(searchContext(preset({ linkedSockets: { value: 6, disabled: false } }))).toMatchObject({ linksOff: false, corruptedFilter: false })
  })

  it('обычная выдача без расхождений — ни одного предупреждения', () => {
    const item = { rarity: ItemRarity.Rare, isCorrupted: false, isUnidentified: false, newMods: [], unknownModifiers: [] } as unknown as ParsedItem
    const listings = Array.from({ length: 10 }, (_, i) => lot(`n${i}`, { amount: 10 + i, days: 2 }))
    expect(priceWarnings({ item, ...searchContext(preset({ corrupted: { value: false } })), listings, inexact: false, now: NOW })).toEqual([])
  })

  it('все ключи и подсказки есть в RU и EN, без неподставленных параметров', () => {
    const all: PriceWarning[] = [
      { kind: 'links', key: 'pc1.warn.links.more', params: { ours: '5', theirs: '6' }, help: 'pc1.warn.links.help' },
      { kind: 'links', key: 'pc1.warn.links.fewer', params: { ours: '6' } },
      { kind: 'links', key: 'pc1.warn.links.off', params: { ours: '6' } },
      { kind: 'corrupted', key: 'pc1.warn.corrupted.yours', help: 'pc1.warn.corrupted.help' },
      { kind: 'corrupted', key: 'pc1.warn.corrupted.theirs' },
      { kind: 'variant', key: 'pc1.warn.foulborn.yours', help: 'pc1.warn.foulborn.help' },
      { kind: 'variant', key: 'pc1.warn.foulborn.theirs' },
      { kind: 'variant', key: 'pc1.warn.enchant.yours', help: 'pc1.warn.enchant.help' },
      { kind: 'variant', key: 'pc1.warn.enchant.theirs' },
      { kind: 'broad', key: 'pc1.warn.broad.mods', params: { on: 1, all: 6 } },
      { kind: 'broad', key: 'pc1.warn.broad.inexact' },
      { kind: 'fixing', key: 'pc1.warn.fixing.few', params: { lots: 8, n: 10 }, help: 'pc1.warn.fixing.help' },
      { kind: 'fixing', key: 'pc1.warn.fixing.same', params: { n: 3 } },
      { kind: 'old', key: 'pc1.warn.old', params: { days: 7 }, help: 'pc1.warn.old.help' }
    ]
    for (const lang of ['ru', 'en'] as const) {
      for (const w of all) {
        expect(text(lang, w.key, w.params), `${lang}:${w.key}`).not.toMatch(/\{\w+\}/)
        if (w.help) expect(text(lang, w.help)).toBeTruthy()
      }
      expect(text(lang, 'pc1.warn.more', { n: 2 })).toMatch(/2/)
      expect(text(lang, 'pc1.warn.less')).toBeTruthy()
    }
    // RU: имя Foulborn — как в русском клиенте («Нечестивый»)
    expect(text('ru', 'pc1.warn.foulborn.help')).toContain('Нечестивое уникальное свойство')
    expect(text('en', 'pc1.warn.foulborn.help')).toContain('Foulborn Unique Modifier')
    expect(DAY).toBe(86_400_000)
  })
})
