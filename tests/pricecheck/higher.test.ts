// S24: страховка «цена может быть выше» — широкий поиск редкого, низкая цена, неотмеченные ценные свойства.
import { describe, expect, it } from 'vitest'
import { ItemRarity } from '@shared/poe1/parser'
import type { FilterPreset, StatFilter } from '@shared/poe1/pricecheck'
import { HIGHER_MAX_SUGGEST, priceMayBeHigher, uncheckedValuable } from '@shared/poe1/pricecheck/higher'

/** Фильтр свойства: только поля, которые смотрит страховка. */
function f(text: string, o: { tag?: string; tier?: number; on?: boolean; hidden?: boolean; not?: boolean } = {}): StatFilter {
  return {
    tradeId: [`explicit.${text}`],
    statRef: text,
    text,
    tag: (o.tag ?? 'explicit') as StatFilter['tag'],
    sources: (o.tier ? [{ modifier: { info: { tier: o.tier } } }] : []) as unknown as StatFilter['sources'],
    disabled: !o.on,
    ...(o.hidden ? { hidden: 'pc1.hidden.reason' } : {}),
    ...(o.not ? { not: true as const } : {})
  }
}

// кольцо из rc.8: гнездо и мана не отмечены, лёгкие T5 — тоже
const socket = f('Has # Socket', { tag: 'implicit' })
const evasion = f('+# to Evasion Rating', { tier: 5 })
const lightning = f('Adds # to # Lightning Damage to Attacks', { tier: 5 })
const res = f('+#% total Elemental Resistance', { tag: 'pseudo', on: true })
const mana = f('+# total maximum Mana', { tag: 'pseudo' })
const cast = f('#% increased Cast Speed', { tier: 2, on: true })
const hidden = f('hidden', { hidden: true })
const base = f('Armour', { tag: 'property' })
const preset = { stats: [socket, evasion, lightning, res, mana, cast, hidden, base] } as unknown as FilterPreset

const rare = { rarity: ItemRarity.Rare, isUnidentified: false }

describe('цена может быть выше', () => {
  it('предлагаем неотмеченные видимые ценные: псевдо, без тира, хорошие тиры; слабые T4+, скрытые, база — нет', () => {
    expect(uncheckedValuable(preset)).toEqual([mana, socket])
    const t2 = f('+# to maximum Life', { tier: 2 })
    expect(uncheckedValuable({ stats: [t2, mana] } as unknown as FilterPreset)).toEqual([mana, t2])
  })

  it('кольцо за «1 alch» при 10 000 похожих — «не отмечены мана, гнездо»', () => {
    const h = priceMayBeHigher({ item: rare, total: 10000, chaos: 0.15, unchecked: uncheckedValuable(preset) })
    expect(h?.filters).toEqual([mana, socket])
    expect(h?.more).toBe(0)
  })

  it('не показываем: цена не низкая, похожих мало, цена неизвестна, не редкий, нечего отмечать', () => {
    const unchecked = uncheckedValuable(preset)
    expect(priceMayBeHigher({ item: rare, total: 10000, chaos: 20, unchecked })).toBeUndefined()
    expect(priceMayBeHigher({ item: rare, total: 48, chaos: 1, unchecked })).toBeUndefined()
    expect(priceMayBeHigher({ item: rare, total: 10000, chaos: undefined, unchecked })).toBeUndefined()
    expect(priceMayBeHigher({ item: { rarity: ItemRarity.Unique, isUnidentified: false }, total: 10000, chaos: 1, unchecked })).toBeUndefined()
    expect(priceMayBeHigher({ item: { ...rare, isUnidentified: true }, total: 10000, chaos: 1, unchecked })).toBeUndefined()
    expect(priceMayBeHigher({ item: rare, total: 10000, chaos: 1, unchecked: [] })).toBeUndefined()
  })

  it('отметили сами — строка уходит; больше трёх — «и ещё N»', () => {
    const many = Array.from({ length: 5 }, (_, i) => f(`mod ${i}`, { tag: 'pseudo' }))
    const h = priceMayBeHigher({ item: rare, total: 500, chaos: 2, unchecked: many })!
    expect(h.filters).toHaveLength(HIGHER_MAX_SUGGEST)
    expect(h.more).toBe(2)
    for (const x of many) x.disabled = false
    expect(priceMayBeHigher({ item: rare, total: 500, chaos: 2, unchecked: many })).toBeUndefined()
  })
})
