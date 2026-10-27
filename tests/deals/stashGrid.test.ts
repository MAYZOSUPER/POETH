import { describe, expect, it } from 'vitest'
import {
  GRID_SIZE,
  STASH_GEOMETRY,
  autoGridRect,
  calibratedGridRect,
  calibrationFromCorners,
  isValidPos,
  resolveGridKind,
  stashCellRect,
  uiOffsetX
} from '@shared/deals/stashGrid'

const R1080 = { width: 1920, height: 1080 }
const R1440 = { width: 2560, height: 1440 }
const R4K = { width: 3840, height: 2160 }
const UW_21_9 = { width: 3440, height: 1440 }
const UW_32_9 = { width: 5120, height: 1440 }

describe('константы', () => {
  it('сетка по центру панели APT: ≈632.7 px и ячейка ≈52.7 px при 1080p', () => {
    expect(GRID_SIZE * 1080).toBeCloseTo(632.7, 1)
    expect((GRID_SIZE * 1080) / 12).toBeCloseTo(52.73, 1)
    const panel = STASH_GEOMETRY.panelWidth * 1080
    const g = autoGridRect(R1080)
    expect(g.x + g.width + STASH_GEOMETRY.gridLeft * 1080).toBeCloseTo(panel, 6)
  })
})

describe('autoGridRect — масштаб по высоте окна', () => {
  it('1080p', () => {
    const g = autoGridRect(R1080)
    expect(g.x).toBeCloseTo(16.41, 1)
    expect(g.y).toBeCloseTo(148.63, 1)
    expect(g.width).toBeCloseTo(632.7, 1)
    expect(g.height).toBe(g.width)
  })

  it('1440p и 4K — пропорционально высоте', () => {
    const a = autoGridRect(R1080)
    const b = autoGridRect(R1440)
    const c = autoGridRect(R4K)
    expect(b.x).toBeCloseTo((a.x * 1440) / 1080, 6)
    expect(b.y).toBeCloseTo((a.y * 1440) / 1080, 6)
    expect(b.width).toBeCloseTo((a.width * 1440) / 1080, 6)
    expect(c.width).toBeCloseTo(a.width * 2, 6)
    expect(c.y).toBeCloseTo(a.y * 2, 6)
  })

  it('21:9 (3440×1440) — как 1440p: интерфейс помещается без полей', () => {
    expect(uiOffsetX(UW_21_9)).toBe(0)
    expect(autoGridRect(UW_21_9)).toEqual(autoGridRect(R1440))
  })

  it('32:9 (5120×1440) — левое чёрное поле по Poe-Lurker', () => {
    const off = uiOffsetX(UW_32_9)
    expect(off).toBeCloseTo((5120 - 3455) / 2, 6)
    const g = autoGridRect(UW_32_9)
    expect(g.x).toBeCloseTo(off + autoGridRect(R1440).x, 6)
    expect(g.width).toBeCloseTo(autoGridRect(R1440).width, 6)
  })

  it('вкладка в папке — сетка ниже на 42/1119·H', () => {
    const a = autoGridRect(R1080)
    const b = autoGridRect(R1080, { inFolder: true })
    expect(b.y - a.y).toBeCloseTo((42 / 1119) * 1080, 6)
    expect(b.x).toBe(a.x)
  })
})

