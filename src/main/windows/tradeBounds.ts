import type { Rectangle } from 'electron'

// Границы трейд-окна «поверх игры» (S5, как встроенный браузер PoE Overlay, но в границах
// клиентской области игры). Чистые функции — тесты в tests/fav/tradeBounds.test.ts.

/** наименьший размер трейд-окна (сайт трейда уже не помещается), если игра не меньше */
export const TRADE_MIN_SIZE = { width: 900, height: 560 }
/** доля клиентской области игры по умолчанию */
export const GAME_SIZE_DEFAULT = { w: 0.86, h: 0.9 }
/** пределы доли при ресайзе */
export const GAME_SIZE_MIN = 0.4

export interface GameSize {
  w: number
  h: number
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

/** Доля (с проверкой мусора из файла) → в пределах GAME_SIZE_MIN…1. */
export function normalizeGameSize(size: unknown): GameSize {
  const s = (size && typeof size === 'object' ? size : {}) as Partial<Record<'w' | 'h', unknown>>
  const one = (v: unknown, def: number): number => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, GAME_SIZE_MIN, 1) : def)
  return { w: one(s.w, GAME_SIZE_DEFAULT.w), h: one(s.h, GAME_SIZE_DEFAULT.h) }
}

/** Доля окна игры → границы трейд-окна по центру клиентской области игры (не больше игры). */
export function boundsOverGame(area: Rectangle, size?: unknown): Rectangle {
  const f = normalizeGameSize(size)
  const width = clamp(Math.round(area.width * f.w), Math.min(TRADE_MIN_SIZE.width, area.width), area.width)
  const height = clamp(Math.round(area.height * f.h), Math.min(TRADE_MIN_SIZE.height, area.height), area.height)
  return {
    x: area.x + Math.round((area.width - width) / 2),
    y: area.y + Math.round((area.height - height) / 2),
    width,
    height
  }
}

/** Новый размер окна → доля окна игры (её и запоминаем; позиция — всегда по центру). */
export function gameSizeOf(bounds: Pick<Rectangle, 'width' | 'height'>, area: Pick<Rectangle, 'width' | 'height'>): GameSize {
  return normalizeGameSize({ w: bounds.width / area.width, h: bounds.height / area.height })
}
