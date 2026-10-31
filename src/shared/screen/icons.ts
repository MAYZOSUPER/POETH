// Эталоны иконок и сравнение ячейки с иконкой (S68, чистый модуль).
//
// Эталон — иконка предмета с web.poecdn.com (кэш S18), уменьшенная до эскиза THUMB×THUMB с альфой: эскизы
// хранятся в кэше main (userData) и в фикстурах тестов; сами картинки в репозитории не лежат. Сравнение — по
// маске альфы иконки: нормированная корреляция яркости (форма — работает и для пустой ячейки, где игра рисует
// серый силуэт предмета) и цветности (только у цветной картинки). Углы, где игра пишет число стопки (слева
// сверху) и метку уровня II/III (справа снизу), в маску не входят.

import type { Bitmap, Rect } from '../ocr/bitmap'
import { centered, luma, samplePatch, type Patch } from './image'

/** Сторона эскиза иконки, точки. */
export const THUMB = 24
/** Сторона дескриптора, точки (сравнение ячейки с иконкой). */
export const DESC = 16

export interface IconRef {
  /** ключ предмета: английское имя (как в фиде цен и раскладках) */
  name: string
  /** ключ рисунка: у предметов разных уровней с одним рисунком (PoE 2: Greater/Perfect) он одинаковый */
  art: string
  /** клеток по ширине и высоте */
  w: number
  h: number
}

export interface IconThumb extends IconRef {
  size: number
  /** RGBA, цвет без домножения на альфу */
  rgba: Uint8Array
}

/** Иконка (BGRA с альфой, любой размер) → эскиз THUMB×THUMB усреднением с весом альфы. */
export function makeThumb(icon: Bitmap, ref: IconRef, size = THUMB): IconThumb {
  const rgba = new Uint8Array(size * size * 4)
  const sx = icon.width / size
  const sy = icon.height / size
  const d = icon.data
  for (let py = 0; py < size; py++)
    for (let px = 0; px < size; px++) {
      const ya = py * sy
      const yb = ya + sy
      const xa = px * sx
      const xb = xa + sx
      let R = 0
      let G = 0
      let B = 0
      let A = 0
      let W = 0
      for (let y = Math.floor(ya); y < Math.ceil(yb); y++) {
        const wy = Math.min(yb, y + 1) - Math.max(ya, y)
        if (wy <= 0 || y >= icon.height) continue
        for (let x = Math.floor(xa); x < Math.ceil(xb); x++) {
          const wx = Math.min(xb, x + 1) - Math.max(xa, x)
          if (wx <= 0 || x >= icon.width) continue
          const w = wx * wy
          const p = (y * icon.width + x) * 4
          const a = (d[p + 3] / 255) * w
          B += d[p] * a
          G += d[p + 1] * a
          R += d[p + 2] * a
          A += a
          W += w
        }
      }
      const i = (py * size + px) * 4
      if (A > 0) {
        rgba[i] = Math.round(R / A)
        rgba[i + 1] = Math.round(G / A)
        rgba[i + 2] = Math.round(B / A)
      }
      rgba[i + 3] = W > 0 ? Math.round((A / W) * 255) : 0
    }
  return { ...ref, size, rgba }
}

/** Дескриптор иконки: веса маски и нормированные (по маске) яркость и цветность. */
export interface IconDesc extends IconRef {
  size: number
  /** маска 0…1 (альфа без углов с надписями игры) */
  m: Float32Array
  sumM: number
  /** m·(Y − Ȳ) / ‖…‖ — скалярное произведение с яркостью ячейки даёт числитель корреляции */
  ay: Float32Array
  /** то же для цветности (R − Y) и (B − Y); null — иконка почти серая */
  acr: Float32Array | null
  acb: Float32Array | null
  /** средняя яркость иконки под маской */
  meanY: number
  /** разброс яркости иконки под маской (для «есть / пусто»: силуэт пустой ячейки плоский) */
  sdY: number
}

