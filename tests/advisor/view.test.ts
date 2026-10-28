import { describe, expect, it } from 'vitest'
import { estimateStrategy } from '@shared/advisor/estimate'
import { buildPriceIndex, type PriceEntry } from '@shared/wealth/prices'
import type { AdvisorStrategyView } from '@shared/types/advisor'
import {
  DEFAULT_ADVISOR_VIEW,
  buildRows,
  sourceCounts,
  chaosText,
  farmButton,
  hm,
  itemNs,
  minutesText,
  qtyText,
  tx,
  versus
} from '../../src/renderer/src/panels/advisor/view'
import { done, farm, strategy, T } from './fixtures'

const MIN = 60_000
const ex = (name: string, chaos: number): PriceEntry => ({ name, kind: 'stackable', chaos, source: 'exchange' })
const idx = buildPriceIndex([[ex('Essence Scarab', 2), ex('Deafening Essence of Greed', 5), ex('Chaos Orb', 1)]])

const views: AdvisorStrategyView[] = [
  // прибыль 8 за карту, 5 мин → 96/ч
  strategy({ id: 'a', difficulty: 2 }),
  // прибыль 2×1 − 0 = 2 за карту, 4 мин → 30/ч
  strategy({ id: 'b', difficulty: 1, minutesPerMap: 4, inputs: [], outputs: [{ item: { kind: 'stackable', ref: 'Chaos Orb' }, qty: 2 }] }),
  // нет цены
  strategy({ id: 'c', difficulty: 1, outputs: [{ item: { kind: 'stackable', ref: 'Nope' }, qty: 1 }] })
].map((s) => ({ strategy: s, estimate: estimateStrategy(s, idx) }))

describe('советник: карточки', () => {
  it('по доходу: без цены — в конце; доход в час по времени из стратегии', () => {
    const rows = buildRows(views, null, DEFAULT_ADVISOR_VIEW)
    expect(rows.map((r) => r.strategy.id)).toEqual(['a', 'b', 'c'])
    expect(rows[0].perHour).toBe(96)
    expect(rows[0].time).toEqual({ minutes: 5, maps: 0, source: 'default' })
    expect(rows[1].perHour).toBe(30)
    expect(rows[2].perHour).toBeNull()
    expect(rows[2].estimate.profit).toBeNull()
  })

  it('дешёвый вход: по стоимости входа за карту, без цены входа — в конце', () => {
    const withCost = [
      ...views,
      ...[strategy({ id: 'd', inputs: [{ item: { kind: 'stackable', ref: 'Nope' }, qty: 1 }] })].map((s) => ({
        strategy: s,
        estimate: estimateStrategy(s, idx)
      }))
    ]
    // b — вход 0, a и c — по 2 (выше доход у a), d — нет цены входа
    expect(buildRows(withCost, null, { sort: 'cost', easyOnly: false, src: 'all' }).map((r) => r.strategy.id)).toEqual(['b', 'a', 'c', 'd'])
  })

  it('сначала лёгкие; «только лёгкие» убирает сложность 2–3', () => {
    expect(buildRows(views, null, { sort: 'easy', easyOnly: false, src: 'all' }).map((r) => r.strategy.id)).toEqual(['b', 'c', 'a'])
    expect(buildRows(views, null, { sort: 'profit', easyOnly: true, src: 'all' }).map((r) => r.strategy.id)).toEqual(['b', 'c'])
  })

  it('время карты из трекера меняет доход в час; «Мой результат» по метке', () => {
    const f = farm([done({ maps: 10, durationMs: 40 * MIN, profitChaos: 200 }, 'a')])
    const [a] = buildRows(views, f, DEFAULT_ADVISOR_VIEW)
    expect(a.time).toEqual({ minutes: 4, maps: 10, source: 'mine' })
    expect(a.perHour).toBe(120)
    expect(a.mine?.perHour).toBe(300)
  })

  it('нулевое время карты в стратегии — дохода в час нет, прибыль за карту есть', () => {
    const zero = [strategy({ id: 'z', minutesPerMap: 0 })].map((s) => ({ strategy: s, estimate: estimateStrategy(s, idx) }))
    const [z] = buildRows(zero, null, DEFAULT_ADVISOR_VIEW)
    expect(z.time).toBeNull()
    expect(z.perHour).toBeNull()
    expect(z.estimate.profit).toBe(8)
  })
})

