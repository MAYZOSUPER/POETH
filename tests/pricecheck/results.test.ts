import { describe, expect, it } from 'vitest'
import {
  confidenceOf,
  honestPrice,
  normalizeListing,
  summarizeGroup,
  type Poe1Listing,
  type TradeFetchItem
} from '@shared/poe1/pricecheck/results'
import { fallbackKey, fallbackToFilter, parseTradeDataStats, TradeStatsFallback } from '@shared/poe1/pricecheck/fallback'
import { parseItem, type ParsedItem } from '@shared/poe1/parser'
import { readFixture, store } from '../poe1/helpers'

const listing = (id: string, amount: number, currency = 'chaos', kind: Poe1Listing['kind'] = 'person'): Poe1Listing => ({
  id,
  kind,
  price: { amount, currency },
  accountName: `acc-${id}`,
  online: 'online'
})

describe('нормализация ответа fetch', () => {
  it('мерчант-листинг (fee) — мгновенный выкуп, всегда «в сети»; whisper — у in-person', () => {
    const merchant: TradeFetchItem = {
      id: 'm',
      listing: {
        indexed: '2026-10-28T10:00:00Z',
        price: { amount: 2, currency: 'divine', type: '~price' },
        fee: 2400,
        account: { name: 'Seller#1234', lastCharacterName: 'Char', online: null }
      },
      item: { ilvl: 84 }
    }
    expect(normalizeListing(merchant)).toMatchObject({
      id: 'm',
      kind: 'instant',
      fee: 2400,
      online: 'online',
      price: { amount: 2, currency: 'divine' },
      itemLevel: 84
    })
    const person: TradeFetchItem = {
      id: 'p',
      listing: {
        price: { amount: 15, currency: 'chaos' },
        whisper: '@Char Hi, I would like to buy your …',
        account: { name: 'B', online: { status: 'afk' } }
      }
    }
    expect(normalizeListing(person)).toMatchObject({ kind: 'person', online: 'afk', whisper: '@Char Hi, I would like to buy your …' })
    expect(normalizeListing({ id: 'x', listing: { account: { name: 'C' } } })).toMatchObject({ price: null, online: 'offline' })
  })
})

describe('«честная цена»', () => {
  it('приманка дешевле 0.5× медианы следующих 5 отсеивается', () => {
    const g = summarizeGroup([
      listing('bait', 1),
      listing('a', 10),
      listing('b', 11),
      listing('c', 12),
      listing('d', 12),
      listing('e', 14),
      listing('f', 20)
    ])
    expect(g.outliers).toEqual(['bait'])
    expect(g.min).toEqual({ amount: 10, currency: 'chaos' })
    expect(g.median).toEqual({ amount: 12, currency: 'chaos' })
    expect(g.count).toBe(6)
  })

  it('обычный разброс цен не считается приманкой; мало лотов — не судим', () => {
    expect(summarizeGroup([listing('a', 8), listing('b', 10), listing('c', 11), listing('d', 12)]).outliers).toEqual([])
    expect(summarizeGroup([listing('a', 1), listing('b', 10), listing('c', 11)]).outliers).toEqual([])
  })

  it('разные валюты: без курсов не сравниваем, с курсами — по chaos-эквиваленту', () => {
    const list = [listing('bait', 5), listing('a', 1, 'divine'), listing('b', 1, 'divine'), listing('c', 1.1, 'divine'), listing('d', 1.2, 'divine')]
    expect(summarizeGroup(list).outliers).toEqual([])
    expect(summarizeGroup(list, { chaos: 1, divine: 200 }).outliers).toEqual(['bait'])
  })

  it('группы мгновенного выкупа и whisper считаются отдельно', () => {
    const h = honestPrice(
      [listing('p1', 9), listing('m1', 12, 'chaos', 'instant'), listing('p2', 10), listing('m2', 13, 'chaos', 'instant')],
      30
    )
    expect(h.instant).toMatchObject({ count: 2, min: { amount: 12 }, median: { amount: 12 } })
    expect(h.person).toMatchObject({ count: 2, min: { amount: 9 } })
    expect(h.confidence).toBe(4)
    expect(honestPrice([]).instant).toEqual({ count: 0, min: undefined, median: undefined, outliers: [] })
  })

  it('точность по числу похожих', () => {
    expect([0, 1, 5, 10, 20].map(confidenceOf)).toEqual([0, 1, 2, 3, 4])
  })
})

describe('фолбэк data/stats для модов нового патча', () => {
  const json = {
    result: [
      {
        label: 'Explicit',
        entries: [
          { id: 'explicit.stat_3299347043', text: '+# to maximum Life', type: 'explicit' },
          { id: 'explicit.stat_new330', text: '#% increased Brand New Thing', type: 'explicit' },
          { id: 'explicit.stat_ru', text: '#% к новому свойству патча', type: 'explicit' }
        ]
      },
      { label: 'Implicit', entries: [{ id: 'implicit.stat_3299347043', text: '+# to maximum Life', type: 'implicit' }] },
      { label: 'Мусор', entries: [{ id: 1 }, null] }
    ]
  }

  it('разбор ответа и сопоставление строки (числа, знак, регистр)', () => {
    const entries = parseTradeDataStats(json)
    expect(entries).toHaveLength(4)
    const fb = new TradeStatsFallback(entries)
    expect(fb.match('12% increased Brand New Thing', 'explicit')).toMatchObject({
      tradeId: 'explicit.stat_new330',
      value: 12
    })
    expect(fb.match('+61 to maximum Life', 'implicit')?.tradeId).toBe('implicit.stat_3299347043')
    expect(fb.match('+61 to maximum Life', 'crafted')?.tradeId).toBe('explicit.stat_3299347043')
    expect(fb.match('7,5% к новому свойству патча', 'explicit')).toMatchObject({ tradeId: 'explicit.stat_ru', value: 7.5 })
    expect(fb.match('Совсем неизвестная строка', 'explicit')).toBeUndefined()
    expect(fallbackKey('+12% Foo')).toBe(fallbackKey('#% foo'))
    expect(() => parseTradeDataStats({})).toThrow()
  })

  it('фильтр «с сайта»: выключен у редких, −10% от ролла', async () => {
    const data = await store.ensureAll()
    const res = parseItem(readFixture('ru', 'adv-ring'), data)
    if (!res.ok) throw new Error(res.error)
    const item: ParsedItem = res.value
    const fb = new TradeStatsFallback(parseTradeDataStats(json))
    const f = fallbackToFilter(fb.match('20% increased Brand New Thing', 'explicit')!, item, 10)
    expect(f).toMatchObject({ tradeId: ['explicit.stat_new330'], fromSite: true, disabled: true })
    expect(f.roll).toMatchObject({ value: 20, min: 18 })
  })
})
