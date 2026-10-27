// Где показать виджет оверлея. Чистый модуль — tests/overlay/placement.test.ts.
//
// - 'cursor'   — рядом с курсором (справа-снизу, у края экрана — с другой стороны);
// - 'opposite' — с противоположной стороны экрана, вплотную к панели игры: предмет в
//   инвентаре (правая половина) → окно слева от инвентаря; предмет в стэше (левая
//   половина) → справа от стэша. Так окно не закрывает ни предмет, ни панели.
//   Ширина панели PoE зависит только от высоты окна: 370 px при 800×600 (как в APT).

export interface Point {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

export type PlacementMode = 'cursor' | 'opposite'

export interface PlacementInput {
  mode: PlacementMode
  /** точка привязки (курсор в момент Ctrl+D), координаты окна оверлея */
  anchor: Point
  /** размер виджета */
  size: Size
  /** размер окна оверлея (= клиентская область игры) */
  viewport: Size
  /** отступ от краёв окна */
  margin?: number
  /** зазор между курсором/панелью и виджетом */
  gap?: number
}

const DEFAULT_MARGIN = 8
const DEFAULT_GAP = 12

/** Ширина боковой панели игры (стэш/инвентарь) для окна этой высоты. */
export function poePanelWidth(viewport: Size): number {
  const ratio = 370 / 600
  return Math.min(Math.round(viewport.height * ratio), Math.floor(viewport.width / 2))
}

function clamp(v: number, min: number, max: number): number {
  // виджет больше окна — прижать к началу (левый/верхний край виден)
  if (max < min) return min
  return Math.min(max, Math.max(min, v))
}

export function placeWidget(input: PlacementInput): Point {
  const { anchor, size, viewport } = input
  const margin = input.margin ?? DEFAULT_MARGIN
  const gap = input.gap ?? DEFAULT_GAP
  const maxX = viewport.width - size.width - margin
  const maxY = viewport.height - size.height - margin

  if (input.mode === 'cursor') {
    let x = anchor.x + gap
    if (x + size.width > viewport.width - margin) x = anchor.x - gap - size.width
    let y = anchor.y + gap
    if (y + size.height > viewport.height - margin) y = anchor.y - gap - size.height
    return { x: clamp(x, margin, maxX), y: clamp(y, margin, maxY) }
  }

  const panel = poePanelWidth(viewport)
  const itemOnRight = anchor.x >= viewport.width / 2
  const x = itemOnRight ? viewport.width - panel - gap - size.width : panel + gap
  const y = anchor.y - size.height / 2
  return { x: clamp(x, margin, maxX), y: clamp(y, margin, maxY) }
}
