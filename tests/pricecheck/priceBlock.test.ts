// S24: блок цены «сколько стоит моя вещь» — цена на рынке, одна единица на строку, курсы прочих валют лотов
// по обмену у Фаустуса, вердикт по ним же; тексты блока по словарю RU/EN.
import { describe, expect, it } from 'vitest'
import { MARKET_WINDOW, honestPrice, marketPrice, type Poe1Listing } from '@shared/poe1/pricecheck/results'
import { chaosIn, chaosRates, toChaos, unitFor } from '@shared/poe1/pricecheck/currency'
import { priceVerdict } from '@shared/poe1/pricecheck/verdict'
import { faustusView, marketView } from '@shared/poe1/pricecheck/priceBlock'
import type { FaustusPrice } from '@shared/poe1/pricecheck/faustus'
import { trade as dict } from '../../src/renderer/src/i18n/dict/trade'
import { lot, lots, text } from './helpers'

const RATE = 340
/** как в rc.8: «1 alch» стоит доли chaos */
const ALCH = 0.15
const rates = chaosRates(RATE, { alch: ALCH })!

function market(listings: Poe1Listing[], r = rates) {
  return marketPrice(listings, honestPrice(listings, listings.length, r), r)!
}

describe('цена на рынке', () => {
  it('середина самых дешёвых честных лотов (не больше 10), диапазон — они же', () => {
    const m = market(lots([15, 16, 18, 20, 20, 22, 25, 25, 30, 35, 80, 120]))
    expect(m.lots).toBe(MARKET_WINDOW)
    expect(m.mid).toEqual({ amount: 21, currency: 'chaos' })
    expect([m.min.amount, m.max.amount]).toEqual([15, 35])
    expect(m.chaos).toBe(21)
  })

  it('приманка в начале не считается', () => {
    const m = market(lots([1, 40, 42, 45, 46, 50]))
    expect(m.min.amount).toBe(40)
    expect(m.lots).toBe(5)
  })

  it('«1 alch» и «1 c» — в одной единице: alch по курсу обмена', () => {
    const ls = [lot('a', { amount: 1, currency: 'alch', instant: true }), lot('b', { amount: 1, currency: 'alch' }), lot('c', { amount: 1 })]
    const m = market(ls)
    expect(m.mid.currency).toBe('chaos')
    expect(m.chaos).toBeCloseTo(ALCH, 6)
    const v = marketView(m, RATE, rates)
    expect(v.unit).toBe('chaos')
    expect(v.instant).toEqual({ amount: 0.15, currency: 'chaos' }) // меньше 1 c — сотые, как у «~0,15»
    expect(v.person?.currency).toBe('chaos')
  })

  it('«200 c · медиана 1 div» больше не бывает: от 1 div — всё в divine, ниже — всё в chaos', () => {
    const ls = [lot('a', { amount: 200, instant: true }), lot('b', { amount: 1, currency: 'divine' }), lot('c', { amount: 1.2, currency: 'divine' })]
    const v = marketView(market(ls), RATE, rates)
    expect(v.unit).toBe('divine')
    expect(v.mid).toEqual({ amount: 1, currency: 'divine' })
    expect(v.min).toEqual({ amount: 0.59, currency: 'divine' })
    expect(v.instant).toEqual({ amount: 0.59, currency: 'divine' })
    expect(v.person).toEqual({ amount: 1, currency: 'divine' })
    expect(unitFor(339, RATE)).toBe('chaos')
    expect(chaosIn(510, 'divine', RATE)).toEqual({ amount: 1.5, currency: 'divine' })
  })

  it('курса валюты нет — цена в валюте лотов, ничего не смешиваем', () => {
    const ls = lots([3, 4, 5], { currency: 'exalted' })
    const m = marketPrice(ls, honestPrice(ls, 3), undefined)!
    expect(m.mid).toEqual({ amount: 4, currency: 'exalted' })
    expect(m.chaos).toBeUndefined()
    expect(marketView(m, RATE).unit).toBeUndefined()
    expect(toChaos({ amount: 2, currency: 'exalted' }, RATE, { exalted: 3 })).toBe(6)
    expect(toChaos({ amount: 2, currency: 'divine' }, undefined, { divine: 1 })).toBeUndefined()
  })
})

describe('вердикт по курсам прочих валют', () => {
  it('редкий за «1 alch» при 10 000 похожих — хлам, а не «выставьте за ~1 alch»', () => {
    const ls = Array.from({ length: 20 }, (_, i) => lot(`l${i}`, { amount: 1, currency: i < 12 ? 'alch' : 'chaos', instant: i % 2 === 0 }))
    const v = priceVerdict({ kind: 'trade', total: 10000, listings: ls, honest: honestPrice(ls, 10000, rates), chaosPerDivine: RATE, rates, noVendor: false })
    expect(v.kind).toBe('junk')
    expect(v.price).toEqual({ amount: 0.15, currency: 'chaos' })
  })

  it('цена у Фаустуса: продать / дешёвка / мало сделок', () => {
    const ex = (chaos: number, confidence: number) =>
      priceVerdict({ kind: 'exchange', chaos, confidence, volume: 100, chaosPerDivine: RATE })
    expect(ex(294, 4)).toMatchObject({ kind: 'list', price: { amount: 290, currency: 'chaos' } })
    expect(ex(377, 4).price).toEqual({ amount: 1.1, currency: 'divine' })
    expect(ex(0.3, 4).kind).toBe('cheap')
    expect(ex(294, 1).kind).toBe('few')
    expect(ex(294, 4).note).toBeUndefined()
    // в единице главного рынка и точно, как «Цена у Фаустуса» в блоке
    const unit = (chaos: number, u: 'chaos' | 'divine') =>
      priceVerdict({ kind: 'exchange', chaos, confidence: 4, volume: 100, chaosPerDivine: RATE, unit: u }).price
    expect(unit(294.2, 'chaos')).toEqual({ amount: 294, currency: 'chaos' })
    expect(unit(375, 'divine')).toEqual({ amount: 1.1, currency: 'divine' })
    expect(unit(RATE, 'chaos')).toEqual({ amount: RATE, currency: 'chaos' })
    expect(unit(0.15, 'chaos')).toEqual({ amount: 0.15, currency: 'chaos' })
  })
})

