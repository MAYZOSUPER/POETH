// S50: режим «Продаю» — цена для мерчант-вкладки по той же выдаче: лестница мгновенных лотов, «поставьте ~P,
// не дешевле N», заметка `~price` против рынка, обмен у Фаустуса; RU и EN клиент — одно и то же.
import { readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { honestPrice, normalizeListing, type Poe1Listing, type TradeFetchItem } from '@shared/poe1/pricecheck/results'
import { chaosRates } from '@shared/poe1/pricecheck/currency'
import type { FaustusPrice } from '@shared/poe1/pricecheck/faustus'
import {
  OVER_RATIO,
  SELL_MIN_INSTANT,
  UNDER_RATIO,
  copyNumber,
  exchangeSell,
  saleNoteOf,
  sellAdvice,
  sellAmount,
  type SaleNote,
  type SellInput
} from '@shared/poe1/pricecheck/selling'
import { trade as dict } from '../../src/renderer/src/i18n/dict/trade'
import { lot, lots, text } from './helpers'

const RATE = 200
const FIX = path.join(__dirname, 'fixtures')
const ITEMS = path.join(__dirname, '..', 'fixtures', 'poe1')

/** Выдача из фикстуры: ответ /api/trade/fetch → лоты окна цены. */
function issue(name: string): { listings: Poe1Listing[]; total: number } {
  const raw = JSON.parse(readFileSync(path.join(FIX, name), 'utf8')) as { total: number; result: TradeFetchItem[] }
  return { listings: raw.result.map(normalizeListing), total: raw.total }
}

function advise(listings: Poe1Listing[], total = listings.length, opts: Partial<SellInput> & { rate?: number | null } = {}) {
  const rate = opts.rate === null ? undefined : (opts.rate ?? RATE)
  const rates = chaosRates(rate)
  return sellAdvice({ listings, total, honest: honestPrice(listings, total, rates), chaosPerDivine: rate, rates, noVendor: false, ...opts })
}

const note = (text: string): SaleNote => saleNoteOf(`Note: ${text}`)!

describe('заметка цены из текста предмета', () => {
  it('~price и ~b/o, дробь, точка в начале числа', () => {
    expect(saleNoteOf('Rarity: Rare\n--------\nNote: ~price 5 chaos\n')).toEqual({ price: { amount: 5, currency: 'chaos' }, text: '~price 5 chaos' })
    expect(saleNoteOf('Примечание: ~b/o 1/2 divine')?.price).toEqual({ amount: 0.5, currency: 'divine' })
    expect(saleNoteOf('Note: ~b/o .99 alch')?.price).toEqual({ amount: 0.99, currency: 'alch' })
  })
  it('заметка без цены или её нет — ничего', () => {
    expect(saleNoteOf('Note: ~skip')).toBeUndefined()
    expect(saleNoteOf('Note: продам дёшево')).toBeUndefined()
    expect(saleNoteOf('Rarity: Rare\nDoom Loop')).toBeUndefined()
  })
  it('RU = EN: одна и та же заметка в фикстурах обоих клиентов', () => {
    for (const name of ['armour-05.txt', 'card-02.txt', 'gem-02.txt', 'jewel-04.txt']) {
      const en = saleNoteOf(readFileSync(path.join(ITEMS, 'en', name), 'utf8'))
      const ru = saleNoteOf(readFileSync(path.join(ITEMS, 'ru', name), 'utf8'))
      expect(en, name).toBeDefined()
      expect(ru, name).toEqual(en)
    }
  })
})

describe('числа для игры', () => {
  it('chaos — целые (меньше 1 — сотые), divine — десятые до 10', () => {
    expect([0.333, 0.5, 1.4, 22.5, 147].map((v) => sellAmount(v, 'chaos'))).toEqual([0.33, 0.5, 1, 23, 147])
    expect([0.04, 1.33, 1.37, 9.96, 12.4].map((v) => sellAmount(v, 'divine'))).toEqual([0.1, 1.3, 1.4, 10, 12])
  })
  it('в буфер — только число с точкой', () => {
    expect([22, 1.3, 0.30000000000000004].map(copyNumber)).toEqual(['22', '1.3', '0.3'])
  })
})

describe('много мгновенных лотов', () => {
  const { listings, total } = issue('sell-many.json')
  const a = advise(listings, total)

  it('лестница без приманки: самый дешёвый, 5-й, медиана', () => {
    expect(a.ladder).toEqual({
      count: 11,
      cheapest: { amount: 20, currency: 'chaos' },
      fifth: { amount: 25, currency: 'chaos' },
      median: { amount: 27, currency: 'chaos' }
    })
  })
  it('«поставьте ~P, не дешевле N»: P — середина пяти самых дешёвых, N — самый дешёвый мгновенный', () => {
    expect(a).toMatchObject({ kind: 'ok', basis: 'instant', price: { amount: 22, currency: 'chaos' }, floor: { amount: 20, currency: 'chaos' } })
    expect(a.place).toBe(3)
    expect(a.lots).toBe(11)
    expect(a.copy).toBe('22')
    expect(a.chaos).toBe(22)
  })
  it('комиссия в золоте — у мгновенного лота с ценой рядом с P', () => {
    expect(a.fee).toBe(286)
  })
  it('цены ровные, мгновенных достаточно — без разброса и подсказки про выкуп', () => {
    expect(a.spread).toBeUndefined()
    expect(a.moreInstant).toBeUndefined()
  })
  it('whisper-лоты дешевле мгновенных на рекомендацию не влияют', () => {
    expect(listings.some((l) => l.kind === 'person' && l.price!.amount < 20)).toBe(true)
    expect(a.floor?.amount).toBe(20)
  })
})

describe('предупреждение по заметке ~price', () => {
  const { listings, total } = issue('sell-many.json')
  const check = (t: string) => advise(listings, total, { note: note(t) }).note

  it('заметно дешевле самого дешёвого мгновенного — «дешевле рынка на ~X%» от рекомендованной цены', () => {
    expect(check('~price 10 chaos')).toMatchObject({ status: 'under', percent: 55, place: 1 })
    // 1/20 divine = 10 c
    expect(check('~b/o 1/20 divine')).toMatchObject({ status: 'under', percent: 55 })
  })
  it('чуть дешевле N — ещё не «продешевили»: порог ' + UNDER_RATIO * 100 + '%', () => {
    expect(check('~price 17 chaos')).toMatchObject({ status: 'fair', place: 1 })
    expect(check('~price 15 chaos')?.status).toBe('under')
  })
  it('в рынке — место среди мгновенных', () => {
    expect(check('~price 23 chaos')).toMatchObject({ status: 'fair', place: 4 })
  })
  it(`дороже P в ${OVER_RATIO} раза — может долго не продаваться`, () => {
    expect(check('~price 40 chaos')).toMatchObject({ status: 'over', place: 11 })
  })
  it('валюта заметки без курса — сравнить не с чем', () => {
    expect(check('~price 1 alch')).toMatchObject({ status: 'unknown' })
    expect(check('~price 1 alch')?.percent).toBeUndefined()
  })
  it('RU = EN: заметка из RU-текста даёт то же, что из EN-текста', () => {
    const en = advise(listings, total, { note: saleNoteOf('Note: ~price 10 chaos') })
    const ru = advise(listings, total, { note: saleNoteOf('Примечание: ~price 10 chaos') })
    expect(ru).toEqual(en)
  })
})

describe('мало мгновенных лотов', () => {
  const { listings, total } = issue('sell-few.json')

  it('рекомендация — ориентир по тем, что есть; «5-го» нет', () => {
    const a = advise(listings, total)
    expect(a).toMatchObject({ kind: 'few', basis: 'instant', price: { amount: 45 }, floor: { amount: 40 }, place: 2, lots: 3 })
    expect(a.ladder).toEqual({ count: 3, cheapest: { amount: 40, currency: 'chaos' }, median: { amount: 45, currency: 'chaos' } })
    expect(a.ladder.count).toBeLessThan(SELL_MIN_INSTANT)
  })
  it('похожих больше, чем загружено, — подсказать «Только мгновенный выкуп»; уже выбран — нет', () => {
    expect(advise(listings, total).moreInstant).toBeUndefined()
    expect(advise(listings, 100).moreInstant).toBe(true)
    expect(advise(listings, 100, { instantOnly: true }).moreInstant).toBeUndefined()
  })
})

describe('только whisper', () => {
  const { listings, total } = issue('sell-whisper.json')
  const a = advise(listings, total)

  it('мгновенных нет — ориентир по лотам «лично», лестница пустая', () => {
    expect(a).toMatchObject({ kind: 'whisper', basis: 'person', price: { amount: 12 }, floor: { amount: 10 }, place: 2 })
    expect(a.ladder).toEqual({ count: 0 })
    expect(a.fee).toBeUndefined()
  })
  it('заметку сравниваем с ними же', () => {
    expect(advise(listings, total, { note: note('~price 5 chaos') }).note).toMatchObject({ status: 'under', percent: 58 })
  })
})

describe('разброс цен', () => {
  const { listings, total } = issue('sell-spread.json')
  const a = advise(listings, total)

  it('chaos и divine в одной лестнице, одна единица (по P)', () => {
    expect(a.price).toEqual({ amount: 120, currency: 'chaos' })
    expect(a.floor).toEqual({ amount: 100, currency: 'chaos' })
    expect(a.ladder).toMatchObject({ count: 10, fifth: { amount: 300, currency: 'chaos' }, median: { amount: 300, currency: 'chaos' } })
  })
  it('верхняя четверть в 3+ раза дороже самого дешёвого — «сравните свойства»', () => {
    expect(a.spread).toBe(true)
    expect(a.kind).toBe('ok')
  })
})

describe('дорогой предмет — в divine', () => {
  const { listings, total } = issue('sell-divine.json')

  it('от 1 div по курсу — всё в divine, число для буфера с точкой', () => {
    const a = advise(listings, total)
    expect(a).toMatchObject({ kind: 'ok', price: { amount: 1.3, currency: 'divine' }, floor: { amount: 1.2, currency: 'divine' }, copy: '1.3', chaos: 260 })
    expect(a.ladder).toMatchObject({ cheapest: { amount: 1.2 }, fifth: { amount: 1.5 }, median: { amount: 1.4 } })
    // 1.3 div есть у двух лотов: с такой же ценой не обгоняют
    expect(a.place).toBe(2)
    expect(a.fee).toBe(3380)
  })
  it('курса нет — в валюте лотов, без chaos', () => {
    const a = advise(listings, total, { rate: null })
    expect(a.price).toEqual({ amount: 1.3, currency: 'divine' })
    expect(a.chaos).toBeUndefined()
  })
  it('заметка в chaos сравнивается по курсу', () => {
    expect(advise(listings, total, { note: note('~price 150 chaos') }).note).toMatchObject({ status: 'under', percent: 42 })
  })
})

describe('дешёвое, пустое, другой вариант', () => {
  it('меньше 1 c — хлам торговцу; валюта и стопки — «копите пачкой»', () => {
    const cheap = lots([0.3, 0.4, 0.5, 0.5, 0.6], { instant: true })
    expect(advise(cheap).kind).toBe('junk')
    expect(advise(cheap, cheap.length, { noVendor: true })).toMatchObject({ kind: 'cheap', price: { amount: 0.5 } })
  })
  it('лотов с ценой нет — «none»', () => {
    expect(advise([lot('a', { instant: true }), lot('b')], 2)).toMatchObject({ kind: 'none', lots: 0, ladder: { count: 0 } })
  })
  it('сильные предупреждения S15 — помечаем, рекомендацию не прячем', () => {
    const { listings, total } = issue('sell-many.json')
    expect(advise(listings, total, { caution: true })).toMatchObject({ caution: true, price: { amount: 22 } })
  })
})

// ---------------------------------------------------------------- обмен у Фаустуса

const HOUR = Date.parse('2026-11-14T11:00:00Z')
const VALDO: FaustusPrice = {
  id: 'Currency/CurrencyValdoPuzzleBox',
  hour: HOUR,
  age: 0,
  chaosPerDivine: 340,
  chaos: (726 / 658) * 340,
  main: { base: 'divine', each: 726 / 658, lo: 1, hi: 7 / 6, volume: 658 },
  low: false
}
const ALCH: FaustusPrice = {
  id: 'Currency/CurrencyUpgradeToRare',
  hour: HOUR,
  age: 0,
  chaosPerDivine: 340,
  chaos: 0.15,
  main: { base: 'chaos', each: 0.15, lo: 0.12, hi: 0.2, volume: 3510 },
  low: false
}

describe('«Продаю» для валюты — по обмену у Фаустуса', () => {
  it('~P за 1 шт. в валюте рынка, не дешевле нижней сделки часа', () => {
    expect(exchangeSell(VALDO, 4)).toMatchObject({
      kind: 'ok',
      base: 'divine',
      price: { amount: 1.1, currency: 'divine' },
      floor: { amount: 1, currency: 'divine' },
      top: { amount: 1.17, currency: 'divine' },
      copy: '1.1'
    })
  })
  it('дешевле 1 базы за штуку — сколько штук за 1 базу, без числа для буфера', () => {
    const s = exchangeSell(ALCH, 4)
    expect(s).toMatchObject({ price: { amount: 0.15, currency: 'chaos' }, perBase: 7 })
    expect(s.copy).toBeUndefined()
  })
  it('мало сделок — ориентир', () => {
    expect(exchangeSell({ ...VALDO, low: true }, 4).kind).toBe('few')
    expect(exchangeSell(VALDO, 1).kind).toBe('few')
  })
  it('заметка против цены обмена (без «места»)', () => {
    const s = exchangeSell(VALDO, 4, note('~price 0.5 divine'))
    expect(s.note).toEqual({ note: note('~price 0.5 divine'), status: 'under', percent: 55 })
    expect(exchangeSell(VALDO, 4, note('~price 250 chaos')).note?.status).toBe('under')
    expect(exchangeSell(VALDO, 4, note('~price 300 chaos')).note?.status).toBe('fair')
    expect(exchangeSell(VALDO, 4, note('~price 1.1 divine')).note?.status).toBe('fair')
  })
})

// ---------------------------------------------------------------- тексты RU/EN

describe('тексты «Продаю» RU = EN', () => {
  const keys = Object.keys(dict.ru).filter((k) => k.startsWith('pc1.s50.'))

  it('строки есть на обоих языках, в EN нет кириллицы', () => {
    expect(keys.length).toBeGreaterThan(20)
    for (const k of keys) {
      expect(dict.en[k], k).toBeTruthy()
      expect(dict.en[k], k).not.toMatch(/[а-яё]/i)
    }
  })
  it('рекомендация и предупреждение собираются с числами на обоих языках', () => {
    for (const lang of ['ru', 'en'] as const) {
      const title = text(lang, 'pc1.s50.title', { price: '22 c', floor: '20 c' })
      expect(title).toContain('22 c')
      expect(title).toContain('20 c')
      const under = text(lang, 'pc1.s50.note.under', { percent: 55, note: '~price 10 chaos', floor: '20 c' })
      expect(under).toContain('55')
      expect(under).toContain('~price 10 chaos')
    }
  })
})
