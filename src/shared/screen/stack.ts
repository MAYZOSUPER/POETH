// Число в стопке ячейки (S68, чистый модуль): игра пишет его белыми цифрами с тёмной обводкой в левом верхнем
// углу ячейки — поверх рисунка предмета. Выделяем светлые точки, у которых рядом тёмная обводка (белые блики
// рисунка её не имеют), собираем знаки в строку от левого края и отдаём распознавателю S28 (tesseract, только
// цифры) в двух вариантах подготовки. Число «уверенное», когда варианты совпали и число знаков равно числу
// найденных знаков-цифр. Одно нажатие — один снимок: всё в памяти.

import type { Bitmap, Rect } from '../ocr/bitmap'
import type { Gray } from '../ocr/cells'
import type { OcrFn } from '../ocr/read'
import { classifyGlyph, digitSure, type DigitSet } from './digits'
import { luma } from './image'

/** Где игра пишет число: доли ячейки от её левого верхнего угла. */
const ZONE = { x0: 0.02, x1: 0.8, y0: 0.0, y1: 0.42 }
/** Высота цифр, доли стороны ячейки. */
const DIGIT_H: readonly [number, number] = [0.13, 0.34]
/** Высота цифр для распознавателя, точки (как у S28). */
const OCR_DIGIT = 40
const BORDER = 12
/** Больше этого в стопке не бывает (страховка от склеенного мусора). */
export const MAX_STACK = 99_999

const NEIGHBORS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1]
]

interface Comp {
  x0: number
  y0: number
  x1: number
  y1: number
  n: number
}

export interface StackGlyphs {
  /** зона числа на снимке */
  zone: Rect
  /** знаки-цифры слева направо (координаты зоны) */
  glyphs: Comp[]
  /** маска текста зоны: 1 — цифра */
  mask: Uint8Array
  /** яркость зоны */
  y: Float32Array
  /** рядом со строкой остались куски, похожие на цифры, но не вошедшие в неё: знак мог потеряться */
  loose: boolean
  w: number
  h: number
}

