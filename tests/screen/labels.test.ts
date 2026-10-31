import { describe, expect, it } from 'vitest'
import { anchorOf, buildLabels, formatPrice, toCss } from '@shared/screen/labels'
import type { ScreenCell, ScreenRead } from '@shared/types/screen'

// Подписи цен (S68): итог вкладки, «примерно», ячейки без цены и без числа; формат цены RU/EN; координаты снимка
// (физические точки) → CSS-точки оверлея при масштабе Windows 100/125/150 %.

const cell = (x: number, item: string | null, present: boolean, count: number | null, sure = true, extra: Partial<ScreenCell> = {}): ScreenCell => ({
  rect: { x, y: 100, width: 70, height: 70 },
  item,
  present,
  count,
  countSure: sure,
  match: 0.9,
  ...extra
})

const read = (cells: ScreenCell[], tab: string | null = 'orbs'): ScreenRead => ({
  game: 'poe1',
  window: 'stash',
  tab,
  scale: 1,
  client: { width: 2560, height: 1440 },
  cells,
  at: 0,
  ms: { find: 1, match: 1, ocr: 1, total: 3 }
})

const PRICES: Record<string, number> = { 'Chaos Orb': 1, 'Divine Orb': 150, 'Orb of Alchemy': 0.05 }
const priceOf = (n: string) => (PRICES[n] ? { unit: PRICES[n], low: n === 'Orb of Alchemy' } : null)

describe('подписи', () => {
  it('итог — цена × число по ячейкам с ценой и числом', () => {
    const l = buildLabels(
      read([cell(0, 'Chaos Orb', true, 492), cell(80, 'Divine Orb', true, 2), cell(160, 'Mirror of Kalandra', true, 1), cell(240, 'Divine Orb', false, null)]),
      priceOf,
      { base: 'chaos', divine: 150 }
    )
    expect(l.total).toBe(492 + 300)
    expect(l.labels).toHaveLength(2)
    expect(l.unpriced).toBe(1)
    expect(l.uncounted).toBe(0)
    expect(l.counted).toBe(2)
    expect(l.approx).toBe(false)
  })

  it('неуверенное число → итог примерный; без числа — подпись есть, в итог не входит', () => {
    const l = buildLabels(read([cell(0, 'Chaos Orb', true, 10, false), cell(80, 'Divine Orb', true, null)]), priceOf, { base: 'chaos', divine: 150 })
    expect(l.total).toBe(10)
    expect(l.approx).toBe(true)
    expect(l.uncounted).toBe(1)
    expect(l.labels.find((x) => x.item === 'Divine Orb')?.stack).toBeNull()
  })

  it('ни одного числа — итога нет (counted 0), подписи цен есть', () => {
    const l = buildLabels(read([cell(0, 'Chaos Orb', true, null), cell(80, 'Divine Orb', true, null)]), priceOf, { base: 'chaos', divine: 150 })
    expect(l.counted).toBe(0)
    expect(l.total).toBe(0)
    expect(l.labels).toHaveLength(2)
    expect(l.uncounted).toBe(2)
  })

  it('уровни с одним рисунком без раскладки — без цены (какой из уровней, неизвестно)', () => {
    const l = buildLabels(read([cell(0, 'Chaos Orb', true, 5, true, { alt: ['Greater Chaos Orb'] })], null), priceOf, { base: 'chaos', divine: null })
    expect(l.labels).toHaveLength(0)
    expect(l.unpriced).toBe(1)
  })

  it('мало сделок → сомнение', () => {
    const l = buildLabels(read([cell(0, 'Orb of Alchemy', true, 3)]), priceOf, { base: 'chaos', divine: 150 })
    expect(l.labels[0].doubt).toBe(true)
  })

  it('итог ставится у области ячеек', () => {
    expect(anchorOf(read([cell(10, 'Chaos Orb', true, 1), cell(200, 'Divine Orb', true, 1)]))).toEqual({ x: 10, y: 100, width: 260, height: 70 })
  })
})

describe('формат цены', () => {
  it('RU — запятая, от 1 divine — в divine', () => {
    expect(formatPrice(3.45, 'chaos', 150, 'ru')).toBe('3,5 c')
    expect(formatPrice(12.4, 'chaos', 150, 'ru')).toBe('12 c')
    expect(formatPrice(300, 'chaos', 150, 'ru')).toBe('2 div')
    expect(formatPrice(225, 'chaos', 150, 'en')).toBe('1.5 div')
    expect(formatPrice(0.04, 'chaos', 150, 'en')).toBe('<0.1 c')
    expect(formatPrice(7, 'exalted', null, 'en')).toBe('7 ex')
  })
})

describe('координаты при масштабе Windows', () => {
  for (const dpr of [1, 1.25, 1.5])
    it(`${dpr * 100} %`, () => {
      // оверлей лежит на клиентской области: CSS-точка = физическая / dpr
      const r = toCss({ x: 150, y: 300, width: 75, height: 75 }, dpr)
      expect(r.x * dpr).toBeCloseTo(150)
      expect(r.width * dpr).toBeCloseTo(75)
    })
})
