import { describe, expect, it } from 'vitest'
import {
  POPUP_CURSOR_GAP as GAP,
  POPUP_CURSOR_LIFT as LIFT,
  POPUP_MARGIN as M,
  clampToArea,
  intersect,
  placeWidget,
  type PlacementInput,
  type Point,
  type Rect
} from '@renderer/overlay/placement'

const VIEW = { width: 1920, height: 1080 }
const SIZE = { width: 384, height: 500 }

function place(over: Partial<PlacementInput> & { anchor: Point }): Point {
  return placeWidget({ mode: 'cursor', size: SIZE, viewport: VIEW, ...over })
}

/** Окно целиком внутри прямоугольника и в целых пикселях. */
function expectInside(p: Point, size: { width: number; height: number }, r: Rect): void {
  expect(Number.isInteger(p.x) && Number.isInteger(p.y), JSON.stringify(p)).toBe(true)
  expect(p.x).toBeGreaterThanOrEqual(r.x + M)
  expect(p.y).toBeGreaterThanOrEqual(r.y + M)
  expect(p.x + size.width).toBeLessThanOrEqual(r.x + r.width - M)
  expect(p.y + size.height).toBeLessThanOrEqual(r.y + r.height - M)
}

describe('placeWidget: у курсора (по умолчанию)', () => {
  it('курсор в правой половине (инвентарь) — окно слева от курсора, верх на уровне курсора', () => {
    expect(place({ anchor: { x: 1500, y: 400 } })).toEqual({ x: 1500 - GAP - 384, y: 400 - LIFT })
  })

  it('курсор в левой половине (тайник) — окно справа от курсора', () => {
    expect(place({ anchor: { x: 300, y: 400 } })).toEqual({ x: 300 + GAP, y: 400 - LIFT })
  })

  it('окно не накрывает курсор (и подсказку предмета рядом с ним)', () => {
    for (const x of [100, 700, 959, 960, 1300, 1800]) {
      const p = place({ anchor: { x, y: 500 } })
      const covers = p.x <= x && x <= p.x + SIZE.width
      expect(covers, `x=${x}`).toBe(false)
    }
  })

  it('у нижнего края окно поднимается, у верхнего — опускается', () => {
    expect(place({ anchor: { x: 1500, y: 1070 } }).y).toBe(1080 - M - 500)
    expect(place({ anchor: { x: 1500, y: 2 } }).y).toBe(M)
  })

  it('в углах окно не выходит за окно игры', () => {
    for (const anchor of [
      { x: 0, y: 0 },
      { x: 1919, y: 0 },
      { x: 0, y: 1079 },
      { x: 1919, y: 1079 }
    ]) {
      expectInside(place({ anchor }), SIZE, { x: 0, y: 0, ...VIEW })
    }
  })

  it('окно больше области — виден левый верхний угол', () => {
    const p = placeWidget({ mode: 'cursor', anchor: { x: 700, y: 500 }, size: { width: 900, height: 900 }, viewport: { width: 800, height: 600 } })
    expect(p).toEqual({ x: M, y: M })
  })
})

describe('placeWidget: у левого / правого края', () => {
  it('край окна игры, по вертикали у курсора', () => {
    expect(place({ mode: 'left', anchor: { x: 1500, y: 400 } })).toEqual({ x: M, y: 400 - LIFT })
    expect(place({ mode: 'right', anchor: { x: 300, y: 400 } })).toEqual({ x: 1920 - M - 384, y: 400 - LIFT })
  })

  it('край монитора, если игра шире монитора', () => {
    const area = { x: 0, y: 0, width: 1920, height: 1080 }
    const p = placeWidget({ mode: 'right', anchor: { x: 300, y: 400 }, size: SIZE, viewport: { width: 2600, height: 1080 }, area })
    expect(p.x + SIZE.width).toBe(1920 - M)
  })
})

describe('placeWidget: «где оставил» (окно перетащили за шапку)', () => {
  it('открывается там, где оставили, — независимо от курсора', () => {
    expect(place({ mode: 'saved', saved: { x: 700, y: 120 }, anchor: { x: 1500, y: 900 } })).toEqual({ x: 700, y: 120 })
    expect(place({ mode: 'saved', saved: { x: 700, y: 120 }, anchor: { x: 100, y: 100 } })).toEqual({ x: 700, y: 120 })
  })

  it('ещё не перетаскивали — как «у курсора»', () => {
    const anchor = { x: 1500, y: 400 }
    expect(place({ mode: 'saved', saved: null, anchor })).toEqual(place({ mode: 'cursor', anchor }))
  })

  it('окно игры стало меньше или другой монитор — окно целиком внутри области', () => {
    const area = { x: 0, y: 0, width: 1280, height: 720 }
    const p = placeWidget({ mode: 'saved', saved: { x: 1700, y: 900 }, anchor: { x: 10, y: 10 }, size: SIZE, viewport: { width: 1280, height: 720 }, area })
    expectInside(p, SIZE, area)
  })

  it('при перетаскивании окно не уходит за край окна игры и монитора (125 %: дробные DIP)', () => {
    const view = { width: 1536, height: 864 }
    const area = { x: 0, y: 0, width: 1536, height: 864 }
    for (const raw of [{ x: -300, y: -50 }, { x: 1500.4, y: 700.6 }, { x: 600.5, y: 200.5 }]) {
      expectInside(clampToArea(raw, SIZE, view, area), SIZE, area)
    }
    expect(clampToArea({ x: 600.4, y: 200.6 }, SIZE, view, area)).toEqual({ x: 600, y: 201 })
  })
})

