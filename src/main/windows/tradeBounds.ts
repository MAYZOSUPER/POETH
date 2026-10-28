import type { Rectangle } from 'electron'

// Границы трейд-окна «поверх игры» (S5). Размер и положение — как у встроенного браузера
// PoE Overlay Community Fork (MIT, (c) 2020 Nicklas Ronge; v0.9.0,
// src/app/core/service/browser.service.ts → open(): center: true, ширина
// round(min(h·1.3, w·0.7)), высота round(h·0.7), где w×h — окно оверлея). У них оверлей —
// весь экран, у нас — клиентская область игры (в окне без рамки это тот же экран).
// Своё: если игрок растянул окно, запоминаем долю окна игры. Тесты — tests/fav/tradeBounds.test.ts.

/** наименьший размер трейд-окна (сайт трейда уже не помещается), если игра не меньше */
export const TRADE_MIN_SIZE = { width: 900, height: 560 }
/** пределы доли окна игры при ресайзе */
export const GAME_SIZE_MIN = 0.4

/** размер, который игрок задал сам: доля клиентской области игры */
export interface GameSize {
  w: number
  h: number
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

/** Размер браузера PoE Overlay для окна w×h (browser.service.ts, open()). */
export function poeOverlaySize(area: Pick<Rectangle, 'width' | 'height'>): { width: number; height: number } {
  return {
    width: Math.round(Math.min(area.height * 1.3, area.width * 0.7)),
    height: Math.round(area.height * 0.7)
  }
}

/** Доля из файла → в пределах GAME_SIZE_MIN…1; нет или мусор — null (размер как у PoE Overlay). */
export function normalizeGameSize(size: unknown): GameSize | null {
  if (!size || typeof size !== 'object') return null
  const { w, h } = size as Partial<Record<'w' | 'h', unknown>>
  if (typeof w !== 'number' || typeof h !== 'number' || !Number.isFinite(w) || !Number.isFinite(h)) return null
  return { w: clamp(w, GAME_SIZE_MIN, 1), h: clamp(h, GAME_SIZE_MIN, 1) }
}

/** Границы трейд-окна по центру клиентской области игры (не больше игры, не меньше минимума). */
export function boundsOverGame(area: Rectangle, size?: unknown): Rectangle {
  const own = normalizeGameSize(size)
  const want = own
    ? { width: Math.round(area.width * own.w), height: Math.round(area.height * own.h) }
    : poeOverlaySize(area)
  const width = clamp(want.width, Math.min(TRADE_MIN_SIZE.width, area.width), area.width)
  const height = clamp(want.height, Math.min(TRADE_MIN_SIZE.height, area.height), area.height)
  return {
    x: area.x + Math.round((area.width - width) / 2),
    y: area.y + Math.round((area.height - height) / 2),
    width,
    height
  }
}

/** Игрок растянул окно → доля окна игры (её и запоминаем; позиция — всегда по центру). */
export function gameSizeOf(bounds: Pick<Rectangle, 'width' | 'height'>, area: Pick<Rectangle, 'width' | 'height'>): GameSize {
  return { w: clamp(bounds.width / area.width, GAME_SIZE_MIN, 1), h: clamp(bounds.height / area.height, GAME_SIZE_MIN, 1) }
}