describe('stashCellRect', () => {
  it('обычная вкладка 12×12: первая и последняя ячейка (1080p)', () => {
    const g = autoGridRect(R1080)
    const first = stashCellRect(R1080, { left: 1, top: 1 })!
    expect(first.kind).toBe('normal')
    expect(first.x).toBeCloseTo(g.x, 6)
    expect(first.y).toBeCloseTo(g.y, 6)
    expect(first.width).toBeCloseTo(g.width / 12, 6)
    const last = stashCellRect(R1080, { left: 12, top: 12 })!
    expect(last.x + last.width).toBeCloseTo(g.x + g.width, 6)
    expect(last.y + last.height).toBeCloseTo(g.y + g.height, 6)
  })

  it('позиция > 12 → quad 24×24, ячейка вдвое меньше (1440p)', () => {
    const g = autoGridRect(R1440)
    const c = stashCellRect(R1440, { left: 13, top: 2 })!
    expect(c.kind).toBe('quad')
    expect(c.width).toBeCloseTo(g.width / 24, 6)
    expect(c.x).toBeCloseTo(g.x + 12 * (g.width / 24), 6)
    expect(c.y).toBeCloseTo(g.y + g.width / 24, 6)
  })

  it('4K: ячейка 7×3 обычной вкладки', () => {
    const g = autoGridRect(R4K)
    const c = stashCellRect(R4K, { left: 7, top: 3 })!
    const cell = g.width / 12
    expect(c.x).toBeCloseTo(g.x + 6 * cell, 6)
    expect(c.y).toBeCloseTo(g.y + 2 * cell, 6)
    expect(c.width).toBeCloseTo(105.46, 1)
  })

  it('21:9: та же ячейка, что и в 16:9 той же высоты', () => {
    expect(stashCellRect(UW_21_9, { left: 5, top: 9 })).toEqual(stashCellRect(R1440, { left: 5, top: 9 }))
  })

  it('режим quad для позиции ≤ 12 и память о вкладке', () => {
    expect(stashCellRect(R1080, { left: 3, top: 3 }, { mode: 'quad' })!.kind).toBe('quad')
    expect(stashCellRect(R1080, { left: 3, top: 3 }, { knownQuad: true })!.kind).toBe('quad')
    expect(stashCellRect(R1080, { left: 3, top: 3 })!.kind).toBe('normal')
  })

  it('вне сетки и неизвестный размер окна — null', () => {
    expect(stashCellRect(R1080, { left: 13, top: 1 }, { mode: 'normal' })).toBeNull()
    expect(stashCellRect(R1080, { left: 25, top: 1 })).toBeNull()
    expect(stashCellRect(R1080, { left: 0, top: 1 })).toBeNull()
    expect(stashCellRect({ width: 0, height: 0 }, { left: 1, top: 1 })).toBeNull()
  })

  it('калибровка важнее автоматики', () => {
    const cal = { left: 20, top: 160, width: 600, height: 600, refWidth: 1920, refHeight: 1080 }
    const c = stashCellRect(R1080, { left: 2, top: 1 }, { calibration: cal })!
    expect(c).toEqual({ kind: 'normal', x: 70, y: 160, width: 50, height: 50 })
  })
})

describe('resolveGridKind / isValidPos', () => {
  it('auto по позиции', () => {
    expect(resolveGridKind('auto', { left: 12, top: 12 })).toBe('normal')
    expect(resolveGridKind('auto', { left: 1, top: 13 })).toBe('quad')
    expect(resolveGridKind('normal', { left: 20, top: 20 })).toBe('normal')
  })
  it('границы', () => {
    expect(isValidPos({ left: 24, top: 24 }, 'quad')).toBe(true)
    expect(isValidPos({ left: 1.5, top: 1 }, 'normal')).toBe(false)
  })
})

describe('калибровка', () => {
  it('из двух кликов в любом порядке, с размером окна', () => {
    const cal = calibrationFromCorners({ x: 650, y: 790 }, { x: 17, y: 157 }, R1080)
    expect(cal).toEqual({ left: 17, top: 157, width: 633, height: 633, refWidth: 1920, refHeight: 1080 })
  })

  it('слишком маленький прямоугольник или вне окна — null', () => {
    expect(calibrationFromCorners({ x: 10, y: 10 }, { x: 60, y: 60 }, R1080)).toBeNull()
    expect(calibrationFromCorners({ x: -5, y: 10 }, { x: 600, y: 600 }, R1080)).toBeNull()
    expect(calibrationFromCorners({ x: 10, y: 10 }, { x: 600, y: 1200 }, R1080)).toBeNull()
  })

  it('при другом размере окна — масштаб по высоте (1080p → 1440p, 4K)', () => {
    const cal = { left: 17, top: 157, width: 633, height: 633, refWidth: 1920, refHeight: 1080 }
    const r = calibratedGridRect(cal, R1440)
    expect(r.x).toBeCloseTo((17 * 1440) / 1080, 6)
    expect(r.y).toBeCloseTo((157 * 1440) / 1080, 6)
    expect(r.width).toBeCloseTo(844, 6)
    const k = calibratedGridRect(cal, R4K)
    expect(k).toEqual({ x: 34, y: 314, width: 1266, height: 1266 })
  })

  it('масштаб учитывает чёрные поля 32:9', () => {
    const cal = calibrationFromCorners({ x: 22, y: 198 }, { x: 866, y: 1042 }, R1440)!
    const r = calibratedGridRect(cal, UW_32_9)
    expect(r.x).toBeCloseTo(uiOffsetX(UW_32_9) + 22, 6)
    expect(r.width).toBe(844)
  })

  it('без размера окна при калибровке — как есть', () => {
    const r = calibratedGridRect({ left: 1, top: 2, width: 300, height: 300 }, R4K)
    expect(r).toEqual({ x: 1, y: 2, width: 300, height: 300 })
  })
})
