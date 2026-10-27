import { describe, expect, it } from 'vitest'
import {
  MAX_INTERACTIVE_RECTS,
  distanceToSegment,
  pointInRects,
  sanitizeRects,
  shouldAutoHide
} from '../../src/main/focus/hitTest'

const WIDGET = { x: 600, y: 300, width: 400, height: 300 }

describe('pointInRects', () => {
  it('внутри / на границе / снаружи', () => {
    expect(pointInRects({ x: 600, y: 300 }, [WIDGET])).toBe(true)
    expect(pointInRects({ x: 999, y: 599 }, [WIDGET])).toBe(true)
    expect(pointInRects({ x: 1000, y: 450 }, [WIDGET])).toBe(false)
    expect(pointInRects({ x: 10, y: 10 }, [])).toBe(false)
  })
})

describe('sanitizeRects (данные из renderer)', () => {
  it('оставляет только корректные прямоугольники', () => {
    const raw = [
      WIDGET,
      { x: 1, y: 2, width: 0, height: 5 },
      { x: NaN, y: 0, width: 5, height: 5 },
      { x: '1', y: 0, width: 5, height: 5 },
      null,
      'rect',
      { x: 5, y: 6, width: 7, height: 8, extra: true }
    ]
    expect(sanitizeRects(raw)).toEqual([WIDGET, { x: 5, y: 6, width: 7, height: 8 }])
    expect(sanitizeRects('nope')).toEqual([])
    expect(sanitizeRects(undefined)).toEqual([])
  })

  it('ограничивает количество', () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ x: i, y: 0, width: 1, height: 1 }))
    expect(sanitizeRects(many)).toHaveLength(MAX_INTERACTIVE_RECTS)
  })
})

describe('distanceToSegment', () => {
  it('проекция внутрь отрезка и концы', () => {
    expect(distanceToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3)
    expect(distanceToSegment({ x: -4, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5)
    expect(distanceToSegment({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(5)
  })
})

describe('shouldAutoHide (виджет Ctrl+D прячется, когда мышь уходит)', () => {
  const from = { x: 1500, y: 450 } // предмет в инвентаре, виджет слева от него

  it('рядом с предметом — не прятать', () => {
    expect(shouldAutoHide({ x: 1550, y: 480 }, from, [WIDGET], 100)).toBe(false)
  })

  it('мышь идёт от предмета к виджету — не прятать', () => {
    expect(shouldAutoHide({ x: 1250, y: 460 }, from, [WIDGET], 100)).toBe(false)
    expect(shouldAutoHide({ x: 1010, y: 440 }, from, [WIDGET], 100)).toBe(false)
  })

  it('над виджетом — никогда', () => {
    expect(shouldAutoHide({ x: 700, y: 350 }, from, [WIDGET], 100)).toBe(false)
  })

  it('мышь ушла в сторону — спрятать', () => {
    expect(shouldAutoHide({ x: 1500, y: 900 }, from, [WIDGET], 100)).toBe(true)
    expect(shouldAutoHide({ x: 1800, y: 100 }, from, [WIDGET], 100)).toBe(true)
  })

  it('без прямоугольников — просто расстояние от точки нажатия', () => {
    expect(shouldAutoHide({ x: 1560, y: 450 }, from, [], 100)).toBe(false)
    expect(shouldAutoHide({ x: 1650, y: 450 }, from, [], 100)).toBe(true)
  })
})