/** Выделить знаки числа в ячейке; null — числа нет. */
export function stackGlyphs(img: Bitmap, cell: Rect): StackGlyphs | null {
  const zx = Math.max(0, Math.floor(cell.x + cell.width * ZONE.x0))
  const zy = Math.max(0, Math.floor(cell.y + cell.height * ZONE.y0))
  const zw = Math.min(img.width - zx, Math.ceil(cell.width * (ZONE.x1 - ZONE.x0)))
  const zh = Math.min(img.height - zy, Math.ceil(cell.height * (ZONE.y1 - ZONE.y0)))
  if (zw < 6 || zh < 6) return null
  const y = new Float32Array(zw * zh)
  const sat = new Float32Array(zw * zh)
  for (let j = 0; j < zh; j++)
    for (let i = 0; i < zw; i++) {
      const p = ((zy + j) * img.width + zx + i) * 4
      const b = img.data[p]
      const g = img.data[p + 1]
      const r = img.data[p + 2]
      y[j * zw + i] = luma(b, g, r)
      sat[j * zw + i] = Math.max(r, g, b) - Math.min(r, g, b)
    }
  // цифра — тонкий светлый штрих (почти серый) с тёмной обводкой по обе стороны: слева и справа или сверху и снизу
  // в пределах ширины штриха. Белые места рисунка предмета широкие — внутри них тёмного рядом нет, а у края — только
  // с одной стороны.
  const sorted = [...y].sort((a, b) => a - b)
  const hi = sorted[Math.floor(sorted.length * 0.99)]
  const bright = Math.max(140, hi * 0.7)
  // обводка — заметно темнее самой цифры (на светлом рисунке она серая, не чёрная)
  const drop = Math.max(60, hi * 0.32)
  const mask = new Uint8Array(zw * zh)
  const rad = Math.max(2, Math.round(cell.height * 0.07))
  const darkAt = (i: number, j: number, v: number): boolean => i >= 0 && j >= 0 && i < zw && j < zh && y[j * zw + i] <= v - drop
  const side = (i: number, j: number, di: number, dj: number): boolean => {
    const v = y[j * zw + i]
    for (let t = 1; t <= rad; t++) if (darkAt(i + di * t, j + dj * t, v)) return true
    return false
  }
  for (let j = 0; j < zh; j++)
    for (let i = 0; i < zw; i++) {
      const k = j * zw + i
      if (y[k] < bright || sat[k] > 60) continue
      if ((side(i, j, -1, 0) && side(i, j, 1, 0)) || (side(i, j, 0, -1) && side(i, j, 0, 1))) mask[k] = 1
    }
  // крапинки рисунка (меньше двух соседей по стороне) — прочь: они склеивают знаки между собой
  const clean = mask.slice()
  for (let j = 0; j < zh; j++)
    for (let i = 0; i < zw; i++) {
      const k = j * zw + i
      if (!mask[k]) continue
      const n = (i > 0 ? mask[k - 1] : 0) + (i < zw - 1 ? mask[k + 1] : 0) + (j > 0 ? mask[k - zw] : 0) + (j < zh - 1 ? mask[k + zw] : 0)
      if (n < 2) clean[k] = 0
    }
  mask.set(clean)
  // связные куски маски
  const label = new Int32Array(zw * zh).fill(-1)
  const comps: Comp[] = []
  const stack: number[] = []
  for (let k = 0; k < mask.length; k++) {
    if (!mask[k] || label[k] >= 0) continue
    const c: Comp = { x0: zw, y0: zh, x1: -1, y1: -1, n: 0 }
    const id = comps.length
    label[k] = id
    stack.push(k)
    while (stack.length) {
      const q = stack.pop()!
      const qx = q % zw
      const qy = (q - qx) / zw
      c.x0 = Math.min(c.x0, qx)
      c.x1 = Math.max(c.x1, qx)
      c.y0 = Math.min(c.y0, qy)
      c.y1 = Math.max(c.y1, qy)
      c.n++
      // 4-связность: соседние цифры касаются только углами
      for (const [dx, dy] of NEIGHBORS) {
        const nx = qx + dx
        const ny = qy + dy
        if (nx < 0 || ny < 0 || nx >= zw || ny >= zh) continue
        const nk = ny * zw + nx
        if (mask[nk] && label[nk] < 0) {
          label[nk] = id
          stack.push(nk)
        }
      }
    }
    comps.push(c)
  }
  const minH = cell.height * DIGIT_H[0]
  const maxH = cell.height * DIGIT_H[1]
  // строка числа — у верхнего края ячейки: куски, начинающиеся ниже или слишком крупные, — рисунок предмета
  const top = cell.height * 0.24
  const parts = comps
    .map((c, id) => ({ ...c, id }))
    .filter((c) => c.y0 <= top && c.y1 - c.y0 + 1 >= minH * 0.4 && c.y1 - c.y0 + 1 <= maxH * 1.15 && c.x1 - c.x0 + 1 <= maxH)
    .sort((p, q) => p.x0 - q.x0)
  // высота цифр — по самому высокому куску у левого края; цепочка вправо, пока промежутки малы
  const lead = parts.filter((p) => p.x0 <= zw * 0.35 && p.y1 - p.y0 + 1 >= minH)
  if (!lead.length) return null
  const hgt = Math.max(...lead.map((p) => p.y1 - p.y0 + 1))
  const first = lead[0]
  // цифра может распасться на куски (тонкие места) — полоса строки с запасом на высоту цифры в обе стороны
  const band0 = first.y0 - hgt
  const band1 = first.y1 + hgt * 0.6
  const keep: typeof parts = []
  let right = first.x0
  for (const p of parts) {
    if (p.x0 < first.x0) continue
    if (p.y0 < band0 || p.y1 > band1) continue
    if (p.x0 - right > hgt * 0.6 && keep.length) break
    keep.push(p)
    right = Math.max(right, p.x1)
  }
  // маска только знаков строки; знаки — разрывы в проекции на столбцы
  const ids = new Set(keep.map((p) => p.id))
  const text = new Uint8Array(zw * zh)
  for (let k = 0; k < text.length; k++) if (label[k] >= 0 && ids.has(label[k])) text[k] = 1
  const x0 = Math.min(...keep.map((p) => p.x0))
  const x1 = Math.max(...keep.map((p) => p.x1))
  const y0 = Math.min(...keep.map((p) => p.y0))
  const y1 = Math.max(...keep.map((p) => p.y1))
  const glyphs: Comp[] = []
  let run: Comp | null = null
  for (let i = x0; i <= x1 + 1; i++) {
    let n = 0
    let gy0 = zh
    let gy1 = -1
    if (i <= x1)
      for (let j = y0; j <= y1; j++)
        if (text[j * zw + i]) {
          n++
          gy0 = Math.min(gy0, j)
          gy1 = Math.max(gy1, j)
        }
    if (n) {
      if (!run) run = { x0: i, x1: i, y0: gy0, y1: gy1, n }
      else {
        run.x1 = i
        run.y0 = Math.min(run.y0, gy0)
        run.y1 = Math.max(run.y1, gy1)
        run.n += n
      }
    } else if (run) {
      // узкие обрывки (хвост соседнего рисунка) — не знак
      if (run.y1 - run.y0 + 1 >= minH * 0.6) glyphs.push(run)
      run = null
    }
  }
  if (!glyphs.length) return null
  const loose = parts.some(
    (p) => !ids.has(p.id) && p.x1 >= x0 - hgt * 0.3 && p.x0 <= x1 + hgt * 1.5 && p.y1 - p.y0 + 1 >= minH * 0.6 && p.y0 <= y1 && p.y1 >= y0
  )
  return { zone: { x: zx, y: zy, width: zw, height: zh }, glyphs, mask: text, y, w: zw, h: zh, loose }
}