describe('советник: кнопка сессии и сравнение', () => {
  it('нет сессии — начать; идёт без метки или с другой — отметить; с этой — идёт', () => {
    expect(farmButton('a', null)).toBe('start')
    expect(farmButton('a', farm([]))).toBe('start')
    expect(farmButton('a', farm([], { st: {} }))).toBe('tag')
    expect(farmButton('a', farm([], { st: {}, strategy: 'b' }))).toBe('tag')
    expect(farmButton('a', farm([], { st: {}, strategy: 'a' }))).toBe('running')
  })

  it('мой результат против оценки (±25%)', () => {
    expect(versus(130, 100)).toBe('above')
    expect(versus(110, 100)).toBe('near')
    expect(versus(60, 100)).toBe('below')
    expect(versus(null, 100)).toBeNull()
    expect(versus(50, null)).toBeNull()
    expect(versus(50, 0)).toBeNull()
    expect(versus(-5, -10)).toBe('above')
  })
})

describe('советник: числа и имена RU/EN', () => {
  it('chaos, количества, минуты', () => {
    expect(chaosText(1234.4, 'en')).toBe('1,234')
    expect(chaosText(1234.4, 'ru')).toBe('1 234')
    expect(chaosText(5.25, 'ru')).toBe('5,3')
    expect(chaosText(0.123, 'en')).toBe('0.12')
    expect(chaosText(-12, 'en')).toBe('−12')
    expect(qtyText(0.3, 'ru')).toBe('0,3')
    expect(qtyText(20, 'en')).toBe('20')
    expect(minutesText(4.75, 'en')).toBe('4.8')
  })

  it('часы и минуты, текст по языку, пространство имён предмета', () => {
    expect(hm(95 * MIN)).toEqual({ h: 1, m: 35 })
    expect(hm(-5)).toEqual({ h: 0, m: 0 })
    expect(tx(T('да', 'yes'), 'ru')).toBe('да')
    expect(tx(T('да', 'yes'), 'en')).toBe('yes')
    expect(itemNs({ kind: 'card', ref: 'The Doctor' })).toBe('DIVINATION_CARD')
    expect(itemNs({ kind: 'unique', ref: 'Tabula Rasa' })).toBe('UNIQUE')
    expect(itemNs({ kind: 'gem', ref: 'Enlighten Support' })).toBe('GEM')
    expect(itemNs({ kind: 'map', ref: 'Strand Map' })).toBe('ITEM')
  })
})

describe('советник: фильтр источника (S17)', () => {
  const mixed: AdvisorStrategyView[] = (
    [
      ['o', 'official'],
      ['c', 'community'],
      ['m', 'mine'],
      ['i', 'imported'],
      ['w', 'wealthy']
    ] as const
  ).map(([id, kind]) => {
    const s = strategy({ id, source: { kind, date: '2026-11', ...(kind === 'wealthy' ? { author: 'A', url: 'https://wealthyexile.com/s/1' } : {}) } })
    return { strategy: s, estimate: estimateStrategy(s, idx) }
  })
  it('наши, сообщество, мои, импорт (с Wealthy Exile); числа для чипов', () => {
    const ids = (src: typeof DEFAULT_ADVISOR_VIEW.src) => buildRows(mixed, null, { ...DEFAULT_ADVISOR_VIEW, src }).map((r) => r.strategy.id).sort()
    expect(ids('all')).toEqual(['c', 'i', 'm', 'o', 'w'])
    expect(ids('official')).toEqual(['o'])
    expect(ids('mine')).toEqual(['m'])
    expect(ids('imported')).toEqual(['i', 'w'])
    expect(sourceCounts(mixed)).toEqual({ all: 5, official: 1, community: 1, mine: 1, imported: 2 })
  })
})
