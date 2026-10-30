import { describe, expect, it } from 'vitest'
import { honestPrice, type Poe1Listing } from '@shared/poe1/pricecheck/results'
import { poe2MarketPrice, poe2Verdict } from '@shared/poe2/pricecheck/verdict'

// Вердикт PoE2 (S47): база — exalted, дорогое — divine, курса между валютами нет — сравнение в одной валюте.

let seq = 0
function lot(amount: number, currency = 'exalted', kind: Poe1Listing['kind'] = 'person'): Poe1Listing {
  return { id: `l${++seq}`, kind, price: { amount, currency }, accountName: 'a', online: 'online' }
}
const trade = (listings: Poe1Listing[], total = listings.length, noVendor = false) =>
  poe2Verdict({ kind: 'trade', total, listings, honest: honestPrice(listings, total), noVendor })

describe('вердикт PoE2', () => {
  it('нет лотов — «никто не продаёт»', () => {
    expect(trade([], 0).kind).toBe('none')
  })

  it('дешевле 1 exalted при хорошей точности — хлам (торговцу), у валюты — «дешёвка»', () => {
    const lots = Array.from({ length: 12 }, () => lot(0.5))
    expect(trade(lots, 30).kind).toBe('junk')
    expect(trade(lots, 30, true).kind).toBe('cheap')
  })

  it('обычная цена — «выставьте за ~X ex» и заметка ~price', () => {
    const v = trade([lot(12), lot(13), lot(14), lot(15), lot(15), lot(16)], 25)
    expect(v.kind).toBe('list')
    expect(v.price).toEqual({ amount: 12, currency: 'exalted' })
    expect(v.note).toBe('~price 12 exalted')
  })

  it('от 1 divine — ценная вещь; мало лотов дорогого — «похожих мало»', () => {
    const many = Array.from({ length: 8 }, (_, i) => lot(2 + i * 0.1, 'divine'))
    expect(trade(many, 40)).toMatchObject({ kind: 'valuable', reason: 'div' })
    expect(trade([lot(80), lot(85)], 2)).toMatchObject({ kind: 'valuable', reason: 'few' })
  })

  it('разброс в одной валюте — «цены сильно разные»', () => {
    const v = trade([lot(100), lot(110), lot(130), lot(200), lot(350), lot(400), lot(450)], 30)
    expect(v).toMatchObject({ kind: 'valuable', reason: 'spread' })
    expect(v.range?.min.currency).toBe('exalted')
  })

  it('прочие валюты (chaos) — без «хлама»: курса нет, сравнить не с чем', () => {
    const lots = Array.from({ length: 10 }, () => lot(0.5, 'chaos'))
    expect(trade(lots, 30).kind).toBe('list')
  })

  it('обмен: цена за штуку; дешевле 1 ex — «дешёвка»', () => {
    expect(poe2Verdict({ kind: 'bulk', total: 40, each: { amount: 0.2, currency: 'exalted' } }).kind).toBe('cheap')
    expect(poe2Verdict({ kind: 'bulk', total: 40, each: { amount: 3, currency: 'exalted' } }).kind).toBe('list')
    expect(poe2Verdict({ kind: 'bulk', total: 0 }).kind).toBe('none')
  })

  it('цена на рынке — по лотам в валюте самого дешёвого', () => {
    const lots = [lot(10), lot(11), lot(1, 'divine'), lot(12), lot(13)]
    const m = poe2MarketPrice(lots, honestPrice(lots))!
    expect(m.mid.currency).toBe('exalted')
    expect(m.lots).toBe(4)
    expect(m.min.amount).toBe(10)
  })
})
