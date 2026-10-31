import { describe, expect, it } from 'vitest'
import { priceNumber, rumourRow, rumoursOn } from '@shared/rumours/view'
import { EMPTY_PRICE_BOOK } from '@shared/rumours/prices'
import { bundled } from './fixtures'

// Строка слуха для окна (S65): имена из игры — на языке клиента, наша строка — на языке интерфейса.

const list = bundled().rumours
const fs = list.find((r) => r.id === 'fallen-stars')!
const book = {
  ...EMPTY_PRICE_BOOK,
  league: 'Rise of the Abyssal',
  rates: { divineInExalted: 500, chaosInExalted: null },
  quotes: { 'ITEM:Perfect Flux': { value: 12500, unit: 'exalted' as const, source: 'exchange' as const, at: null } }
}

describe('rumourRow', () => {
  it('RU-клиент, RU-интерфейс: слух, остров и награда по-русски, цена в div', () => {
    const v = rumourRow(fs, 'ru', 'ru', undefined, book)
    expect(v.text).toBe('Упавшие звёзды...')
    expect(v.island).toBe('Причал Падших небес')
    expect(v.main?.name).toBe('Совершенный расплав')
    expect(v.price).toEqual({ value: 25, unit: 'divine' })
    expect(v.more).toEqual([{ name: null, kind: 'verisium', price: null }])
    expect(v.note).toMatch(/^Большая экспедиция/)
  })

  it('EN-клиент, RU-интерфейс: имена из игры по-английски, наша строка по-русски', () => {
    const v = rumourRow(fs, 'en', 'ru', { tier: 1, skip: true, note: 'нет билда' }, null)
    expect(v.text).toBe('Fallen stars...')
    expect(v.main?.name).toBe('Perfect Flux')
    expect(v.price).toBe(null)
    expect(v.note).toMatch(/^Большая экспедиция/)
    expect(v).toMatchObject({ ownTier: 1, skip: true, ownNote: 'нет билда', tier: 3 })
  })

  it('EN-интерфейс: наша строка по-английски; боссы на языке клиента', () => {
    const olroth = list.find((r) => r.id === 'origin-of-the-fall')!
    const v = rumourRow(olroth, 'ru', 'en', undefined, null)
    expect(v.note).toMatch(/^Fight Olroth/)
    expect(v.bosses).toEqual(['Олрот, Исток падения'])
    expect(v.priceItem).toBe('Ключ от Реликвария Олрота')
  })

  it('главная награда — не предмет: цена — у первой награды-предмета', () => {
    const fishy = list.find((r) => r.id === 'somethin-fishy')!
    const v = rumourRow(fishy, 'en', 'en', undefined, null)
    expect(v.main).toEqual({ name: null, kind: 'gold', price: null })
    expect(v.priceItem).toBe('Pearlescent Amulet')
  })
})

describe('мелочи', () => {
  it('слухи только в PoE 2', () => {
    expect(rumoursOn('poe2')).toBe(true)
    expect(rumoursOn('poe1')).toBe(false)
  })
  it('число цены по языку', () => {
    expect(priceNumber({ value: 2.5, unit: 'divine' }, 'ru')).toBe('2,5')
    expect(priceNumber({ value: 2.5, unit: 'divine' }, 'en')).toBe('2.5')
  })
})
