// Геометрия сетки стэша PoE1 для подсветки ячейки (чистые функции, пиксели клиентской
// области окна игры, начало — левый-верхний угол клиентской области).
//
// Интерфейс PoE масштабируется по ВЫСОТЕ окна; панель стэша прижата к левому краю области
// интерфейса. Константы (в долях высоты окна H):
//  - ширина боковой панели 986/1600·H — Awakened PoE Trade (SnosMe, MIT),
//    renderer/src/web/overlay/OverlayWindow.vue: «sidebar is 986px at Wx1600H»;
//  - отступ сетки слева 17/1119·H, верх сетки 154/1119·H, сдвиг вкладки в папке 42/1119·H —
//    Poe-Lurker (C1rdec, © Wohs Inc., MIT), PoeLurker.UI/ViewModels/StashTabGridViewModel.cs;
//  - ширина области интерфейса не больше 3455/1440·H, лишнее — чёрные поля по бокам
//    (Poe-Lurker, PoeLurker.Core/Helpers/DockingHelper.cs, HandleWideScreen);
//  - размер сетки ВЫВЕДЕН: сетка по центру панели, сторона = ширина панели − 2 отступа
//    = 0.5859·H (≈632.7 px и ячейка ≈52.7 px при 1080p — как ячейка инвентаря; у Poe-Lurker
//    637/1119·H ≈ 614.8 px, на 3% меньше). Не проверено в игре — точный путь: калибровка.
// Сетка квадратная: обычная вкладка 12×12, квадратная (quad) 24×24 на той же площади.

import type { StashCalibration, StashGridMode, StashPos } from '../types/deals'

export type StashGridKind = 'normal' | 'quad'

export const GRID_CELLS: Record<StashGridKind, number> = { normal: 12, quad: 24 }

export const STASH_GEOMETRY = {
  /** ширина боковой панели / H (APT) */
  panelWidth: 986 / 1600,
  /** левый край сетки / H (Poe-Lurker) */
  gridLeft: 17 / 1119,
  /** верх сетки / H (Poe-Lurker) */
  gridTop: 154 / 1119,
  /** сдвиг вниз, если вкладка лежит в папке / H (Poe-Lurker) */
  folderShift: 42 / 1119,
  /** максимальное отношение ширины области интерфейса к высоте (Poe-Lurker) */
  maxUiAspect: 3455 / 1440
} as const

/** Сторона сетки / H: по центру панели (выведено, см. шапку файла). */
export const GRID_SIZE = STASH_GEOMETRY.panelWidth - 2 * STASH_GEOMETRY.gridLeft

export interface ClientSize {
  width: number
  height: number
}

export interface Point {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface CellRect extends Rect {
  kind: StashGridKind
}

function validSize(c: ClientSize): boolean {
  return Number.isFinite(c.width) && Number.isFinite(c.height) && c.width > 0 && c.height > 0
}

/** Левое чёрное поле на сверхшироких экранах (интерфейс не шире maxUiAspect·H). */
export function uiOffsetX(client: ClientSize): number {
  const uiWidth = client.height * STASH_GEOMETRY.maxUiAspect
  return client.width > uiWidth ? (client.width - uiWidth) / 2 : 0
}

/** Прямоугольник всей сетки по размеру окна (без калибровки). */
export function autoGridRect(client: ClientSize, opts: { inFolder?: boolean } = {}): Rect {
  const h = client.height
  const g = STASH_GEOMETRY
  const size = GRID_SIZE * h
  return {
    x: uiOffsetX(client) + g.gridLeft * h,
    y: (g.gridTop + (opts.inFolder ? g.folderShift : 0)) * h,
    width: size,
    height: size
  }
}

/**
 * Калибровка под текущий размер окна: если окно другого размера, прямоугольник масштабируется
 * по высоте от левого края области интерфейса.
 */
export function calibratedGridRect(cal: StashCalibration, client: ClientSize): Rect {
  const ref: ClientSize = {
    width: cal.refWidth ?? client.width,
    height: cal.refHeight ?? client.height
  }
  if (!validSize(ref) || (ref.width === client.width && ref.height === client.height)) {
    return { x: cal.left, y: cal.top, width: cal.width, height: cal.height }
  }
  const k = client.height / ref.height
  const ox = uiOffsetX(ref)
  return {
    x: uiOffsetX(client) + (cal.left - ox) * k,
    y: cal.top * k,
    width: cal.width * k,
    height: cal.height * k
  }
}

export function stashGridRect(
  client: ClientSize,
  opts: { calibration?: StashCalibration | null; inFolder?: boolean } = {}
): Rect {
  return opts.calibration ? calibratedGridRect(opts.calibration, client) : autoGridRect(client, opts)
}

/** Какая сетка: по настройке, иначе по позиции (> 12 → quad) или по памяти о вкладке. */
export function resolveGridKind(mode: StashGridMode, pos: StashPos, knownQuad = false): StashGridKind {
  if (mode === 'normal' || mode === 'quad') return mode
  return knownQuad || pos.left > GRID_CELLS.normal || pos.top > GRID_CELLS.normal ? 'quad' : 'normal'
}

export function isValidPos(pos: StashPos, kind: StashGridKind): boolean {
  const n = GRID_CELLS[kind]
  return (
    Number.isInteger(pos.left) &&
    Number.isInteger(pos.top) &&
    pos.left >= 1 &&
    pos.top >= 1 &&
    pos.left <= n &&
    pos.top <= n
  )
}

export interface CellOptions {
  mode?: StashGridMode
  /** вкладка уже встречалась как quad */
  knownQuad?: boolean
  calibration?: StashCalibration | null
  inFolder?: boolean
}

/**
 * Прямоугольник ячейки по позиции из сообщения (left — столбец, top — ряд, с 1).
 * null — позиция вне сетки или размер окна неизвестен.
 */
export function stashCellRect(client: ClientSize, pos: StashPos, opts: CellOptions = {}): CellRect | null {
  if (!validSize(client)) return null
  const kind = resolveGridKind(opts.mode ?? 'auto', pos, opts.knownQuad)
  if (!isValidPos(pos, kind)) return null
  const grid = stashGridRect(client, opts)
  const n = GRID_CELLS[kind]
  const cw = grid.width / n
  const ch = grid.height / n
  return { kind, x: grid.x + (pos.left - 1) * cw, y: grid.y + (pos.top - 1) * ch, width: cw, height: ch }
}

/** Минимальная сторона откалиброванной сетки в долях высоты окна (защита от случайного клика). */
export const MIN_CALIBRATION_SIZE = 0.2

/**
 * Ручная калибровка: пользователь кликает левый-верхний угол первой ячейки и правый-нижний
 * угол последней (порядок кликов не важен). null — прямоугольник слишком мал или вне окна.
 */
export function calibrationFromCorners(a: Point, b: Point, client: ClientSize): StashCalibration | null {
  if (!validSize(client)) return null
  const left = Math.min(a.x, b.x)
  const top = Math.min(a.y, b.y)
  const width = Math.abs(a.x - b.x)
  const height = Math.abs(a.y - b.y)
  const min = MIN_CALIBRATION_SIZE * client.height
  if (width < min || height < min) return null
  if (left < 0 || top < 0 || left + width > client.width || top + height > client.height) return null
  return {
    left: Math.round(left),
    top: Math.round(top),
    width: Math.round(width),
    height: Math.round(height),
    refWidth: Math.round(client.width),
    refHeight: Math.round(client.height)
  }
}
