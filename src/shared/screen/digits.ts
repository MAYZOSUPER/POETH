// Цифры числа стопки по образцам (S68, чистый модуль). Игра пишет числа одним шрифтом (цифры «старого стиля»,
// tesseract их путает: 5 → 2, 2 → 7), поэтому каждый знак сравнивается с образцами этого шрифта — данными
// resources/data/<игра>/screen/digits.json (собирает tools/screen/harvest-digits.ts из размеченных снимков).
// Знак → сетка GW×GH долей точек маски по рамке знака + отношение сторон; сходство — корреляция векторов.

import type { StackGlyphs } from './stack'

const GW = 8
const GH = 12

export interface DigitSet {
  version: 1
  /** сетка вектора */
  w: number
  h: number
  /** цифра → образцы (векторы w·h, единичной длины после вычитания среднего) и отношения сторон */
  digits: Record<string, Array<{ v: number[]; aspect: number }>>
  source?: string
}

/** Разбор файла образцов; null — не тот формат. */
export function parseDigitSet(json: unknown): DigitSet | null {
  const j = json as Partial<DigitSet> | null
  if (!j || j.version !== 1 || j.w !== GW || j.h !== GH || !j.digits || typeof j.digits !== 'object') return null
  const digits: DigitSet['digits'] = {}
  for (const [d, list] of Object.entries(j.digits)) {
    if (!/^[0-9]$/.test(d) || !Array.isArray(list)) continue
    const ok = list.filter((s) => Array.isArray(s?.v) && s.v.length === GW * GH && typeof s.aspect === 'number')
    if (ok.length) digits[d] = ok
  }
  return Object.keys(digits).length ? { version: 1, w: GW, h: GH, digits, source: j.source } : null
}

/** Вектор знака i строки: доли маски в клетках сетки по рамке знака. */
export function glyphVector(s: StackGlyphs, i: number): { v: Float32Array; aspect: number } {
  const g = s.glyphs[i]
  const w = g.x1 - g.x0 + 1
  const h = g.y1 - g.y0 + 1
  const v = new Float32Array(GW * GH)
  const n = new Float32Array(GW * GH)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const gx = Math.min(GW - 1, Math.floor(((x + 0.5) / w) * GW))
      const gy = Math.min(GH - 1, Math.floor(((y + 0.5) / h) * GH))
      v[gy * GW + gx] += s.mask[(g.y0 + y) * s.w + g.x0 + x]
      n[gy * GW + gx]++
    }
  let mean = 0
  for (let k = 0; k < v.length; k++) {
    v[k] = n[k] ? v[k] / n[k] : 0
    mean += v[k]
  }
  mean /= v.length
  let norm = 0
  for (let k = 0; k < v.length; k++) {
    v[k] -= mean
    norm += v[k] * v[k]
  }
  norm = Math.sqrt(norm) || 1
  for (let k = 0; k < v.length; k++) v[k] /= norm
  return { v, aspect: w / h }
}

export interface DigitGuess {
  digit: string
  /** сходство с лучшим образцом */
  best: number
  /** сходство с лучшим образцом другой цифры */
  other: number
}

/** Ближайшая цифра по образцам; отношение сторон штрафует (у «1» узкий знак, у «0» — широкий). */
export function classifyGlyph(s: StackGlyphs, i: number, set: DigitSet): DigitGuess | null {
  const { v, aspect } = glyphVector(s, i)
  const best = new Map<string, number>()
  for (const [d, list] of Object.entries(set.digits))
    for (const t of list) {
      let dot = 0
      for (let k = 0; k < v.length; k++) dot += v[k] * t.v[k]
      const score = dot - Math.abs(Math.log(aspect / t.aspect)) * 0.5
      if (score > (best.get(d) ?? -9)) best.set(d, score)
    }
  const ranked = [...best.entries()].sort((a, b) => b[1] - a[1])
  if (!ranked.length) return null
  return { digit: ranked[0][0], best: ranked[0][1], other: ranked[1]?.[1] ?? -1 }
}

/** Знак узнан надёжно: высокое сходство и отрыв от второй цифры. */
export function digitSure(g: DigitGuess): boolean {
  return g.best >= 0.7 && g.best - g.other >= 0.08
}

/**
 * Образцы из размеченных чисел: берутся только строки, где знаков ровно столько, сколько цифр в метке (иначе
 * разметка знаков ошиблась). До perDigit образцов на цифру — по порядку прихода (разные ячейки и масштабы).
 */
export function harvestDigits(entries: ReadonlyArray<{ s: StackGlyphs; label: string }>, perDigit = 24, source?: string): DigitSet {
  const digits: DigitSet['digits'] = {}
  for (const { s, label } of entries) {
    if (s.glyphs.length !== label.length) continue
    for (let i = 0; i < label.length; i++) {
      const list = (digits[label[i]] ??= [])
      if (list.length >= perDigit) continue
      const { v, aspect } = glyphVector(s, i)
      list.push({ v: [...v].map((x) => Math.round(x * 1000) / 1000), aspect: Math.round(aspect * 1000) / 1000 })
    }
  }
  return { version: 1, w: GW, h: GH, digits, ...(source ? { source } : {}) }
}