/** Знаки числа → картинка для распознавателя: тёмные цифры на белом, высота OCR_DIGIT, белая рамка. */
export function stackImage(s: StackGlyphs, soft: boolean): Gray {
  const x0 = Math.max(0, s.glyphs[0].x0 - 1)
  const x1 = Math.min(s.w - 1, s.glyphs[s.glyphs.length - 1].x1 + 1)
  const y0 = Math.max(0, Math.min(...s.glyphs.map((g) => g.y0)) - 1)
  const y1 = Math.min(s.h - 1, Math.max(...s.glyphs.map((g) => g.y1)) + 1)
  const w = x1 - x0 + 1
  const h = y1 - y0 + 1
  const hgt = Math.max(...s.glyphs.map((g) => g.y1 - g.y0 + 1))
  const k = OCR_DIGIT / hgt
  const ow = Math.max(1, Math.round(w * k))
  const oh = Math.max(1, Math.round(h * k))
  const out: Gray = { width: ow + 2 * BORDER, height: oh + 2 * BORDER, data: new Uint8Array((ow + 2 * BORDER) * (oh + 2 * BORDER)).fill(255) }
  for (let j = 0; j < oh; j++)
    for (let i = 0; i < ow; i++) {
      // билинейно по исходной зоне
      const sx = Math.min(w - 1, Math.max(0, (i + 0.5) / k - 0.5))
      const sy = Math.min(h - 1, Math.max(0, (j + 0.5) / k - 0.5))
      const ax = Math.floor(sx)
      const ay = Math.floor(sy)
      const bx = Math.min(w - 1, ax + 1)
      const by = Math.min(h - 1, ay + 1)
      const fx = sx - ax
      const fy = sy - ay
      const at = (xx: number, yy: number): number => {
        const q = (y0 + yy) * s.w + x0 + xx
        // мягкий вариант: яркость только там, где маска текста рядом, иначе фон
        return soft ? (s.mask[q] ? s.y[q] : Math.min(s.y[q], 120)) : s.mask[q] ? 255 : 0
      }
      const v = (at(ax, ay) * (1 - fx) + at(bx, ay) * fx) * (1 - fy) + (at(ax, by) * (1 - fx) + at(bx, by) * fx) * fy
      const ink = soft ? Math.max(0, Math.min(1, (v - 110) / 120)) : v / 255
      out.data[(j + BORDER) * out.width + i + BORDER] = Math.round(255 * (1 - ink))
    }
  return out
}

/**
 * Прочитать число стопки; null — числа нет или не читается. Есть образцы цифр (digits.ts) — число по образцам,
 * распознаватель — второе мнение: «уверенно», когда все знаки узнаны с отрывом и оба варианта распознавателя
 * дали то же число. Без образцов — только распознаватель: два варианта подготовки совпали и знаков столько же,
 * сколько цифр.
 */
export function readStack(img: Bitmap, cell: Rect, ocr: OcrFn | null, digits?: DigitSet | null): { count: number; sure: boolean } | null {
  const s = stackGlyphs(img, cell)
  if (!s) return null
  const reads = ocr ? [stackImage(s, false), stackImage(s, true)].map((g) => ocr(g).replace(/[^0-9]/g, '')) : []
  const valid = (r: string): boolean => r.length > 0 && Number(r) > 0 && Number(r) <= MAX_STACK
  if (digits) {
    const guesses = s.glyphs.map((_, i) => classifyGlyph(s, i, digits))
    if (guesses.every((g) => g !== null)) {
      const text = guesses.map((g) => g!.digit).join('')
      if (valid(text)) {
        // уверенно — только когда образцы и распознаватель сошлись (на сером снимке поодиночке ошибаются оба)
        const agree = reads.length > 0 && reads.every((r) => r === text)
        // один знак — частый случай обрывка цифры («4» без перекладины похож на «1»): нужен больший отрыв
        const single = guesses.length > 1 || (guesses[0]!.best >= 0.85 && guesses[0]!.best - guesses[0]!.other >= 0.2)
        return { count: Number(text), sure: !s.loose && single && guesses.every((g) => digitSure(g!)) && agree }
      }
    }
  }
  const ok = reads.filter(valid)
  if (!ok.length) return null
  const fits = ok.filter((r) => r.length === s.glyphs.length)
  const pick = fits[0] ?? ok[0]
  const sure = !s.loose && fits.length === reads.length && fits.every((r) => r === pick)
  return { count: Number(pick), sure }
}
