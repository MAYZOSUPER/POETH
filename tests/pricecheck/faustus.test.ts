// S24: цена валюты у Фаустуса по часам фида обмена GGG (синтетические часы и 24 настоящих часа Allflame).
import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { leagueHour, parseFeedHour, type FullHour, type FullMarket } from '@shared/flip/feed'
import { divineTrack } from '@shared/flip/divine'
import { CHAOS_ID, DIVINE_ID } from '@shared/wealth/exchange'
import { roundChaos } from '@shared/poe1/pricecheck/currency'
import {
  FRESH_HOURS,
  faustusConfidence,
  faustusPrice,
  faustusPriceByName,
  feedIdsByName,
  hourRange
} from '@shared/poe1/pricecheck/faustus'
import { faustusView } from '@shared/poe1/pricecheck/priceBlock'

const L = 'Allflame'
const H = 1_793_239_200 // 29.10.2026 02:00 UTC
const RATE = 340
const BOX = 'Currency/CurrencyValdoPuzzleBox'

/** Рынок часа: [лига, A, B, объём A, объём B, lowRatio A:B, highRatio A:B] (стакан не нужен). */
function mk(a: string, b: string, va: number, vb: number, lo: [number, number] = [0, 0], hi: [number, number] = [0, 0]): FullMarket {
  return [L, a, b, va, vb, lo[0], lo[1], hi[0], hi[1], 0, 0, 0, 0]
}
const hour = (ago: number, ...markets: FullMarket[]): FullHour => ({ hour: H - ago * 3600, markets })

describe('цена у Фаустуса по часам фида', () => {
  // как в настоящем фиде 02:00: за chaos 80 шт. по 288–310, за divine 658 шт. по 1–7/6
  const box = [
    hour(0, mk(CHAOS_ID, BOX, 23537, 80, [288, 1], [310, 1]), mk(DIVINE_ID, BOX, 726, 658, [1, 1], [7, 6]), mk(CHAOS_ID, DIVINE_ID, 381555, 1114)),
    hour(1, mk(CHAOS_ID, BOX, 68706, 234, [270, 1], [317, 1]))
  ]

  it('последний час: два рынка, главный — где поменяли больше штук; цена — средняя по сделкам часа', () => {
    const p = faustusPrice(box, L, BOX, RATE)!
    expect(p.hour).toBe(H * 1000)
    expect(p.age).toBe(0)
    expect(p.main.base).toBe('divine')
    expect(p.main.each).toBeCloseTo(726 / 658, 6)
    expect(p.main.volume).toBe(658)
    expect([p.main.lo, p.main.hi].map((v) => Math.round(v * 100) / 100)).toEqual([1, 1.17])
    expect(p.other?.base).toBe('chaos')
    expect(p.other!.each).toBeCloseTo(23537 / 80, 6)
    expect([p.other!.lo, p.other!.hi]).toEqual([288, 310])
    expect(p.chaos).toBeCloseTo((726 / 658) * RATE, 6)
    expect(p.low).toBe(false)
  })

  it('в последний час не меняли — берём последний час со сделками; давно — «мало данных»', () => {
    const p = faustusPrice([hour(0, mk(CHAOS_ID, DIVINE_ID, 3400, 10)), hour(4, mk(CHAOS_ID, BOX, 900, 3, [290, 1], [310, 1]))], L, BOX, RATE)!
    expect(p.age).toBe(4)
    expect(p.main.base).toBe('chaos')
    expect(p.chaos).toBe(300)
    expect(p.low).toBe(true)
    expect(faustusConfidence(p)).toBe(1)
    // старше суток — у Фаустуса не считается: окно цены пойдёт на сайт
    expect(faustusPrice([hour(0), hour(FRESH_HOURS + 1, mk(CHAOS_ID, BOX, 900, 3))], L, BOX, RATE)).toBeUndefined()
    // рынок без сделок (только стакан) — не сделка
    expect(faustusPrice([hour(0, mk(CHAOS_ID, BOX, 0, 0, [290, 1], [310, 1]))], L, BOX, RATE)).toBeUndefined()
    // нет курса — нет цены
    expect(faustusPrice(box, L, BOX, 0)).toBeUndefined()
  })

  it('Divine Orb — ровно курс шапки; Chaos Orb — 1 c, рынок — divine', () => {
    const div = faustusPrice(box, L, DIVINE_ID, RATE)!
    expect(div.chaos).toBe(RATE)
    expect(div.main.base).toBe('chaos')
    expect(div.main.each).toBe(RATE)
    expect(div.main.volume).toBe(1114)
    const chaos = faustusPrice(box, L, CHAOS_ID, RATE)!
    expect(chaos.chaos).toBe(1)
    expect(chaos.main.base).toBe('divine')
  })

  it('одно имя у нескольких id — самый ходовой; имена без учёта регистра', () => {
    const byName = feedIdsByName({ 'Currency/A': 'Silver Coin', 'Currency/B': 'Silver Coin', [BOX]: "Valdo's Puzzle Box" })
    expect(byName.get('silver coin')).toEqual(['Currency/A', 'Currency/B'])
    const hs = [hour(0, mk(CHAOS_ID, 'Currency/A', 10, 2), mk(CHAOS_ID, 'Currency/B', 50, 10))]
    expect(faustusPriceByName(hs, L, byName, 'Silver Coin', RATE)?.id).toBe('Currency/B')
    expect(faustusPriceByName(hs, L, byName, 'Mirror of Kalandra', RATE)).toBeUndefined()
  })

  it('точность: по штукам за час и свежести', () => {
    const m = (volume: number) => ({ base: 'chaos' as const, each: 1, lo: 1, hi: 1, volume })
    expect(faustusConfidence({ main: m(60), age: 0 })).toBe(4)
    expect(faustusConfidence({ main: m(10), other: m(6), age: 0 })).toBe(3)
    expect(faustusConfidence({ main: m(5), age: 0 })).toBe(2)
    expect(faustusConfidence({ main: m(60), age: 1 })).toBe(3)
    expect(faustusConfidence({ main: m(2), age: 0 })).toBe(1)
  })

  it('час данных — «ЧЧ:00–ЧЧ:00» по местному времени', () => {
    const at = new Date(2026, 9, 29, 4, 0, 0).getTime()
    expect(hourRange(at)).toBe('04:00–05:00')
    expect(hourRange(new Date(2026, 9, 29, 23, 0, 0).getTime())).toBe('23:00–00:00')
  })
})