/** Углы, где игра рисует свои надписи поверх иконки: число стопки и метка уровня. */
function textCorner(x: number, y: number): boolean {
  return (x < 0.5 && y < 0.32) || (x > 0.68 && y > 0.7)
}

function normalized(v: Float32Array, m: Float32Array, sumM: number): { a: Float32Array; mean: number; norm: number } {
  let mean = 0
  for (let i = 0; i < v.length; i++) mean += m[i] * v[i]
  mean /= sumM || 1
  const a = new Float32Array(v.length)
  let norm = 0
  for (let i = 0; i < v.length; i++) {
    a[i] = m[i] * (v[i] - mean)
    norm += m[i] * (v[i] - mean) * (v[i] - mean)
  }
  norm = Math.sqrt(norm)
  if (norm > 0) for (let i = 0; i < a.length; i++) a[i] /= norm
  return { a, mean, norm }
}

/** Эскиз → дескриптор DESC×DESC. */
export function describe(t: IconThumb, size = DESC): IconDesc {
  const n = size * size
  const m = new Float32Array(n)
  const Y = new Float32Array(n)
  const CR = new Float32Array(n)
  const CB = new Float32Array(n)
  const k = t.size / size
  for (let py = 0; py < size; py++)
    for (let px = 0; px < size; px++) {
      let R = 0
      let G = 0
      let B = 0
      let A = 0
      let W = 0
      for (let y = Math.floor(py * k); y < Math.ceil((py + 1) * k); y++) {
        const wy = Math.min((py + 1) * k, y + 1) - Math.max(py * k, y)
        if (wy <= 0) continue
        for (let x = Math.floor(px * k); x < Math.ceil((px + 1) * k); x++) {
          const wx = Math.min((px + 1) * k, x + 1) - Math.max(px * k, x)
          if (wx <= 0) continue
          const w = wx * wy
          const p = (y * t.size + x) * 4
          const a = (t.rgba[p + 3] / 255) * w
          R += t.rgba[p] * a
          G += t.rgba[p + 1] * a
          B += t.rgba[p + 2] * a
          A += a
          W += w
        }
      }
      const i = py * size + px
      const alpha = W > 0 ? A / W : 0
      const corner = textCorner((px + 0.5) / size, (py + 0.5) / size)
      m[i] = corner || alpha < 0.3 ? 0 : alpha
      if (A > 0) {
        Y[i] = luma(B / A, G / A, R / A)
        CR[i] = R / A - Y[i]
        CB[i] = B / A - Y[i]
      }
    }
  let sumM = 0
  for (let i = 0; i < n; i++) sumM += m[i]
  const y = normalized(Y, m, sumM)
  const cr = normalized(CR, m, sumM)
  const cb = normalized(CB, m, sumM)
  // почти серые иконки (свитки, осколки) по цвету не сравниваем: шум цветности решал бы за форму
  const colorful = Math.sqrt((cr.norm * cr.norm + cb.norm * cb.norm) / (sumM || 1)) > 12
  return {
    name: t.name,
    art: t.art,
    w: t.w,
    h: t.h,
    size,
    m,
    sumM,
    ay: y.a,
    acr: colorful ? cr.a : null,
    acb: colorful ? cb.a : null,
    meanY: y.mean,
    sdY: sumM > 0 ? y.norm / Math.sqrt(sumM) : 0
  }
}

/** Ячейка в виде дескриптора: яркость, цветность, квадраты яркости (для знаменателя корреляции). */
export interface CellPatch {
  size: number
  y: Float32Array
  y2: Float32Array
  cr: Float32Array
  cb: Float32Array
  /** у картинки есть цвет (серые фикстуры — нет) */
  color: boolean
}

export function toCellPatch(p: Patch): CellPatch {
  const n = p.size * p.size
  const y2 = new Float32Array(n)
  const cr = new Float32Array(n)
  const cb = new Float32Array(n)
  let chroma = 0
  for (let i = 0; i < n; i++) {
    y2[i] = p.y[i] * p.y[i]
    cr[i] = p.r[i] - p.y[i]
    cb[i] = p.b[i] - p.y[i]
    chroma += Math.abs(cr[i]) + Math.abs(cb[i])
  }
  return { size: p.size, y: p.y, y2, cr, cb, color: chroma / n > 3 }
}

