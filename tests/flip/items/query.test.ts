import { describe, expect, it } from 'vitest'
import { buildItemQuery, clampK, DEFAULT_K, maxPriceOf, priceFilter, watchTitle } from '@shared/flip/items/query'
import { itemFlipDevFlag, itemFlipOn, ITEMFLIP_RELEASED } from '@shared/flip/items/flag'
import { buildRows } from '@shared/flip/items/tiers'
import { DIVINE, line, sampleSnapshot } from './helpers'

const snap = sampleSnapshot()
const rows = buildRows(snap.lines, DIVINE)
const row = (id: string) => rows.find((r) => r.id === id)!

describe('запрос «k × медиана»', () => {
  it('k по умолчанию 0,7, в пределах 0,3–0,95', () => {
    expect(clampK(undefined)).toBe(DEFAULT_K)
    expect(clampK(0.1)).toBe(0.3)
    expect(clampK(2)).toBe(0.95)
    expect(clampK(0.654)).toBe(0.65)
    expect(clampK(Number.NaN)).toBe(DEFAULT_K)
  })

  it('порог — k × цена poe.ninja целым, не меньше 1 c', () => {
    expect(maxPriceOf({ chaos: 3380 }, 0.7)).toBe(2366)
    expect(maxPriceOf({ chaos: 1 }, 0.5)).toBe(1)
  })

  it('порог — в валюте, в которой уник продают: от 1 div — в divine (вниз до сотых), дешевле — в chaos', () => {
    // без валюты сайт сравнивает по своему курсу: 29.10.2026 порог 2366 c пропустил лоты Headhunter по 10 div
    expect(priceFilter({ chaos: 3380 }, 2366, DIVINE)).toEqual({ option: 'divine', max: 7.01 })
    expect(priceFilter({ chaos: 250 }, 175, DIVINE)).toEqual({ option: 'chaos', max: 175 })
    // курса нет — в chaos
    expect(priceFilter({ chaos: 3380 }, 2366, 0)).toEqual({ option: 'chaos', max: 2366 })
  })

  it('Headhunter: имя и база английские, онлайн/выкуп, цена ≤ порога, за неделю, без порчи и не Foulborn', () => {
    const body = buildItemQuery(row('headhunter-leather-belt'), 2366, DIVINE)
    expect(body).toEqual({
      query: {
        status: { option: 'available' },
        name: 'Headhunter',
        type: 'Leather Belt',
        stats: [{ type: 'and', filters: [] }],
        filters: {
          misc_filters: { filters: { corrupted: { option: 'false' }, foulborn_item: { option: 'false' } } },
          trade_filters: { filters: { price: { option: 'divine', max: 7.01 }, indexed: { option: '1week' } } }
        }
      },
      sort: { price: 'asc' }
    })
  })

  it('6L — «связей от 6», без связей при наличии 6L — «не больше 4»', () => {
    const six = buildItemQuery(row('shavronnes-wrappings-occultists-vestment-6l'), 200, DIVINE).query.filters as Record<string, unknown>
    expect(six.socket_filters).toEqual({ filters: { links: { min: 6 } } })
    const five = buildItemQuery(row('shavronnes-wrappings-occultists-vestment-5l'), 10, DIVINE).query.filters as Record<string, unknown>
    expect(five.socket_filters).toEqual({ filters: { links: { min: 5, max: 5 } } })
    const base = buildItemQuery(row('shavronnes-wrappings-occultists-vestment'), 7, DIVINE).query.filters as Record<string, unknown>
    expect(base.socket_filters).toEqual({ filters: { links: { max: 4 } } })
    // у Kaom's Heart нет 5L/6L-цены — связи не фильтруем
    expect((buildItemQuery(row('kaoms-heart-glorious-plate'), 175, DIVINE).query.filters as Record<string, unknown>).socket_filters).toBeUndefined()
  })

  it('Foulborn: имя без приставки, фильтр foulborn_item и stat-фильтры варианта из poe.ninja', () => {
    const id = 'foulborn-headhunter-culling-strike-soul-eater-leather-belt'
    const l = line(snap, id)
    const body = buildItemQuery({ ...row(id), trade: l.trade }, 100000, DIVINE)
    expect(body.query.name).toBe('Headhunter')
    expect((body.query.filters as { misc_filters: { filters: Record<string, unknown> } }).misc_filters.filters.foulborn_item).toEqual({ option: 'true' })
    expect(body.query.stats).toEqual([{ type: 'and', filters: l.trade!.map((t) => ({ id: t.id })) }])
    expect(l.trade!.length).toBe(2)
  })

  it('stat-фильтр с числами — с диапазоном', () => {
    const body = buildItemQuery({ ...row('headhunter-leather-belt'), trade: [{ id: 'explicit.stat_1', min: 2, max: 5 }] }, 10, DIVINE)
    expect(body.query.stats).toEqual([{ type: 'and', filters: [{ id: 'explicit.stat_1', value: { min: 2, max: 5 } }] }])
  })

  it('название поиска для live search', () => {
    expect(watchTitle(row('shavronnes-wrappings-occultists-vestment-6l'), 189.9, DIVINE)).toBe("Shavronne's Wrappings 6L ≤ 189 c")
    expect(watchTitle(row('foulborn-headhunter-culling-strike-leather-belt'), 141723, DIVINE)).toBe('Foulborn Headhunter (Culling Strike) ≤ 420.41 div')
  })
})

describe('флаг «Предметов»', () => {
  it('раскрыто (ITEMFLIP_RELEASED), POETH_ITEMFLIP=1 включает в dev, только PoE 1', () => {
    expect(ITEMFLIP_RELEASED).toBe(true)
    expect(itemFlipDevFlag({ POETH_ITEMFLIP: '1' })).toBe(true)
    expect(itemFlipDevFlag({ POETH_ITEMFLIP: 'true' })).toBe(false)
    expect(itemFlipDevFlag({})).toBe(false)
    expect(itemFlipOn({ id: 'poe1' }, true)).toBe(true)
    expect(itemFlipOn({ id: 'poe1' }, false)).toBe(true)
    expect(itemFlipOn({ id: 'poe1' }, false, false)).toBe(false)
    expect(itemFlipOn({ id: 'poe2' }, true)).toBe(false)
    expect(itemFlipOn({ id: 'poe1' }, false, true)).toBe(true)
  })
})
