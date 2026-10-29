// Сверка знаков внутри одной таблицы (S28, чистый модуль): цифры стакана набраны одним шрифтом в одном
// размере, поэтому одинаковые цифры на снимке почти совпадают по форме. Знаки уверенных ячеек — образцы:
// уверенная ячейка, чья цифра больше похожа на образцы другой цифры, становится сомнительной; сомнительная,
// все знаки которой уверенно узнаны по образцам, — подтверждается (если распознаватель за неё хоть раз голосовал).

import type { Box, TableLayout } from './segment'

/**
 * Сетка признака знака: ширина × высота — по рамке самого знака (у строк разная высота: цифры «старого стиля»
 * 3, 4, 5, 7, 9 ниже строки, 6 и 8 выше); положение и размер рамки сравниваются отдельно (sizeOk).
 */
const GW = 10
const GH = 18

/** Знак → вектор единичной длины (яркость текста минус среднее) для сравнения скалярным произведением. */
export function glyphVector(t: TableLayout, box: Box): Float32Array {
  const lo = t.peak * 0.33
  const hi = t.peak
  const x0 = box.x0 - 1
  const y0 = box.y0 - 1
  const w = box.x1 - box.x0 + 2
  const h = box.y1 - box.y0 + 2
  const v = new Float32Array(GW * GH)
  const n = new Float32Array(GW * GH)
  for (let y = 0; y < h; y++) {
    const sy = y0 + y
    if (sy < 0 || sy >= t.height) continue
    const gy = Math.min(GH - 1, Math.floor((y / h) * GH))
    for (let x = 0; x < w; x++) {
      const sx = x0 + x
      if (sx < 0 || sx >= t.width) continue
      const gx = Math.min(GW - 1, Math.floor((x / w) * GW))
      const ink = (t.ink[sy * t.width + sx] - lo) / (hi - lo)
      v[gy * GW + gx] += ink <= 0 ? 0 : ink >= 1 ? 1 : ink
      n[gy * GW + gx]++
    }
  }
  let mean = 0
  for (let i = 0; i < v.length; i++) {
    v[i] = n[i] ? v[i] / n[i] : 0
    mean += v[i]
  }
  mean /= v.length
  let norm = 0
  for (let i = 0; i < v.length; i++) {
    v[i] -= mean
    norm += v[i] * v[i]
  }
  norm = Math.sqrt(norm) || 1
  for (let i = 0; i < v.length; i++) v[i] /= norm
  return v
}

export function similarity(a: Float32Array, b: Float32Array): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

export interface Sample {
  vec: Float32Array
  /** цифра '0'…'9' */
  label: string
  /** из какой ячейки (свою ячейку при проверке не сравниваем с ней же) */
  cell: number
}

export interface Match {
  label: string
  /** сходство с лучшим образцом этой цифры */
  best: number
  /** сходство с лучшим образцом любой другой цифры (−1 — других нет) */
  other: number
  /** у своей цифры есть образцы в других ячейках */
  known: boolean
}

/** Ближайшая цифра среди образцов других ячеек. null — образцов нет. */
export function nearest(vec: Float32Array, samples: readonly Sample[], skipCell: number): Match | null {
  const best = new Map<string, number>()
  for (const s of samples) {
    if (s.cell === skipCell) continue
    const k = similarity(vec, s.vec)
    if (k > (best.get(s.label) ?? -2)) best.set(s.label, k)
  }
  if (!best.size) return null
  const ranked = [...best.entries()].sort((a, b) => b[1] - a[1])
  return { label: ranked[0][0], best: ranked[0][1], other: ranked[1]?.[1] ?? -1, known: true }
}

/** Насколько вектор похож на образцы цифры `label` и на лучшую из остальных. */
export function compareTo(vec: Float32Array, label: string, samples: readonly Sample[], skipCell: number): Match {
  let own = -2
  let other = -2
  for (const s of samples) {
    if (s.cell === skipCell) continue
    const k = similarity(vec, s.vec)
    if (s.label === label) own = Math.max(own, k)
    else other = Math.max(other, k)
  }
  return { label, best: own, other, known: own > -2 }
}
