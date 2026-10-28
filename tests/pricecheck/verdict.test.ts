import { describe, expect, it } from 'vitest'
import { honestPrice, type Poe1Listing } from '@shared/poe1/pricecheck/results'
import { chaosRates, toChaos } from '@shared/poe1/pricecheck/currency'
import {
  EXPENSIVE_CHAOS,
  JUNK_CHAOS,
  displayPrice,
  niceChaos,
  niceDivine,
  noVendor,
  priceNote,
  priceVerdict,
  referencePrice,
  type Verdict
} from '@shared/poe1/pricecheck/verdict'
import { ItemCategory } from '@shared/poe1/parser'
import { lot, lots, text } from './helpers'

const RATE = 200

function trade(listings: Poe1Listing[], total = listings.length, opts: { rate?: number; noVendor?: boolean } = {}): Verdict {
  const rate = 'rate' in opts ? opts.rate : RATE
  return priceVerdict({
    kind: 'trade',
    total,
    listings,
    honest: honestPrice(listings, total, chaosRates(rate)),
    chaosPerDivine: rate,
    noVendor: opts.noVendor ?? false
  })
}

describe('округление до понятных чисел', () => {
  it('chaos: десятые до 1, целые до 20, по 5 до 100, по 10 до 1000', () => {
    expect([0.04, 0.44, 1.4, 13.6, 22, 23, 97, 142, 1234].map(niceChaos)).toEqual([0.1, 0.4, 1, 14, 20, 25, 95, 140, 1250])
  })
  it('divine: десятые до 3, по 0.5 до 10, целые до 100', () => {
    expect([1.04, 1.37, 2.96, 4.3, 4.8, 37.4, 123].map(niceDivine)).toEqual([1, 1.4, 3, 4.5, 5, 37, 125])
  })
  it('от 1 div по курсу — в divine, ниже — в chaos; без курса divine остаётся divine', () => {
    expect(displayPrice({ amount: 260, currency: 'chaos' }, 260, RATE)).toEqual({ amount: 1.3, currency: 'divine' })
    expect(displayPrice({ amount: 199, currency: 'chaos' }, 199, RATE)).toEqual({ amount: 200, currency: 'chaos' })
    expect(displayPrice({ amount: 0.8, currency: 'divine' }, 160, RATE)).toEqual({ amount: 160, currency: 'chaos' })
    expect(displayPrice({ amount: 1.33, currency: 'divine' }, undefined, undefined)).toEqual({ amount: 1.3, currency: 'divine' })
    expect(displayPrice({ amount: 3, currency: 'exalted' }, undefined, RATE)).toEqual({ amount: 3, currency: 'exalted' })
  })
  it('chaos-эквивалент: divine по курсу, прочее — неизвестно', () => {
    expect(toChaos({ amount: 2, currency: 'divine' }, RATE)).toBe(400)
    expect(toChaos({ amount: 2, currency: 'divine' }, undefined)).toBeUndefined()
    expect(toChaos({ amount: 2, currency: 'exalted' }, RATE)).toBeUndefined()
    expect(chaosRates(0)).toBeUndefined()
  })
})

describe('заметка цены (EN и RU клиент — одна и та же строка)', () => {
  it('~price, точка в дробях, id валюты сайта', () => {
    expect(priceNote({ amount: 25, currency: 'chaos' })).toBe('~price 25 chaos')
    expect(priceNote({ amount: 1.5, currency: 'divine' })).toBe('~price 1.5 divine')
    expect(priceNote({ amount: 0.30000000000000004, currency: 'chaos' })).toBe('~price 0.3 chaos')
  })
})

describe('рекомендованная цена — самый дешёвый честный лот', () => {
  it('меньший из минимумов «Купить сейчас» и «По whisper», сравнение по курсу', () => {
    const h = honestPrice([lot('a', { amount: 1, currency: 'divine', instant: true }), lot('b', { amount: 150 })], 2, chaosRates(RATE))
    expect(referencePrice(h, RATE)).toEqual({ amount: 150, currency: 'chaos' })
    // без курса разные валюты не сравнить — берём мгновенный выкуп
    const h2 = honestPrice([lot('a', { amount: 1, currency: 'divine', instant: true }), lot('b', { amount: 150 })], 2)
    expect(referencePrice(h2)).toEqual({ amount: 1, currency: 'divine' })
  })

  it('приманка (выброс) в цену не идёт', () => {
    const v = trade(lots([2, 20, 21, 22, 23, 25, 30, 31, 32, 33]), 30)
    expect(v).toMatchObject({ kind: 'list', price: { amount: 20, currency: 'chaos' }, note: '~price 20 chaos' })
  })
})

