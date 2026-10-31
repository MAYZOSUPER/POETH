import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import type { FullHour } from '@shared/flip/feed'
import { honestPrice, normalizeListing, type Poe1Listing, type TradeFetchItem } from '@shared/poe1/pricecheck/results'
import { parseClipboard } from '@shared/poe2/parser'
import { angeConfidence, angePriceByName, feedIdsByName, poe2Rate } from '@shared/poe2/pricecheck/ange'
import { exaltedRates } from '@shared/poe2/pricecheck/currency'
import { angeSell, poe2SaleNote, sellAdvice2 } from '@shared/poe2/pricecheck/selling'
import { trade as dict } from '../../src/renderer/src/i18n/dict/trade'
import { readFixture, store } from './helpers'

// S61: «Продаю» в окне цены PoE 2 (как S50 у PoE 1): база — exalted, «не дешевле» — честная цена выкупа.
// Лоты — в форме ответа /api/trade2/fetch (придуманы; выкуп — listing.fee в золоте, «лично» — whisper).

const RATES = exaltedRates({ exaltedPerDivine: 690, exaltedPerChaos: 71.5 })!

/** Строка словаря trade с подстановкой {параметров} (как translate, без i18n/index). */
function tr(lang: 'ru' | 'en', key: string, params: Record<string, string | number> = {}): string {
  const s = dict[lang][key]
  if (s === undefined) return key
  let out = ''
  let rest = s
  for (;;) {
    const i = rest.indexOf('{')
    const j = i < 0 ? -1 : rest.indexOf('}', i)
    if (i < 0 || j < 0) return out + rest
    const name = rest.slice(i + 1, j)
    out += rest.slice(0, i) + (name in params ? String(params[name]) : rest.slice(i, j + 1))
    rest = rest.slice(j + 1)
  }
}

let seq = 0
function lot(amount: number, currency = 'exalted', buyout = true): Poe1Listing {
  const id = `l${++seq}`
  const raw: TradeFetchItem = {
    id,
    listing: {
      indexed: '2026-10-31T20:00:00.000Z',
      price: { type: '~price', amount, currency },
      ...(buyout ? { fee: Math.round(amount * 9) } : { whisper: `@Seller_${id} Hi, I would like to buy your item` }),
      account: { name: `seller_${id}#1000`, lastCharacterName: `Seller_${id}`, online: buyout ? null : { status: 'online' } }
    },
    item: { frameType: 2, identified: true, ilvl: 80, name: 'Doom Loop', typeLine: 'Gold Ring', baseType: 'Gold Ring' }
  }
  return normalizeListing(raw)
}

function advice(listings: Poe1Listing[], opts: { total?: number; rates?: typeof RATES | undefined; noVendor?: boolean } = {}) {
  const total = opts.total ?? listings.length
  const rates = 'rates' in opts ? opts.rates : RATES
  return sellAdvice2({ listings, honest: honestPrice(listings, total, rates), total, rates, noVendor: opts.noVendor ?? false })
}

describe('«Продаю» PoE 2 по лотам trade2', () => {
  it('много мгновенных: «поставьте ~P, не дешевле N» — N вторая по дешевизне (одиночный дешёвый не считаем)', () => {
    const lots = [15, 20, 22, 25, 28, 30, 33, 40].map((a) => lot(a)).concat([lot(18, 'exalted', false), lot(50, 'exalted', false)])
    const a = advice(lots, { total: 143 })
    expect(a.kind).toBe('ok')
    expect(a.basis).toBe('instant')
    expect(a.floor).toEqual({ amount: 20, currency: 'exalted' })
    expect(a.price).toEqual({ amount: 22, currency: 'exalted' })
    expect(a.copy).toBe('22')
    expect(a.ladder).toMatchObject({ count: 8, cheapest: { amount: 15 }, fifth: { amount: 28 } })
    expect(a.fee).toBe(Math.round(22 * 9))
    expect(a.place).toBe(3)
  })

  it('явная приманка отсеяна «честной ценой» — N самая дешёвая из оставшихся', () => {
    const lots = [1, 20, 22, 25, 28, 30].map((a) => lot(a))
    const a = advice(lots, { total: 40 })
    expect(a.floor).toEqual({ amount: 20, currency: 'exalted' })
    expect(a.ladder.cheapest).toEqual({ amount: 20, currency: 'exalted' })
  })

  it('лоты в divine и exalted — по курсу, от 1 div цена в divine', () => {
    const lots = [lot(1, 'divine'), lot(1.1, 'divine'), lot(800), lot(820), lot(1.3, 'divine'), lot(1.4, 'divine')]
    const a = advice(lots, { total: 30 })
    expect(a.price?.currency).toBe('divine')
    expect(a.floor?.currency).toBe('divine')
    expect(a.price!.amount).toBeCloseTo(1.2, 1)
  })

  it('мгновенных мало — «ориентир», похожих больше загруженных — подсказка про «Только мгновенный выкуп»', () => {
    const lots = [lot(10), lot(12), lot(14), ...[9, 11, 13, 15].map((a) => lot(a, 'exalted', false))]
    const a = advice(lots, { total: 300 })
    expect(a.kind).toBe('few')
    expect(a.floor).toEqual({ amount: 10, currency: 'exalted' })
    expect(a.moreInstant).toBe(true)
  })

  it('только «лично» — ориентир по whisper', () => {
    const a = advice([9, 11, 13, 15].map((x) => lot(x, 'exalted', false)), { total: 4 })
    expect(a).toMatchObject({ kind: 'whisper', basis: 'person', floor: { amount: 9 } })
  })

  it('дешевле 1 ex — хлам; у валюты и стопок — «копите пачкой»', () => {
    const lots = [0.3, 0.4, 0.5, 0.5, 0.6].map((a) => lot(a))
    expect(advice(lots).kind).toBe('junk')
    expect(advice(lots, { noVendor: true }).kind).toBe('cheap')
  })

  it('без курса — в валюте самого дешёвого лота (как S47)', () => {
    const lots = [lot(15), lot(20), lot(1, 'divine'), lot(22), lot(25), lot(30)]
    const a = advice(lots, { rates: undefined })
    expect(a.price?.currency).toBe('exalted')
    expect(a.ladder.count).toBe(5)
  })

  it('пусто — «мало данных»', () => {
    expect(advice([]).kind).toBe('none')
  })
})

