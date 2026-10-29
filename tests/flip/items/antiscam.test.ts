import { describe, expect, it } from 'vitest'
import { checkLots, lotRates, lotStats, priceCluster, variantProblem, type LotExpect, type LotInput } from '@shared/flip/items/antiscam'
import { normalizeListing, type TradeFetchItem } from '@shared/poe1/pricecheck/results'
import { buildRows } from '@shared/flip/items/tiers'
import { DIVINE, fixture, line, sampleSnapshot } from './helpers'

const NOW = Date.parse('2026-10-29T20:00:00Z')
const snap = sampleSnapshot()
const rows = buildRows(snap.lines, DIVINE)
const hh = rows.find((r) => r.id === 'headhunter-leather-belt')!
const HH: LotExpect = { ...hh, implicits: line(snap, hh.id).implicits }
const rates = lotRates(DIVINE)

let seq = 0
const lot = (chaos: number, o: Partial<LotInput> = {}): LotInput => ({
  id: `l${++seq}`,
  kind: 'person',
  price: { amount: chaos, currency: 'chaos' },
  indexed: '2026-10-29T12:00:00Z',
  accountName: `A${seq}`,
  online: 'online',
  corrupted: false,
  foulborn: false,
  ...o
})

describe('антискам: разбор лотов одной проверки', () => {
  it('фикстура Headhunter: приманка, выгодный выкуп, старый, Foulborn, порча, price-fixer, валюта, имплициты', () => {
    const raw = fixture<{ result: TradeFetchItem[] }>('fetch-headhunter.json').result
    const input = raw.map((r) => ({ ...normalizeListing(r), stats: lotStats(r.item) }))
    const fixers = new Set(['traven77#7212'])
    const out = checkLots(input, HH, { rates, now: NOW, isFixer: (a) => fixers.has(a) })
    expect(out.lots.map((l) => [l.id, l.verdict])).toEqual([
      ['a', 'bait'],
      ['b', 'deal'],
      ['c', 'old'],
      ['d', 'variant'],
      ['e', 'corrupted'],
      ['f', 'fixer'],
      ['g', 'currency'],
      ['h', 'implicits']
    ])
    const b = out.lots[1]
    expect(b).toMatchObject({ kind: 'instant', fee: 5000, chaos: 1719.2, ageDays: 1 })
    // продажа — по ожидаемой цене (3380 × 0,95), а не по самому дешёвому лоту
    expect(b.profit).toBeCloseTo(3211 - 1719.2, 1)
    expect(b.tooCheap).toBeUndefined()
    expect(out.market).toBeNull()
    expect(out.sell).toBe(3211)
    expect(out.lots[0].ageDays).toBe(0.4)
  })

  it('приманка: лично — отсекается, мгновенный выкуп — остаётся с пометкой «в разы дешевле»', () => {
    const next = [2300, 2310, 2320, 2330, 2340].map((c) => lot(c))
    const person = checkLots([lot(500), ...next], HH, { rates, now: NOW })
    expect(person.lots[0].verdict).toBe('bait')
    const instant = checkLots([lot(500, { kind: 'instant', fee: 3000 }), ...next], HH, { rates, now: NOW })
    expect(instant.lots[0]).toMatchObject({ verdict: 'deal', tooCheap: true })
    expect(instant.lots[0].confidence).toBeLessThan(hh.confidence)
  })

  it('≥ 3 лотов в ±15 % ниже порога: цена упала — продажа по этому уровню, выгоды нет', () => {
    const out = checkLots([lot(2000), lot(2100), lot(2150), lot(2200)], HH, { rates, now: NOW })
    expect(out.market).toEqual({ price: 2125, n: 4 })
    expect(out.sell).toBe(2125)
    expect(out.lots.map((l) => l.verdict)).toEqual(['thin', 'thin', 'thin', 'thin'])
  })

  it('один-два дешёвых лота — не «рынок»: выгодно по ожидаемой цене', () => {
    const out = checkLots([lot(2000), lot(2300)], HH, { rates, now: NOW })
    expect(out.market).toBeNull()
    expect(out.lots.map((l) => l.verdict)).toEqual(['deal', 'deal'])
  })

  it('уровень цены: плотная группа и её медиана', () => {
    expect(priceCluster([100, 110, 112, 300])).toEqual({ price: 110, n: 3 })
    expect(priceCluster([100, 200, 300])).toBeNull()
    expect(priceCluster([])).toBeNull()
  })

  it('выгода меньше 10 % цены или 3 c — «мало выгоды»', () => {
    const out = checkLots([lot(3100)], HH, { rates, now: NOW })
    expect(out.lots[0]).toMatchObject({ verdict: 'thin', profit: 111 })
  })

  it('цена в divine считается по курсу, в непонятной валюте — «другая валюта»', () => {
    const out = checkLots([lot(0, { price: { amount: 5, currency: 'divine' } }), lot(0, { price: { amount: 1, currency: 'mirror' } })], HH, { rates, now: NOW })
    expect(out.lots[0].chaos).toBe(1685.5)
    expect(out.lots[1].verdict).toBe('currency')
  })

  it('вариант: Foulborn, stat id заменённого свойства (домен неважен), связи, порча, имплициты', () => {
    const rath = rows.find((r) => r.id === 'foulborn-rathpith-globe-dot-per-life-titanium-spirit-shield')!
    const want: LotExpect = { ...rath, trade: line(snap, rath.id).trade }
    expect(variantProblem(lot(1, { foulborn: true, stats: ['stat.mutated.stat_1855381243'] }), want)).toBeNull()
    expect(variantProblem(lot(1, { foulborn: true, stats: ['explicit.stat_1'] }), want)).toBe('variant')
    // stat id не видны — сайт уже искал по фильтру, не придираемся
    expect(variantProblem(lot(1, { foulborn: true }), want)).toBeNull()
    expect(variantProblem(lot(1, { foulborn: false }), want)).toBe('variant')

    const six = rows.find((r) => r.id === 'shavronnes-wrappings-occultists-vestment-6l')!
    expect(variantProblem(lot(1, { links: 5 }), six)).toBe('links')
    expect(variantProblem(lot(1, { links: 6 }), six)).toBeNull()
    const base = rows.find((r) => r.id === 'shavronnes-wrappings-occultists-vestment')!
    expect(variantProblem(lot(1, { links: 6 }), base)).toBe('links')
    expect(variantProblem(lot(1, { corrupted: true }), HH)).toBe('corrupted')
    expect(variantProblem(lot(1, { mods: [{ kind: 'explicit' }] }), HH)).toBe('implicits')
    expect(variantProblem(lot(1, { mods: [{ kind: 'implicit' }, { kind: 'explicit' }] }), HH)).toBeNull()
  })

  it('stat id лота — из hash модов и extended.hashes любых доменов', () => {
    expect(
      lotStats({
        implicitMods: [{ hash: 'stat.implicit.stat_1' }],
        mutatedMods: ['текст'],
        extended: { hashes: { mutated: [['explicit.stat_2', [0]]], explicit: [['explicit.stat_3', null]] } }
      }).sort()
    ).toEqual(['explicit.stat_2', 'explicit.stat_3', 'stat.implicit.stat_1'])
    expect(lotStats(null)).toEqual([])
  })
})
