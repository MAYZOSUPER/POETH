// Картинка для распознавания окон игры (S68, чистый модуль): серое в float, уменьшение усреднением,
// выборка области в квадрат D×D (цвет и яркость). Вход — Bitmap S28 (BGRA, как снимок окна игры).

import type { Bitmap, Rect } from '../ocr/bitmap'

/** Серая картинка в float (0…255), строки подряд. */
export interface GrayF {
  width: number
  height: number
  data: Float32Array
}

/** Яркость точки BGRA (BT.601). */
export function luma(b: number, g: number, r: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

/** Серое всего снимка или его части (r — обрезается по картинке). */
export function toGray(img: Bitmap, r?: Rect): GrayF {
  const x0 = r ? Math.max(0, Math.floor(r.x)) : 0
  const y0 = r ? Math.max(0, Math.floor(r.y)) : 0
  const x1 = r ? Math.min(img.width, Math.ceil(r.x + r.width)) : img.width
  const y1 = r ? Math.min(img.height, Math.ceil(r.y + r.height)) : img.height
  const width = Math.max(0, x1 - x0)
  const height = Math.max(0, y1 - y0)
  const data = new Float32Array(width * height)
  const d = img.data
  for (let y = 0; y < height; y++) {
    let p = ((y0 + y) * img.width + x0) * 4
    const row = y * width
    for (let x = 0; x < width; x++, p += 4) data[row + x] = luma(d[p], d[p + 1], d[p + 2])
  }
  return { width, height, data }
}

/**
 * Уменьшить в k раз (k ≤ 1) усреднением площади: каждая точка результата — среднее того, что она покрывает
 * (дробные края — с весом). Рамки ячеек в 1–2 точки не пропадают, как при выборке через точку.
 */
export function shrinkGray(g: GrayF, k: number): GrayF {
  if (k >= 0.999) return { width: g.width, height: g.height, data: g.data.slice() }
  const width = Math.max(1, Math.floor(g.width * k))
  const height = Math.max(1, Math.floor(g.height * k))
  const inv = 1 / k
  // сначала по строкам, потом по столбцам — два прохода вместо площади на точку
  const tmp = new Float32Array(width * g.height)
  for (let y = 0; y < g.height; y++) {
    const row = y * g.width
    for (let x = 0; x < width; x++) {
      const a = x * inv
      const b = a + inv
      tmp[y * width + x] = spanMean(g.data, row, a, b, g.width, 1)
    }
  }
  const data = new Float32Array(width * height)
  for (let x = 0; x < width; x++)
    for (let y = 0; y < height; y++) {
      const a = y * inv
      const b = a + inv
      data[y * width + x] = spanMean(tmp, x, a, b, g.height, width)
    }
  return { width, height, data }
}

/** Среднее отрезка [a, b) вдоль оси (шаг stride от base), дробные края — с весом. */
function spanMean(src: Float32Array, base: number, a: number, b: number, n: number, stride: number): number {
  let s = 0
  let w = 0
  const i0 = Math.floor(a)
  const i1 = Math.min(n, Math.ceil(b))
  for (let i = i0; i < i1; i++) {
    const lo = Math.max(a, i)
    const hi = Math.min(b, i + 1)
    const k = hi - lo
    if (k <= 0) continue
    s += src[base + i * stride] * k
    w += k
  }
  return w > 0 ? s / w : 0
}

/** Квадрат D×D из области снимка: R, G, B и яркость (float 0…255), выборка усреднением площади. */
export interface Patch {
  size: number
  r: Float32Array
  g: Float32Array
  b: Float32Array
  y: Float32Array
}

/**
 * Область r снимка → квадрат D×D (каждая точка — среднее своего прямоугольника r/D). Используется для ячеек
 * (10–150 точек) — без промежуточных копий.
 */
export function samplePatch(img: Bitmap, r: Rect, size: number): Patch {
  const n = size * size
  const out: Patch = { size, r: new Float32Array(n), g: new Float32Array(n), b: new Float32Array(n), y: new Float32Array(n) }
  const sx = r.width / size
  const sy = r.height / size
  const d = img.data
  for (let py = 0; py < size; py++) {
    const ya = r.y + py * sy
    const yb = ya + sy
    for (let px = 0; px < size; px++) {
      const xa = r.x + px * sx
      const xb = xa + sx
      let R = 0
      let G = 0
      let B = 0
      let W = 0
      for (let y = Math.floor(ya); y < Math.ceil(yb); y++) {
        if (y < 0 || y >= img.height) continue
        const wy = Math.min(yb, y + 1) - Math.max(ya, y)
        if (wy <= 0) continue
        for (let x = Math.floor(xa); x < Math.ceil(xb); x++) {
          if (x < 0 || x >= img.width) continue
          const wx = Math.min(xb, x + 1) - Math.max(xa, x)
          if (wx <= 0) continue
          const w = wx * wy
          const p = (y * img.width + x) * 4
          B += d[p] * w
          G += d[p + 1] * w
          R += d[p + 2] * w
          W += w
        }
      }
      const i = py * size + px
      if (W > 0) {
        out.r[i] = R / W
        out.g[i] = G / W
        out.b[i] = B / W
        out.y[i] = luma(out.b[i], out.g[i], out.r[i])
      }
    }
  }
  return out
}

/** Прямоугольник с отступом внутрь на долю стороны (рамку ячейки не берём). */
export function inset(r: Rect, frac: number): Rect {
  const dx = r.width * frac
  const dy = r.height * frac
  return { x: r.x + dx, y: r.y + dy, width: r.width - 2 * dx, height: r.height - 2 * dy }
}

/** Квадрат доли frac от прямоугольника, по центру. */
export function centered(r: Rect, frac: number, dx = 0, dy = 0): Rect {
  const w = r.width * frac
  const h = r.height * frac
  return { x: r.x + (r.width - w) / 2 + dx, y: r.y + (r.height - h) / 2 + dy, width: w, height: h }
}