describe('заметка цены PoE 2 (RU и EN клиент)', () => {
  const withNote = (lang: 'en' | 'ru', note: string): string =>
    `${readFixture(lang, 'ee2-ring-implicit').trimEnd()}\n--------\n${lang === 'ru' ? 'Примечание' : 'Note'}: ${note}\n`

  it('парсер PoE 2 кладёт заметку в item.note — одна и та же цена на обоих клиентах', async () => {
    for (const lang of ['en', 'ru'] as const) {
      const d = await store.ensureLanguage(lang)
      const parsed = parseClipboard(withNote(lang, '~price 1/2 divine'), d)
      expect(parsed.ok, lang).toBe(true)
      if (!parsed.ok) continue
      expect(poe2SaleNote(parsed.value.note), lang).toEqual({ price: { amount: 0.5, currency: 'divine' }, text: '~price 1/2 divine' })
    }
  })

  it('разбор: ~b/o, дробь, точка; без цены — нет', () => {
    expect(poe2SaleNote('~b/o 5 exalted')?.price).toEqual({ amount: 5, currency: 'exalted' })
    expect(poe2SaleNote('~price .5 divine')?.price.amount).toBe(0.5)
    expect(poe2SaleNote('~skip')).toBeUndefined()
    expect(poe2SaleNote(undefined)).toBeUndefined()
  })

  it('заметка против рынка: дешевле на ~X%, по рынку, дороже, без курса', () => {
    const lots = [15, 20, 22, 25, 28, 30].map((a) => lot(a))
    const run = (text: string) =>
      sellAdvice2({ listings: lots, honest: honestPrice(lots, 30, RATES), total: 30, rates: RATES, noVendor: false, note: poe2SaleNote(text) }).note!
    expect(run('~price 5 exalted')).toMatchObject({ status: 'under', percent: 77 })
    expect(run('~price 21 exalted')).toMatchObject({ status: 'fair', place: 3 })
    expect(run('~price 1 divine')).toMatchObject({ status: 'over' })
    expect(run('~price 3 mystery')).toMatchObject({ status: 'unknown' })
  })
})

describe('«Продаю» у Ange', () => {
  const { hours } = JSON.parse(readFileSync(resolve(__dirname, '../fixtures/poe2/exchange/hours.json'), 'utf8')) as { hours: FullHour[] }
  const ids = JSON.parse(readFileSync(resolve(__dirname, '../../resources/data/poe2/exchange/exchange-ids.json'), 'utf8')) as { names: Record<string, string> }
  const byName = feedIdsByName(ids.names)
  const rate = poe2Rate(hours, 'Forbidden Rites')!
  const price = (n: string) => angePriceByName(hours, 'Forbidden Rites', byName, n, rate)!

  it('штука от 1 базы — «~P за 1 шт., не дешевле нижней сделки», число в буфер', () => {
    // Perfect Exalted Orb у Ange меняют на divine: ~2.8 div за штуку
    const p = price('Perfect Exalted Orb')
    const s = angeSell(p, angeConfidence(p))
    expect(s.kind).toBe('ok')
    expect(s.base).toBe('divine')
    expect(s.copy).toBe(String(s.price.amount))
    expect(s.floor.amount).toBeLessThanOrEqual(s.price.amount)
    expect(s.top.amount).toBeGreaterThanOrEqual(s.price.amount)
  })

  it('дешевле 1 базы — «1 база за ~N шт.», без числа', () => {
    const p = price('Regal Orb')
    const s = angeSell(p, angeConfidence(p))
    // regal у Ange чаще меняют на divine: 1 div за сотни штук
    expect(s.copy).toBeUndefined()
    expect(s.perBase).toBeGreaterThan(100)
  })

  it('мало сделок — «ориентир»; заметка — против цены часа', () => {
    const ess = price('Greater Essence of the Body')
    expect(angeSell(ess, angeConfidence(ess)).kind).toBe('few')
    const p = price('Orb of Annulment')
    expect(angeSell(p, 4, poe2SaleNote('~price 50 exalted')).note?.status).toBe('under')
  })

  it('строки «Продаю у Ange» есть в RU и EN, в EN нет кириллицы', () => {
    for (const key of ['pc2.s61.sell.ange.title', 'pc2.s61.sell.ange.titlePer', 'pc2.s61.sell.ange.why', 'pc2.s61.sell.bulk.title', 'pc2.s61.sell.copyExchange']) {
      const p = { price: '2 ex', floor: '1', one: '1 div', n: 3, cur: 'div' }
      expect(tr('ru', key, p), key).not.toBe(key)
      expect(tr('en', key, p), key).not.toMatch(/[а-яё]/i)
    }
  })
})