describe('настоящие 24 часа фида Allflame (tests/fixtures/flip)', () => {
  const raw = JSON.parse(readFileSync(join(__dirname, '../fixtures/flip/allflame-24h.json'), 'utf8')) as Array<{ hour: number; json: unknown }>
  const hours = raw.map((h) => leagueHour(parseFeedHour(h.hour, h.json)!, L))
  const names = JSON.parse(readFileSync(join(__dirname, '../../resources/data/poe1/wealth/exchange-ids.json'), 'utf8')) as {
    names: Record<string, string>
  }
  const byName = feedIdsByName(names.names)
  // курс шапки окна цены: trade.currencyRate → getDivineRate → divineTrack(...).current
  const header = divineTrack(hours, L)!.current

  it('Divine Orb в окне цены = плашка «1 div = N c» в шапке', () => {
    const p = faustusPriceByName(hours, L, byName, 'Divine Orb', header)!
    expect(p.chaos).toBe(header)
    expect(faustusView(p).each).toEqual({ amount: roundChaos(header), currency: 'chaos' })
  })

  it("Valdo's Puzzle Box: последний час, рынки «за chaos» и «за divine», стопка — сумма", () => {
    const p = faustusPriceByName(hours, L, byName, "Valdo's Puzzle Box", header)!
    expect(p.age).toBe(0)
    expect(p.hour).toBe(raw[raw.length - 1].hour * 1000)
    expect(new Set([p.main.base, p.other?.base])).toEqual(new Set(['chaos', 'divine']))
    const chaos = p.main.base === 'chaos' ? p.main : p.other!
    // 90193 c за 340 шт., сделки 255–280
    expect(chaos.each).toBeCloseTo(90193 / 340, 6)
    expect([chaos.lo, chaos.hi]).toEqual([255, 280])
    const v = faustusView(p, 20)
    expect(v.rows).toHaveLength(2)
    expect(v.stack?.currency).toBe('divine')
    expect(v.stack!.amount).toBeCloseTo((p.chaos * 20) / header, 0)
  })

  it('в фиде нет — undefined (тогда окно цены идёт на сайт, как раньше)', () => {
    expect(faustusPriceByName(hours, L, byName, 'Headhunter', header)).toBeUndefined()
  })
})
