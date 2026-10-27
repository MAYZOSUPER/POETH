import type { InteractiveRect, OverlayPoint } from '@shared/types'

// Геометрия кликабельных виджетов оверлея. Чистый модуль — tests/overlay/hitTest.test.ts.

/** Не больше стольких прямоугольников от renderer (защита от мусора по IPC). */
export const MAX_INTERACTIVE_RECTS = 64

export function pointInRect(p: OverlayPoint, r: InteractiveRect): boolean {
  return p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height
}

export function pointInRects(p: OverlayPoint, rects: readonly InteractiveRect[]): boolean {
  return rects.some((r) => pointInRect(p, r))
}

function finite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/** Проверить данные из renderer: только конечные числа и положительный размер. */
export function sanitizeRects(raw: unknown): InteractiveRect[] {
  if (!Array.isArray(raw)) return []
  const out: InteractiveRect[] = []
  for (const r of raw.slice(0, MAX_INTERACTIVE_RECTS)) {
    if (typeof r !== 'object' || r === null) continue
    const { x, y, width, height } = r as Record<string, unknown>
    if (!finite(x) || !finite(y) || !finite(width) || !finite(height)) continue
    if (width <= 0 || height <= 0) continue
    out.push({ x, y, width, height })
  }
  return out
}

export function distance(a: OverlayPoint, b: OverlayPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** Ближайшая к p точка прямоугольника (сама p, если она внутри). */
export function closestPointInRect(p: OverlayPoint, r: InteractiveRect): OverlayPoint {
  return {
    x: Math.min(Math.max(p.x, r.x), r.x + r.width),
    y: Math.min(Math.max(p.y, r.y), r.y + r.height)
  }
}

/** Расстояние от p до отрезка [a, b]. */
export function distanceToSegment(p: OverlayPoint, a: OverlayPoint, b: OverlayPoint): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return distance(p, a)
  const t = Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy })
}

/**
 * Прятать ли «исключительный» виджет (окно после Ctrl+D), пока оверлей не активирован.
 * Да — если курсор ушёл от точки нажатия дальше threshold и при этом не идёт к виджету:
 * дальше threshold от «коридора» [точка нажатия → ближайшая точка виджета]. Над виджетом —
 * никогда. Так игрок может спокойно довести мышь от предмета до окна цены (в APT для
 * этого нужно держать Ctrl), а уход мышью в сторону закрывает окно.
 */
export function shouldAutoHide(
  cursor: OverlayPoint,
  from: OverlayPoint,
  rects: readonly InteractiveRect[],
  threshold: number
): boolean {
  if (pointInRects(cursor, rects)) return false
  if (distance(cursor, from) <= threshold) return false
  return rects.every((r) => distanceToSegment(cursor, from, closestPointInRect(from, r)) > threshold)
}