describe('вердикт', () => {
  it('0 лотов — «таких никто не продаёт», а не «ничего не стоит»', () => {
    expect(trade([], 0)).toEqual({ kind: 'none', count: 0, confidence: 0 })
    expect(text('ru', 'pc1.v.none')).toBe('Таких никто не продаёт')
    expect(text('ru', 'pc1.v.none.sub')).toContain('снимите галочки')
    expect(text('en', 'pc1.v.none.sub')).toContain('uncheck some of the mods')
    for (const lang of ['ru', 'en'] as const) expect(text(lang, 'pc1.v.none.sub')).not.toMatch(/ничего не стоит\.|worthless\./)
  })

  it('«выставьте за ~X»: обычный предмет с хорошей точностью, кнопка заметки', () => {
    const v = trade(lots([13.6, 14, 15, 15, 16, 18]), 12)
    expect(v).toMatchObject({ kind: 'list', price: { amount: 14, currency: 'chaos' }, confidence: 3, note: '~price 14 chaos' })
    expect(text('ru', 'pc1.v.list', { price: '14 chaos' })).toBe('Выставьте за ~14 chaos')
    expect(text('en', 'pc1.v.list', { price: '14 chaos' })).toBe('List it for ~14 chaos')
  })

  it('граница «хлама»: 0.9 c — хлам, ровно 1 c — уже выставлять', () => {
    expect(trade(lots([0.9, 1, 1, 1, 1]), 10)).toMatchObject({ kind: 'junk', price: { amount: 0.9 } })
    expect(trade(lots([JUNK_CHAOS, 1, 1, 1, 1]), 10)).toMatchObject({ kind: 'list', price: { amount: 1 } })
    expect(text('ru', 'pc1.v.junk')).toBe('Хлам — продайте торговцу в городе')
    expect(text('en', 'pc1.v.junk')).toBe('Junk — sell it to a vendor in town')
  })

  it('«хлам» только при достаточной точности: 3 лота по 0.5 c — «мало данных»', () => {
    expect(trade(lots([0.5, 0.5, 0.5]), 3)).toMatchObject({ kind: 'few', confidence: 1 })
  })

  it('валюта и стопки: «торговцу» не говорим', () => {
    expect(trade(lots([0.3, 0.3, 0.4, 0.4, 0.5]), 40, { noVendor: true })).toMatchObject({ kind: 'cheap' })
    expect(noVendor({ category: ItemCategory.Currency })).toBe(true)
    expect(noVendor({ category: ItemCategory.DivinationCard })).toBe(true)
    expect(noVendor({ category: ItemCategory.Ring, stackSize: { value: 3, max: 10 } })).toBe(true)
    expect(noVendor({ category: ItemCategory.Ring })).toBe(false)
    for (const lang of ['ru', 'en'] as const) expect(text(lang, 'pc1.v.cheap')).not.toMatch(/торговц|vendor/i)
  })

  it('«мало данных»: точность ≤ 1 (1–4 похожих), цена — ориентир, без заметки', () => {
    const v = trade(lots([10, 12, 15, 20]), 4)
    expect(v).toMatchObject({ kind: 'few', confidence: 1, price: { amount: 10 } })
    expect(v.note).toBeUndefined()
    expect(trade(lots([10, 12, 15, 20, 21]), 5)).toMatchObject({ kind: 'list', confidence: 2 })
    // лоты есть, но без цены
    expect(trade([lot('x'), lot('y')], 2)).toEqual({ kind: 'few', count: 2, confidence: 1 })
  })

  it('«ценная вещь»: от 1 div по курсу; цена в divine', () => {
    const v = trade(lots([200, 210, 215, 220, 230, 240]), 25)
    expect(v).toMatchObject({ kind: 'valuable', reason: 'div', price: { amount: 1, currency: 'divine' }, note: '~price 1 divine' })
    expect(trade(lots([199, 210, 215, 220, 230, 240]), 25)).toMatchObject({ kind: 'list', price: { amount: 200, currency: 'chaos' } })
    // без курса: цена в divine от 1 — тоже ценная
    expect(trade(lots([1, 1.1, 1.2, 1.2, 1.3], { currency: 'divine' }), 25, { rate: undefined })).toMatchObject({
      kind: 'valuable',
      reason: 'div',
      price: { amount: 1, currency: 'divine' }
    })
  })

  it('«ценная вещь»: дорого (≥ 50 c) при малом числе лотов', () => {
    expect(trade(lots([EXPENSIVE_CHAOS, 60, 70, 80, 90]), 6)).toMatchObject({ kind: 'valuable', reason: 'few', count: 6, confidence: 2 })
    expect(trade(lots([49, 60, 70, 80, 90]), 6)).toMatchObject({ kind: 'list' })
    // 1–4 лота и дорого: «ценная», а не просто «мало данных»; заметки нет
    const v = trade(lots([120, 150]), 2)
    expect(v).toMatchObject({ kind: 'valuable', reason: 'few' })
    expect(v.note).toBeUndefined()
  })

  it('«ценная вещь»: большой разброс цен (верхняя четверть ≥ 3× самой дешёвой)', () => {
    // цены растут плавно — приманок нет; верхняя четверть 240 c = 4× от 60 c
    const v = trade(lots([60, 70, 80, 100, 120, 140, 160, 200, 240, 280, 320, 360]), 40)
    expect(v).toMatchObject({
      kind: 'valuable',
      reason: 'spread',
      price: { amount: 60, currency: 'chaos' },
      range: { min: { amount: 60, currency: 'chaos' }, max: { amount: 1.2, currency: 'divine' } }
    })
    expect(trade(lots([60, 65, 70, 75, 80, 85, 90, 95, 100, 110]), 40)).toMatchObject({ kind: 'list' })
  })

  it('опт (bulk): цена за штуку, без заметки; дешёвая валюта — «копите и продавайте пачкой»', () => {
    expect(priceVerdict({ kind: 'bulk', total: 30, each: { amount: 0.25, currency: 'chaos' }, chaosPerDivine: RATE })).toMatchObject({
      kind: 'cheap',
      price: { amount: 0.3, currency: 'chaos' }
    })
    const list = priceVerdict({ kind: 'bulk', total: 30, each: { amount: 4, currency: 'chaos' }, chaosPerDivine: RATE })
    expect(list).toMatchObject({ kind: 'list', price: { amount: 4 } })
    expect(list.note).toBeUndefined()
    expect(priceVerdict({ kind: 'bulk', total: 3, each: { amount: 4, currency: 'chaos' } })).toMatchObject({ kind: 'few' })
    expect(priceVerdict({ kind: 'bulk', total: 0 })).toMatchObject({ kind: 'none' })
    // дорогой опт — не «проверьте свойства»
    expect(priceVerdict({ kind: 'bulk', total: 30, each: { amount: 2, currency: 'divine' }, chaosPerDivine: RATE })).toMatchObject({ kind: 'list' })
  })

  it('все ключи вердикта есть в RU и EN, параметры подставляются', () => {
    const keys = [
      'pc1.v.none', 'pc1.v.none.sub', 'pc1.v.none.bulk', 'pc1.v.few', 'pc1.v.few.sub', 'pc1.v.few.noPrice', 'pc1.v.few.bulk',
      'pc1.v.junk', 'pc1.v.junk.sub', 'pc1.v.junk.help', 'pc1.v.cheap', 'pc1.v.cheap.sub', 'pc1.v.valuable',
      'pc1.v.valuable.few', 'pc1.v.valuable.spread', 'pc1.v.valuable.div', 'pc1.v.valuable.help', 'pc1.v.list',
      'pc1.v.list.each', 'pc1.v.list.sub', 'pc1.v.list.bulk', 'pc1.v.note', 'pc1.v.note.done', 'pc1.v.note.fail', 'pc1.v.note.help'
    ]
    const params = { n: 3, price: '7 chaos', min: '1 div', max: '4 div', note: '~price 7 chaos' }
    for (const lang of ['ru', 'en'] as const) {
      for (const k of keys) expect(text(lang, k, params), `${lang}:${k}`).not.toMatch(/\{\w+\}/)
    }
    expect(text('ru', 'pc1.v.note.help', params)).toContain('«~price 7 chaos»')
    expect(text('en', 'pc1.v.note.help', params)).toContain('“~price 7 chaos”')
  })
})
