// Где показать всплывающее окно оверлея (popup: прайс-чек, демо «текст предмета»).
// Чистый модуль — tests/overlay/placement.test.ts. Все координаты — DIP окна оверлея
// (= клиентская область игры); при масштабе 125/150 % они дробные, итог округляется.
//
// - 'cursor' (по умолчанию) — рядом с курсором: курсор в правой половине окна игры → окно
//   слева от курсора, иначе справа; со сдвигом, чтобы не закрывать подсказку предмета;
//   по вертикали верх окна — на уровне курсора;
// - 'left' / 'right' — у левого / правого края, по вертикали тоже у курсора;
// - 'saved' — там, куда игрок перетащил окно за шапку (Settings.overlay.priceWindowPos); ещё не
//   перетаскивали — как 'cursor'.
// Окно всегда целиком внутри `area` — пересечения окна игры и монитора под курсором
// (игра в окне может свисать за край экрана или стоять на двух мониторах).

import type { PricePopupPosition } from '@shared/types'

export interface Point {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

export interface Rect extends Point, Size {}

export interface PlacementInput {
  mode: PricePopupPosition
  /** курсор в момент Ctrl+D */
  anchor: Point
  /** размер виджета */
  size: Size
  /** окно оверлея (= клиентская область игры) */
  viewport: Size
  /** где можно показывать (окно игры ∩ монитор под курсором); по умолчанию — весь viewport */
  area?: Rect | null
  /** отступ от краёв области */
  margin?: number
  /** сдвиг от курсора по горизонтали (не закрыть подсказку предмета) */
  gap?: number
  /** сдвиг верха окна вверх от курсора */
  lift?: number
  /** левый верхний угол для 'saved' (куда окно перетащили) */
  saved?: Point | null
}

export const POPUP_MARGIN = 8
export const POPUP_CURSOR_GAP = 24
export const POPUP_CURSOR_LIFT = 12

/** Пересечение прямоугольников; null — не пересекаются. */
export function intersect(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  const right = Math.min(a.x + a.width, b.x + b.width)
  const bottom = Math.min(a.y + a.height, b.y + b.height)
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null
}

/**
 * Свести v в [min, max] и округлить до целого пикселя, не вылезая за границы (дробные DIP
 * при 125/150 %). Не помещается (max < min) — прижать к началу: виден верх/левый край.
 */
function fit(v: number, min: number, max: number): number {
  if (max < min) return Math.ceil(min)
  return Math.min(Math.floor(max), Math.max(Math.ceil(min), Math.round(v)))
}

/** Куда можно поставить окно размера size: та же область, что у placeWidget (окно игры ∩ монитор). */
export function clampToArea(p: Point, size: Size, viewport: Size, area?: Rect | null, margin = POPUP_MARGIN): Point {
  return placeWidget({ mode: 'saved', saved: p, anchor: p, size, viewport, area, margin })
}

export function placeWidget(input: PlacementInput): Point {
  const { anchor, size, viewport } = input
  const margin = input.margin ?? POPUP_MARGIN
  const gap = input.gap ?? POPUP_CURSOR_GAP
  const lift = input.lift ?? POPUP_CURSOR_LIFT
  const full: Rect = { x: 0, y: 0, width: viewport.width, height: viewport.height }
  const area = (input.area && intersect(input.area, full)) || full

  const minX = area.x + margin
  const maxX = area.x + area.width - margin - size.width
  const minY = area.y + margin
  const maxY = area.y + area.height - margin - size.height

  if (input.mode === 'saved' && input.saved) {
    return { x: fit(input.saved.x, minX, maxX), y: fit(input.saved.y, minY, maxY) }
  }

  let x: number
  if (input.mode === 'left') x = minX
  else if (input.mode === 'right') x = maxX
  else {
    // половина — по окну игры, а не по монитору: инвентарь у PoE справа в окне игры
    const cursorOnRight = anchor.x >= viewport.width / 2
    x = cursorOnRight ? anchor.x - gap - size.width : anchor.x + gap
  }
  const y = anchor.y - lift

  return { x: fit(x, minX, maxX), y: fit(y, minY, maxY) }
}