/** Область иконки в ячейке: доля стороны frac по центру, сдвиг (dx, dy) в долях стороны. */
export function iconRect(cell: Rect, frac: number, dx = 0, dy = 0): Rect {
  return centered(cell, frac, dx * cell.width, dy * cell.height)
}

export function cellPatch(img: Bitmap, r: Rect, size = DESC): CellPatch {
  return toCellPatch(samplePatch(img, r, size))
}

export interface IconScore {
  /** корреляция яркости по маске, −1…1 */
  shape: number
  /** корреляция цветности, −1…1; null — сравнить нельзя (серая картинка или серая иконка) */
  color: number | null
  /** яркость ячейки под маской / яркость иконки */
  ratio: number
  /** разброс яркости ячейки под маской / разброс у иконки: у предмета ≈ 1, у серого силуэта пустой ячейки — втрое меньше */
  contrast: number
  /** итог для выбора: форма, с цветом — среднее с весом */
  total: number
}

function ncc(a: Float32Array, v: Float32Array, v2: Float32Array | null, m: Float32Array, sumM: number, sd?: { v: number }): number {
  let dot = 0
  let s1 = 0
  let s2 = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * v[i]
    const w = m[i]
    if (w) {
      s1 += w * v[i]
      s2 += w * (v2 ? v2[i] : v[i] * v[i])
    }
  }
  const varSum = s2 - (s1 * s1) / (sumM || 1)
  if (sd) sd.v = varSum > 0 && sumM > 0 ? Math.sqrt(varSum / sumM) : 0
  return varSum > 1e-3 ? dot / Math.sqrt(varSum) : 0
}

/** Сходство ячейки с иконкой. */
export function scoreIcon(d: IconDesc, c: CellPatch): IconScore {
  const sd = { v: 0 }
  const shape = ncc(d.ay, c.y, c.y2, d.m, d.sumM, sd)
  let color: number | null = null
  if (c.color && d.acr && d.acb) color = (ncc(d.acr, c.cr, null, d.m, d.sumM) + ncc(d.acb, c.cb, null, d.m, d.sumM)) / 2
  let mean = 0
  for (let i = 0; i < c.y.length; i++) mean += d.m[i] * c.y[i]
  mean /= d.sumM || 1
  const ratio = d.meanY > 1 ? mean / d.meanY : 0
  const total = color === null ? shape : shape * 0.65 + color * 0.35
  return { shape, color, ratio, contrast: d.sdY > 1 ? sd.v / d.sdY : 0, total }
}

export interface IconHit {
  icon: IconDesc
  score: IconScore
}

/** Лучшие n иконок для ячейки (по total). */
export function nearestIcons(c: CellPatch, icons: readonly IconDesc[], n = 3): IconHit[] {
  const hits: IconHit[] = []
  for (const icon of icons) {
    if (icon.size !== c.size) continue
    const score = scoreIcon(icon, c)
    if (hits.length < n || score.total > hits[hits.length - 1].score.total) {
      hits.push({ icon, score })
      hits.sort((a, b) => b.score.total - a.score.total)
      if (hits.length > n) hits.pop()
    }
  }
  return hits
}

/** Поиск по сдвигам и размерам иконки в ячейке: лучшая пара (рамка иконки, сходство). */
export function bestPlacement(
  img: Bitmap,
  cell: Rect,
  icon: IconDesc,
  fracs: readonly number[],
  shifts: readonly number[] = [0]
): { rect: Rect; score: IconScore } {
  let best: { rect: Rect; score: IconScore } | null = null
  for (const f of fracs)
    for (const dy of shifts)
      for (const dx of shifts) {
        const rect = iconRect(cell, f, dx, dy)
        const score = scoreIcon(icon, cellPatch(img, rect, icon.size))
        if (!best || score.total > best.score.total) best = { rect, score }
      }
  return best!
}