describe('placeWidget: два монитора', () => {
  // Игра в окне 3000×1000 стоит на двух мониторах: левый (-1920…0) и основной (0…1920).
  // Окно оверлея начинается на экране с x = -1000 → мониторы в его координатах:
  const view = { width: 3000, height: 1000 }
  const left: Rect = { x: -1920 + 1000, y: 0, width: 1920, height: 1080 }
  const main: Rect = { x: 0 + 1000, y: 0, width: 1920, height: 1080 }

  it('курсор на основном мониторе — окно на нём же', () => {
    const p = placeWidget({ mode: 'cursor', anchor: { x: 1100, y: 500 }, size: SIZE, viewport: view, area: main })
    expect(p.x).toBe(1100 + GAP)
    expectInside(p, SIZE, intersect(main, { x: 0, y: 0, ...view })!)
  })

  it('курсор у стыка на левом мониторе — окно не переезжает через стык', () => {
    const p = placeWidget({ mode: 'cursor', anchor: { x: 950, y: 500 }, size: SIZE, viewport: view, area: left })
    expectInside(p, SIZE, intersect(left, { x: 0, y: 0, ...view })!)
    expect(p.x + SIZE.width).toBeLessThanOrEqual(1000)
  })

  it('игра свисает за нижний край монитора — окно в видимой части', () => {
    const area = { x: 0, y: 0, width: 1920, height: 1080 }
    const p = placeWidget({ mode: 'cursor', anchor: { x: 1500, y: 1050 }, size: SIZE, viewport: { width: 1920, height: 1300 }, area })
    expect(p.y + SIZE.height).toBeLessThanOrEqual(1080 - M)
  })

  it('монитор не пересекается с окном игры — ограничиваемся окном игры', () => {
    const p = placeWidget({ mode: 'cursor', anchor: { x: 1500, y: 400 }, size: SIZE, viewport: VIEW, area: { x: 5000, y: 0, width: 100, height: 100 } })
    expect(p).toEqual({ x: 1500 - GAP - 384, y: 400 - LIFT })
  })
})

describe('placeWidget: масштаб Windows 125 % / 150 %', () => {
  it('125 %: 1920×1080 → 1536×864 DIP, дробный курсор → целые пиксели внутри окна', () => {
    const view = { width: 1920 / 1.25, height: 1080 / 1.25 }
    const anchor = { x: 1801 / 1.25, y: 433 / 1.25 } // 1440.8, 346.4
    const size = { width: 384, height: 400 }
    const p = placeWidget({ mode: 'cursor', anchor, size, viewport: view })
    expect(p).toEqual({ x: Math.round(1440.8 - GAP - 384), y: Math.round(346.4 - LIFT) })
    expectInside(p, size, { x: 0, y: 0, ...view })
  })

  it('150 %: 2560×1440 → 1706.67×960 DIP, курсор в правом нижнем углу', () => {
    const view = { width: 2560 / 1.5, height: 1440 / 1.5 }
    const size = { width: 420, height: 700 }
    for (const mode of ['cursor', 'left', 'right'] as const) {
      const p = placeWidget({ mode, anchor: { x: 2550 / 1.5, y: 1430 / 1.5 }, size, viewport: view })
      expectInside(p, size, { x: 0, y: 0, ...view })
    }
  })

  it('150 %: правый край с дробной шириной не вылезает даже на полпикселя', () => {
    const view = { width: 2560 / 1.5, height: 960 }
    const p = placeWidget({ mode: 'right', anchor: { x: 10, y: 10 }, size: { width: 384, height: 100 }, viewport: view })
    expect(p.x + 384).toBeLessThanOrEqual(view.width - M)
    expect(p.x).toBe(Math.floor(view.width - M - 384))
  })
})

describe('intersect', () => {
  it('пересечение и его отсутствие', () => {
    expect(intersect({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: 5, width: 10, height: 10 })).toEqual({ x: 5, y: 5, width: 5, height: 5 })
    expect(intersect({ x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 0, width: 5, height: 5 })).toBeNull()
  })
})
