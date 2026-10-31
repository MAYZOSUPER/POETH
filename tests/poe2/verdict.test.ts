import { describe, expect, it } from 'vitest'
import { honestPrice, type Poe1ExchangeOffer, type Poe1Listing } from '@shared/poe1/pricecheck/results'
import { orderBulkOffers, poe2MarketPrice, poe2Verdict } from '@shared/poe2/pricecheck/verdict'

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

  it('одна сфера превращения или усиления — заведомо меньше 1 ex: «хлам»', () => {
    const lots = Array.from({ length: 12 }, () => lot(1, 'transmute', 'instant'))
    expect(trade(lots, 800).kind).toBe('junk')
    expect(trade(Array.from({ length: 12 }, () => lot(3, 'transmute')), 800).kind).toBe('list')
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

describe('обмен PoE2: порядок предложений без курсов', () => {
  const offer = (id: string, exchangeAmount: number, currency: string, itemAmount = 1): Poe1ExchangeOffer => ({
    id,
    exchangeAmount,
    currency,
    itemAmount,
    stock: 10,
    accountName: id,
    online: 'online'
  })

  it('опорная валюта — exalted: её предложения первыми, «1 div» не считается дешевле «2 ex»', () => {
    const got = orderBulkOffers([offer('d', 1, 'divine'), offer('e2', 2, 'exalted'), offer('c', 6, 'chaos'), offer('e1', 3, 'exalted', 2)])
    expect(got.map((o) => o.id)).toEqual(['e1', 'e2', 'd', 'c'])
  })

  it('нет exalted — chaos, потом divine', () => {
    expect(orderBulkOffers([offer('d', 1, 'divine'), offer('c', 5, 'chaos')])[0].id).toBe('c')
    expect(orderBulkOffers([offer('d2', 2, 'divine'), offer('d1', 1, 'divine')])[0].id).toBe('d1')
    expect(orderBulkOffers([])).toEqual([])
  })
})

// ---------------------------------------------------------------- S61: курс, честная цена, цена у Ange

describe('S61: вердикт PoE2 с курсом', () => {
  const RATES = { exalted: 1, divine: 690, chaos: 71.5, regal: 2 }
  const tradeR = (listings: Poe1Listing[], total = listings.length, noVendor = false) =>
    poe2Verdict({ kind: 'trade', total, listings, honest: honestPrice(listings, total, RATES), noVendor, rates: RATES })

  it('честная цена: из ≥ 4 лотов выкупа — вторая по дешевизне (одиночный дешёвый не считаем)', () => {
    const v = tradeR([lot(15, 'exalted', 'instant'), lot(20, 'exalted', 'instant'), lot(21, 'exalted', 'instant'), lot(22, 'exalted', 'instant'), lot(9)], 30)
    expect(v).toMatchObject({ kind: 'list', price: { amount: 20, currency: 'exalted' }, fair: 'second', fairLots: 4, exalted: 20 })
    expect(v.note).toBe('~price 20 exalted')
  })

  it('явную приманку отсеяла «честная цена» — самая дешёвая из оставшихся (дважды не режем)', () => {
    const lots = [1, 20, 30, 35, 40].map((a) => lot(a, 'exalted', 'instant'))
    const v = tradeR(lots, 30)
    expect(v.price).toEqual({ amount: 20, currency: 'exalted' })
    expect(v.fair).toBe('cheapest')
    // две приманки подряд
    const two = tradeR([1, 1, 20, 30, 35, 36].map((a) => lot(a, 'exalted', 'instant')), 30)
    expect(two.price).toEqual({ amount: 20, currency: 'exalted' })
  })

  it('лотов выкупа меньше 4 — как в S47: самый дешёвый честный лот обеих групп', () => {
    const v = tradeR([lot(15, 'exalted', 'instant'), lot(20, 'exalted', 'instant'), lot(12), lot(13), lot(14)], 30)
    expect(v).toMatchObject({ price: { amount: 12, currency: 'exalted' }, fair: 'cheapest' })
  })

  it('разные валюты сравниваются по курсу: 1 chaos дороже 50 ex, цена — в одной единице', () => {
    const lots = [lot(1, 'chaos', 'instant'), lot(80, 'exalted', 'instant'), lot(85, 'exalted', 'instant'), lot(90, 'exalted', 'instant')]
    const v = tradeR(lots, 30)
    // выкуп по exalted: 71.5, 80, 85, 90 → вторая — 80 ex
    expect(v.price).toEqual({ amount: 80, currency: 'exalted' })
    expect(v.exalted).toBe(80)
  })

  it('от 1 div по курсу — цена в divine и «ценная вещь»', () => {
    const lots = [700, 720, 740, 760, 780, 800, 820, 840].map((a) => lot(a, 'exalted', 'instant'))
    const v = tradeR(lots, 40)
    expect(v).toMatchObject({ kind: 'valuable', reason: 'div', price: { currency: 'divine' } })
    expect(v.price!.amount).toBeCloseTo(1, 1)
  })

  it('дешевле 1 ex по курсу — хлам, даже если лоты в regal', () => {
    const lots = Array.from({ length: 12 }, () => lot(0.3, 'regal', 'instant'))
    expect(tradeR(lots, 30).kind).toBe('junk')
    expect(tradeR(lots, 30, true).kind).toBe('cheap')
  })

  it('без курса — как в S47 (сравнение в одной валюте), правило второго лота — тоже', () => {
    const lots = [lot(15, 'exalted', 'instant'), lot(20, 'exalted', 'instant'), lot(1, 'divine', 'instant'), lot(22, 'exalted', 'instant'), lot(23, 'exalted', 'instant')]
    const v = trade(lots, 30)
    expect(v.price).toEqual({ amount: 20, currency: 'exalted' })
    expect(v.exalted).toBeUndefined()
  })

  it('обмен с курсом: цена за штуку в exalted; у Ange — kind exchange', () => {
    expect(poe2Verdict({ kind: 'bulk', total: 40, each: { amount: 0.01, currency: 'divine' }, rates: RATES })).toMatchObject({ kind: 'list', exalted: 6.9 })
    expect(poe2Verdict({ kind: 'bulk', total: 40, each: { amount: 0.4, currency: 'regal' }, rates: RATES }).kind).toBe('cheap')
    expect(poe2Verdict({ kind: 'exchange', exalted: 2.13, confidence: 4, volume: 300, exaltedPerDivine: 690 })).toMatchObject({
      kind: 'list',
      price: { amount: 2.1, currency: 'exalted' }
    })
    expect(poe2Verdict({ kind: 'exchange', exalted: 0.33, confidence: 4, volume: 300, exaltedPerDivine: 690 }).kind).toBe('cheap')
    expect(poe2Verdict({ kind: 'exchange', exalted: 5, confidence: 1, volume: 3, exaltedPerDivine: 690 }).kind).toBe('few')
    expect(poe2Verdict({ kind: 'exchange', exalted: 1380, confidence: 4, volume: 50, exaltedPerDivine: 690 }).price).toEqual({ amount: 2, currency: 'divine' })
  })

  it('цена на рынке с курсом: все лоты в exalted, строка в одной единице', () => {
    const lots = [lot(10), lot(11), lot(1, 'divine'), lot(12), lot(13)]
    const m = poe2MarketPrice(lots, honestPrice(lots, lots.length, RATES), RATES)!
    expect(m.lots).toBe(5)
    expect(m.unit).toBe('exalted')
    expect(m.mid).toEqual({ amount: 12, currency: 'exalted' })
    expect(m.max).toEqual({ amount: 690, currency: 'exalted' })
    const rich = [lot(1, 'divine'), lot(1.2, 'divine'), lot(800), lot(900)]
    expect(poe2MarketPrice(rich, honestPrice(rich, 4, RATES), RATES)!.mid.currency).toBe('divine')
  })

  it('обмен с курсом: предложения по цене за штуку в exalted, без курса — в конце', () => {
    const offer = (id: string, exchangeAmount: number, currency: string, itemAmount = 1): Poe1ExchangeOffer => ({
      id,
      exchangeAmount,
      currency,
      itemAmount,
      stock: 10,
      accountName: id,
      online: 'online'
    })
    const got = orderBulkOffers([offer('d', 1, 'divine', 200), offer('e', 4, 'exalted'), offer('c', 1, 'chaos', 20), offer('x', 1, 'mystery')], RATES)
    // d: 3.45 ex/шт, c: 3.575, e: 4
    expect(got.map((o) => o.id)).toEqual(['d', 'c', 'e', 'x'])
  })
})
