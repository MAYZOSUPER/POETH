// Ячейки стакана → картинки для распознавателя и счёт знаков по разметке (S28, чистый модуль).
// Распознаватель (tesseract) читает каждое число отдельно: тёмные цифры на белом, высота цифр ~40 точек,
// белая рамка. Чтобы не доверять одному прочтению, одна и та же ячейка готовится несколькими способами
// (VARIANTS) — итог принимается, только если варианты сходятся (read.ts).

import type { Box, CellRect, TableLayout } from './segment'
import { boxH, boxW } from './segment'

/** Серая картинка, 1 байт на точку (0 — чёрный). */
export interface Gray {
  width: number
  height: number
  data: Uint8Array
}

export type VariantMode = 'stretch' | 'norm' | 'binary'

export interface Variant {
  mode: VariantMode
  /** высота цифр после масштабирования, точки */
  target: number
}

/** Первые два — основной проход; остальные — когда первые разошлись или не сходятся с разметкой. */
export const VARIANTS: readonly Variant[] = [
  { mode: 'stretch', target: 40 },
  { mode: 'stretch', target: 56 },
  { mode: 'stretch', target: 48 },
  { mode: 'norm', target: 40 },
  { mode: 'binary', target: 40 }
]

/** Курс целиком «A : B» (с двоеточием) — когда части по отдельности не сошлись. */
export const COMBO_VARIANTS: readonly Variant[] = [
  { mode: 'stretch', target: 40 },
  { mode: 'stretch', target: 56 },
  { mode: 'norm', target: 40 }
]

/** Белая рамка вокруг числа: tesseract плохо читает текст у самого края. */
const BORDER = 12

function resizeGray(g: Gray, k: number): Gray {
  const width = Math.max(1, Math.round(g.width * k))
  const height = Math.max(1, Math.round(g.height * k))
  const data = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    const sy = Math.min(g.height - 1, Math.max(0, (y + 0.5) / k - 0.5))
    const y0 = Math.floor(sy)
    const y1 = Math.min(g.height - 1, y0 + 1)
    const fy = sy - y0
    for (let x = 0; x < width; x++) {
      const sx = Math.min(g.width - 1, Math.max(0, (x + 0.5) / k - 0.5))
      const x0 = Math.floor(sx)
      const x1 = Math.min(g.width - 1, x0 + 1)
      const fx = sx - x0
      const top = g.data[y0 * g.width + x0] * (1 - fx) + g.data[y0 * g.width + x1] * fx
      const bot = g.data[y1 * g.width + x0] * (1 - fx) + g.data[y1 * g.width + x1] * fx
      data[y * width + x] = Math.round(top * (1 - fy) + bot * fy)
    }
  }
  return { width, height, data }
}

const clamp = (v: number): number => (v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v))

/** Ячейка → картинка для распознавателя: способ `v.mode`, цифры высотой `v.target`, белая рамка. */
export function cellImage(t: TableLayout, c: CellRect, v: Variant): Gray {
  const pad = Math.max(1, Math.round(t.glyphH * 0.1))
  const x0 = c.x0 - pad
  const y0 = c.y0 - pad
  const w = c.x1 - c.x0 + 2 * pad
  const h = c.y1 - c.y0 + 2 * pad
  const lo = t.peak * 0.33
  const hi = t.peak * 1.05
  const g: Gray = { width: w, height: h, data: new Uint8Array(w * h).fill(255) }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const sx = x0 + x
      const sy = y0 + y
      if (sx < 0 || sy < 0 || sx >= t.width || sy >= t.height) continue
      const i = sy * t.width + sx
      const ink = t.ink[i]
      const bg = t.mean[i]
      g.data[y * w + x] =
        v.mode === 'stretch'
          ? clamp(255 * (1 - (ink - lo) / (hi - lo)))
          : v.mode === 'norm'
            ? clamp(255 * (1 - ((ink - bg - t.peak * 0.06) / Math.max(20, t.peak - bg)) * 1.3))
            : ink - bg > t.peak * 0.14 && ink > t.peak * 0.4
              ? 0
              : 255
    }
  const big = resizeGray(g, v.target / t.glyphH)
  const out: Gray = { width: big.width + BORDER * 2, height: big.height + BORDER * 2, data: new Uint8Array(0) }
  out.data = new Uint8Array(out.width * out.height).fill(255)
  for (let y = 0; y < big.height; y++)
    out.data.set(big.data.subarray(y * big.width, (y + 1) * big.width), (y + BORDER) * out.width + BORDER)
  return out
}

export interface GlyphCount {
  /** знаков-цифр по разметке */
  digits: number
  /** мелких точек у нижнего края (десятичная точка / запятая) */
  dots: number
  /**
   * Счёт надёжен: ни одна «цифра» не шире обычной (на малом разрешении соседние цифры слипаются —
   * тогда сверять число знаков нельзя).
   */
  sure: boolean
}

export type GlyphKind = 'digit' | 'dot' | 'junk'

export interface Glyph {
  box: Box
  kind: GlyphKind
}

/**
 * Знаки ячейки по разметке: куски одной цифры перекрываются по горизонтали (тонкие места рвутся на малом
 * разрешении), соседние цифры — нет. Низкий кусок у нижнего края между цифрами — точка; низкий кусок над
 * или под цифрой — обломок этой же цифры.
 */
export function glyphsOf(parts: readonly Box[], gh: number, y0: number, y1: number): Glyph[] {
  const sorted = [...parts].sort((a, b) => a.x0 - b.x0)
  const clusters: Box[] = []
  const inside = (b: Box, c: Box): boolean => (b.x0 + b.x1) / 2 >= c.x0 && (b.x0 + b.x1) / 2 <= c.x1
  for (const b of sorted) {
    const last = clusters[clusters.length - 1]
    const small = boxH(b) < gh * 0.4
    const merge = last && (small ? inside(b, last) || inside(last, b) : b.x0 < last.x1)
    if (last && merge) {
      last.x0 = Math.min(last.x0, b.x0)
      last.x1 = Math.max(last.x1, b.x1)
      last.y0 = Math.min(last.y0, b.y0)
      last.y1 = Math.max(last.y1, b.y1)
      last.area += b.area
    } else clusters.push({ ...b })
  }
  const band = y1 - y0
  return clusters.map((c) => ({
    box: c,
    kind:
      boxH(c) >= gh * 0.5
        ? 'digit'
        : (c.y0 + c.y1) / 2 >= y0 + band * 0.55 && boxW(c) <= gh * 0.45
          ? 'dot'
          : 'junk'
  }))
}

/** Сколько знаков в ячейке по разметке (glyphsOf). */
export function countGlyphs(parts: readonly Box[], gh: number, y0: number, y1: number): GlyphCount {
  const glyphs = glyphsOf(parts, gh, y0, y1)
  return {
    digits: glyphs.filter((g) => g.kind === 'digit').length,
    dots: glyphs.filter((g) => g.kind === 'dot').length,
    sure: glyphs.every((g) => g.kind !== 'junk' && (g.kind !== 'digit' || boxW(g.box) <= gh * 1.05))
  }
}
