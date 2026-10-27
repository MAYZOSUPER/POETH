import { describe, expect, it } from 'vitest'
import { placeWidget, poePanelWidth } from '@renderer/overlay/placement'

const VIEW = { width: 1920, height: 1080 }
const SIZE = { width: 400, height: 300 }

describe('poePanelWidth', () => {
  it('370 px при 800×600, масштаб по высоте', () => {
    expect(poePanelWidth({ width: 800, height: 600 })).toBe(370)
    expect(poePanelWidth({ width: 1920, height: 1080 })).toBe(666)
    expect(poePanelWidth({ width: 2560, height: 1440 })).toBe(888)
  })

  it('не шире половины окна (узкое окно)', () => {
    expect(poePanelWidth({ width: 900, height: 1080 })).toBe(450)
  })
})

describe('placeWidget: opposite', () => {
  it('предмет в инвентаре (справа) → окно слева от инвентаря', () => {
    const p = placeWidget({ mode: 'opposite', anchor: { x: 1700, y: 600 }, size: SIZE, viewport: VIEW })
    expect(p.x + SIZE.width).toBeLessThanOrEqual(VIEW.width - 666)
    expect(p.x).toBe(1920 - 666 - 12 - 400)
    expect(p.y).toBe(600 - 150)
  })

  it('предмет в стэше (слева) → окно справа от стэша', () => {
    const p = placeWidget({ mode: 'opposite', anchor: { x: 200, y: 300 }, size: SIZE, viewport: VIEW })
    expect(p.x).toBe(666 + 12)
    expect(p.y).toBe(150)
  })

  it('окно не выходит за края по вертикали', () => {
    expect(placeWidget({ mode: 'opposite', anchor: { x: 1700, y: 5 }, size: SIZE, viewport: VIEW }).y).toBe(8)
    expect(placeWidget({ mode: 'opposite', anchor: { x: 1700, y: 1075 }, size: SIZE, viewport: VIEW }).y).toBe(
      1080 - 300 - 8
    )
  })

  it('узкое окно: виджет прижат к краю, но не уходит за него', () => {
    const view = { width: 1000, height: 1080 }
    const p = placeWidget({ mode: 'opposite', anchor: { x: 900, y: 500 }, size: SIZE, viewport: view })
    expect(p.x).toBeGreaterThanOrEqual(8)
    expect(p.x + SIZE.width).toBeLessThanOrEqual(view.width - 8)
  })

  it('виджет больше окна — левый верхний угол виден', () => {
    const p = placeWidget({ mode: 'opposite', anchor: { x: 100, y: 100 }, size: { width: 900, height: 900 }, viewport: { width: 800, height: 600 } })
    expect(p).toEqual({ x: 8, y: 8 })
  })
})

describe('placeWidget: cursor', () => {
  it('справа-снизу от курсора', () => {
    expect(placeWidget({ mode: 'cursor', anchor: { x: 500, y: 400 }, size: SIZE, viewport: VIEW })).toEqual({
      x: 512,
      y: 412
    })
  })

  it('у правого/нижнего края — с другой стороны курсора', () => {
    expect(placeWidget({ mode: 'cursor', anchor: { x: 1800, y: 1000 }, size: SIZE, viewport: VIEW })).toEqual({
      x: 1800 - 12 - 400,
      y: 1000 - 12 - 300
    })
  })

  it('у левого верхнего угла — прижат к отступу', () => {
    const p = placeWidget({ mode: 'cursor', anchor: { x: 0, y: 0 }, size: SIZE, viewport: VIEW, margin: 4, gap: 0 })
    expect(p).toEqual({ x: 4, y: 4 })
  })
})