describe('тексты блока цены (RU/EN)', () => {
  it('все ключи pc1.s24.* есть в обоих языках', () => {
    const ru = Object.keys(dict.ru).filter((k) => k.startsWith('pc1.s24.'))
    const en = Object.keys(dict.en).filter((k) => k.startsWith('pc1.s24.'))
    expect(ru.length).toBeGreaterThan(30)
    expect(new Set(en)).toEqual(new Set(ru))
  })

  it('старых «Купить сейчас / По whisper / медиана» и «цена · продавец · возраст» больше нет', () => {
    for (const lang of ['ru', 'en'] as const) {
      for (const k of ['pc1.summary.instant', 'pc1.summary.person', 'pc1.summary.median', 'pc1.summary.none', 'pc1.listings.cols']) {
        expect(dict[lang][k]).toBeUndefined()
      }
    }
  })

  it('цена на рынке: главная строка, диапазон и пояснение — по одной единице', () => {
    const v = marketView(market(lots([15, 16, 18, 20, 20, 22, 25, 25, 30, 35, 80])), RATE, rates)
    expect(text('ru', 'pc1.s24.market')).toBe('Цена на рынке')
    expect(text('ru', 'pc1.s24.market.range', { n: v.lots, min: v.min.amount, max: `${v.max.amount} c` })).toBe(
      'по 10 самым дешёвым похожим: от 15 до 35 c'
    )
    expect(text('en', 'pc1.s24.market.range', { n: v.lots, min: v.min.amount, max: `${v.max.amount} c` })).toBe(
      'from the 10 cheapest similar: 15 to 35 c'
    )
    expect(text('ru', 'pc1.s24.split.instant', { price: '0,2 c' })).toBe('выкуп у торговца — от 0,2 c')
    expect(text('en', 'pc1.s24.split.person', { price: '1 c' })).toBe('in person (whisper) from 1 c')
    expect(text('ru', 'pc1.s24.listings.order')).toBe('сначала дешёвые')
  })

  it('«Цена может быть выше: не отмечены …»', () => {
    const list = ['Has 1 Socket', '+44 total maximum Mana'].map((s) => text('ru', 'pc1.s24.quote', { s })).join(', ')
    expect(`${text('ru', 'pc1.s24.higher')} ${text('ru', 'pc1.s24.higher.list', { list })}`).toBe(
      'Цена может быть выше: не отмечены «Has 1 Socket», «+44 total maximum Mana»'
    )
    const en = ['Has 1 Socket'].map((s) => text('en', 'pc1.s24.quote', { s })).join(', ')
    expect(`${text('en', 'pc1.s24.higher')} ${text('en', 'pc1.s24.higher.list', { list: en })}`).toBe(
      'The price may be higher: “Has 1 Socket” not checked'
    )
    expect(text('ru', 'pc1.s24.higher.btn')).toBe('Учесть и искать заново')
  })

  it('цена у Фаустуса: за 1 шт., стопка, час данных, рынки', () => {
    const f: FaustusPrice = {
      id: 'Currency/CurrencyValdoPuzzleBox',
      hour: 0,
      age: 0,
      chaosPerDivine: RATE,
      chaos: 294.2,
      main: { base: 'chaos', each: 294.2, lo: 288, hi: 310, volume: 80 },
      other: { base: 'divine', each: 1.103, lo: 1, hi: 1.1667, volume: 658 },
      low: false
    }
    const v = faustusView(f, 20)
    expect(v.each).toEqual({ amount: 294, currency: 'chaos' })
    expect(v.stack).toEqual({ amount: 17.3, currency: 'divine' })
    // стопка Divine Orb — в chaos (в divine это просто число штук)
    const div: FaustusPrice = { ...f, id: 'Currency/CurrencyModValues', chaos: RATE, main: { base: 'chaos', each: RATE, lo: 334, hi: 353, volume: 1114 } }
    delete div.other
    expect(faustusView(div, 3).stack).toEqual({ amount: 1020, currency: 'chaos' })
    expect(faustusView(div).stack).toBeUndefined()
    expect(v.rows[1]).toMatchObject({ each: { amount: 1.1, currency: 'divine' }, lo: 1, hi: 1.17 })
    expect(text('ru', 'pc1.s24.v.sell', { price: '290 c' })).toBe('Продайте у Фаустуса за ~290 c за 1 шт.')
    expect(text('en', 'pc1.s24.v.sell', { price: '290 c' })).toBe('Sell it to Faustus for ~290 c each')
    expect(text('ru', 'pc1.s24.fs.src', { hours: '04:00–05:00' })).toBe('обмен валюты в игре · данные за 04:00–05:00')
    expect(text('ru', 'pc1.s24.fs.deals', { lo: 288, hi: '310 c' })).toBe('сделки 288–310 c')
    expect(text('ru', 'pc1.s24.fs.stack', { n: 20 })).toBe('Ваша стопка, 20 шт.:')
    expect(text('ru', 'pc1.s24.site')).toBe('Объявления на сайте (часто устаревшие)')
    expect(text('en', 'pc1.s24.site')).toBe('Listings on the site (often stale)')
  })
})
