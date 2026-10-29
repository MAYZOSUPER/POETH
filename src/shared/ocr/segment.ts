// Разметка стакана «Курс / Кол-во» на снимке (S28, чистый модуль; tests/ocr/segment.test.ts).
// Снимок — небольшая область у курсора. Светлые серые точки (inkMap) → маска по местному фону → компоненты →
// строки текста → строки таблицы: слева курс («1 : 296», «‹ 1 : 318»), справа количество. Таблицу узнаём по
// форме: несколько строк подряд с двоеточием в левой ячейке, ровный шаг строк, правая колонка на одной оси.

import { inkMap, type Bitmap } from './bitmap'

export interface Box {
  x0: number
  y0: number
  /** не включительно */
  x1: number
  y1: number
  /** точек в компоненте */
  area: number
}

export const boxW = (b: Box): number => b.x1 - b.x0
export const boxH = (b: Box): number => b.y1 - b.y0

/** Связные компоненты (8-связность) маски 0/1. */
export function components(mask: Uint8Array, w: number, h: number): Box[] {
  const seen = new Uint8Array(mask.length)
  const out: Box[] = []
  const stack: number[] = []
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || seen[i]) continue
    seen[i] = 1
    stack.push(i)
    const b: Box = { x0: w, y0: h, x1: 0, y1: 0, area: 0 }
    while (stack.length) {
      const p = stack.pop()!
      const x = p % w
      const y = (p - x) / w
      b.area++
      if (x < b.x0) b.x0 = x
      if (y < b.y0) b.y0 = y
      if (x + 1 > b.x1) b.x1 = x + 1
      if (y + 1 > b.y1) b.y1 = y + 1
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy
        if (yy < 0 || yy >= h) continue
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx
          if (xx < 0 || xx >= w) continue
          const q = yy * w + xx
          if (mask[q] && !seen[q]) {
            seen[q] = 1
            stack.push(q)
          }
        }
      }
    }
    out.push(b)
  }
  return out
}

export interface TextLine {
  /** компоненты строки слева направо */
  boxes: Box[]
  y0: number
  y1: number
}

/**
 * Компоненты → строки текста. Цифры шрифта игры «старого стиля»: 3, 4, 5, 7, 9 опускаются ниже строки, 6 и 8
 * поднимаются, поэтому строку держит средний центр её цифр (без «роста» — иначе соседняя иконка склеит две
 * строки таблицы). Сначала цифроподобные компоненты задают строки, мелкие (двоеточие, «‹», обломки) — к своей.
 */
export function textLines(boxes: readonly Box[], glyphH: number): TextLine[] {
  const cyOf = (b: Box): number => (b.y0 + b.y1) / 2
  const tall = boxes.filter((b) => boxH(b) >= glyphH * 0.6 && boxH(b) <= glyphH * 1.6).sort((a, b) => cyOf(a) - cyOf(b))
  const lines: Array<TextLine & { cy: number; n: number }> = []
  for (const b of tall) {
    const cy = cyOf(b)
    const line = lines.find((l) => Math.abs(cy - l.cy) <= glyphH * 0.35)
    if (line) {
      line.boxes.push(b)
      line.cy = (line.cy * line.n + cy) / (line.n + 1)
      line.n++
      line.y0 = Math.min(line.y0, b.y0)
      line.y1 = Math.max(line.y1, b.y1)
    } else lines.push({ boxes: [b], y0: b.y0, y1: b.y1, cy, n: 1 })
  }
  for (const b of boxes) {
    if (boxH(b) >= glyphH * 0.6) continue
    // к ближайшей строке: у таблицы рядом строка с названием предмета
    let line: (typeof lines)[number] | null = null
    for (const l of lines) {
      const d = Math.abs(cyOf(b) - l.cy)
      if (d <= glyphH * 0.6 && (!line || d < Math.abs(cyOf(b) - line.cy))) line = l
    }
    if (line) line.boxes.push(b)
  }
  for (const l of lines) l.boxes.sort((a, b) => a.x0 - b.x0)
  return lines.sort((a, b) => a.y0 - b.y0).map(({ boxes: bs, y0, y1 }) => ({ boxes: bs, y0, y1 }))
}

/** Наиболее частая высота «цифроподобных» компонент (±1 точка) в пределах [lo, hi]; null — таких нет. */
export function glyphHeight(boxes: readonly Box[], lo: number, hi: number): number | null {
  const count = new Map<number, number>()
  for (const b of boxes) {
    const h = boxH(b)
    const k = boxW(b) / h
    if (h < lo || h > hi || k < 0.2 || k > 1.1 || b.area < h) continue
    count.set(h, (count.get(h) ?? 0) + 1)
  }
  let best: number | null = null
  let score = 0
  for (const h of count.keys()) {
    const s = (count.get(h - 1) ?? 0) + (count.get(h) ?? 0) * 2 + (count.get(h + 1) ?? 0)
    if (s > score || (s === score && best !== null && h > best)) {
      score = s
      best = h
    }
  }
  return score >= 6 ? best : null
}

/** Значение на доле q (0…1) распределения. */
export function percentile(v: Uint8Array, q: number): number {
  const hist = new Array<number>(256).fill(0)
  for (const x of v) hist[x]++
  let acc = 0
  const need = v.length * q
  for (let i = 0; i < 256; i++) {
    acc += hist[i]
    if (acc >= need) return i
  }
  return 255
}

/** Среднее по квадрату (2r+1)² вокруг каждой точки — через интегральное изображение. */
export function boxMean(v: Uint8Array, w: number, h: number, r: number): Float32Array {
  const sum = new Float64Array((w + 1) * (h + 1))
  for (let y = 0; y < h; y++) {
    let row = 0
    for (let x = 0; x < w; x++) {
      row += v[y * w + x]
      sum[(y + 1) * (w + 1) + x + 1] = sum[y * (w + 1) + x + 1] + row
    }
  }
  const out = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r)
    const y1 = Math.min(h, y + r + 1)
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r)
      const x1 = Math.min(w, x + r + 1)
      const s = sum[y1 * (w + 1) + x1] - sum[y0 * (w + 1) + x1] - sum[y1 * (w + 1) + x0] + sum[y0 * (w + 1) + x0]
      out[y * w + x] = s / ((y1 - y0) * (x1 - x0))
    }
  }
  return out
}

/**
 * Маска текста с гистерезисом: «сильные» точки — заметно светлее фона вокруг (фон таблицы полупрозрачный, под
 * ним текстура окна, поэтому общий порог не годится), к ним прирастают соседние «слабые» — так тонкие штрихи
 * («1», диагональ «2») не рвутся на малом разрешении, а одиночные блики фона без сильной точки отбрасываются.
 * r — полуокно фона, точки. Пороги — доли яркости самых светлых точек снимка.
 */
export function textMask(
  img: Bitmap,
  r: number,
  opts: { strong?: number; weak?: number } = {}
): { mask: Uint8Array; ink: Uint8Array; mean: Float32Array; peak: number } {
  const { width: w, height: h } = img
  const ink = inkMap(img)
  const mean = boxMean(ink, w, h, Math.max(2, Math.round(r)))
  const peak = percentile(ink, 0.995)
  const strong = (opts.strong ?? 0.25) * peak
  const weak = (opts.weak ?? 0.1) * peak
  const mask = new Uint8Array(ink.length)
  const stack: number[] = []
  for (let i = 0; i < ink.length; i++)
    if (ink[i] > peak * 0.5 && ink[i] > mean[i] + strong) {
      mask[i] = 1
      stack.push(i)
    }
  while (stack.length) {
    const p = stack.pop()!
    const x = p % w
    const y = (p - x) / w
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx
        const yy = y + dy
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue
        const q = yy * w + xx
        if (!mask[q] && ink[q] > peak * 0.35 && ink[q] > mean[q] + weak) {
          mask[q] = 1
          stack.push(q)
        }
      }
  }
  return { mask, ink, mean, peak }
}

export interface CellRect {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** Строка стакана на снимке: части курса «A : B» и количество, плюс знак «‹» у последней строки. */
export interface BookRowLayout {
  /** «‹ 1 : 318» — дальше по цене (последняя строка) */
  beyond: boolean
  /** число слева от двоеточия */
  a: CellRect
  /** справа от двоеточия */
  b: CellRect
  stock: CellRect
  /** компоненты маски по ячейкам (счёт цифр и десятичной точки) */
  parts: { a: Box[]; b: Box[]; stock: Box[] }
  /** верх и низ цифр строки */
  y0: number
  y1: number
}

export interface TableLayout {
  rows: BookRowLayout[]
  /** высота цифр, точки снимка */
  glyphH: number
  /** для подготовки ячеек к распознаванию: «чернила», фон вокруг, яркость текста, ширина снимка */
  ink: Uint8Array
  mean: Float32Array
  peak: number
  width: number
  height: number
}

interface Group {
  boxes: Box[]
  x0: number
  x1: number
}

function groupsOf(line: TextLine, gap: number): Group[] {
  const out: Group[] = []
  for (const b of line.boxes) {
    const g = out[out.length - 1]
    if (g && b.x0 - g.x1 <= gap) {
      g.boxes.push(b)
      g.x1 = Math.max(g.x1, b.x1)
    } else out.push({ boxes: [b], x0: b.x0, x1: b.x1 })
  }
  return out
}

/**
 * Знак «‹» перед курсом последней строки: ниже цифр и узкий, а самая левая его точка — посередине высоты
 * (остриё), тогда как у «1» — флажок сверху или засечка снизу.
 */
function isChevron(b: Box, mask: Uint8Array, w: number, digitH: number): boolean {
  const h = boxH(b)
  if (h < digitH * 0.3 || h > digitH * 0.9 || boxW(b) > digitH * 0.7) return false
  let tipY = -1
  let tipX = b.x1
  for (let y = b.y0; y < b.y1; y++)
    for (let x = b.x0; x < b.x1; x++)
      if (mask[y * w + x]) {
        if (x < tipX) {
          tipX = x
          tipY = y
        }
        break
      }
  return tipY >= 0 && Math.abs(tipY + 0.5 - (b.y0 + b.y1) / 2) <= h * 0.25
}

/**
 * Двоеточие в промежутке между числами. Точки тусклее цифр: на малом разрешении светлая серединка точки
 * сливается с фоном, но остаётся тёмная обводка шрифта игры. Поэтому смотрим среднюю треть промежутка: и в
 * верхней, и в нижней половине строки есть светлое пятно над фоном (bright) или почти чёрная обводка (dark).
 * 0…1 — «сила» более слабой из двух точек.
 */
export function colonScore(
  ink: Uint8Array,
  w: number,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  text: number
): { bright: number; dark: number } {
  const cx0 = Math.round(x0 + (x1 - x0) / 3)
  const cx1 = Math.max(cx0 + 1, Math.round(x1 - (x1 - x0) / 3))
  const mid = Math.round((y0 + y1) / 2)
  const vals: number[] = []
  const hi = [0, 0]
  const lo = [255, 255]
  for (let y = y0; y < y1; y++)
    for (let x = cx0; x < cx1; x++) {
      const v = ink[y * w + x]
      const half = y < mid ? 0 : 1
      vals.push(v)
      hi[half] = Math.max(hi[half], v)
      lo[half] = Math.min(lo[half], v)
    }
  if (!vals.length) return { bright: 0, dark: 0 }
  vals.sort((a, b) => a - b)
  const bg = vals[Math.floor(vals.length / 2)]
  const span = text - bg
  return {
    bright: span > 10 ? Math.max(0, Math.min(hi[0] - bg, hi[1] - bg) / span) : 0,
    dark: bg > 10 ? Math.max(0, Math.min(bg - lo[0], bg - lo[1]) / bg) : 0
  }
}

/**
 * Найти стакан на снимке у курсора. hint — ожидаемая высота цифр (по высоте окна игры), ищем в 0,5…2×.
 * null — таблицы нет (Alt не зажат, курсор не над «Рыночным курсом», другое окно).
 */
export function findTable(img: Bitmap, hint: number): TableLayout | null {
  const r = Math.max(4, Math.round(hint * 1.2))
  const { mask, ink, mean, peak } = textMask(img, r)
  const boxes = components(mask, img.width, img.height).filter((b) => b.area >= 3)
  const gh = glyphHeight(boxes, Math.max(5, hint * 0.5), hint * 2)
  if (!gh) return null

  const rows: BookRowLayout[] = []
  // группа — число, если по высоте как цифры (тонкие места цифры на малом разрешении рвутся на куски)
  const digit = (g: Group): boolean => {
    const y0 = Math.min(...g.boxes.map((b) => b.y0))
    const y1 = Math.max(...g.boxes.map((b) => b.y1))
    return y1 - y0 >= gh * 0.75 && y1 - y0 <= gh * 1.45 && g.x1 - g.x0 >= gh * 0.2
  }
  for (const line of textLines(boxes, gh)) {
    const groups = groupsOf(line, gh * 0.45)
    // «[‹] A : B   количество» — подряд идущие числа строки (слева и справа может быть чужой текст окна);
    // мелкие метки между ними (двоеточие на крупном разрешении — отдельная группа) пропускаем
    const nums = groups.map((g, i) => ({ g, i })).filter(({ g }) => digit(g))
    const mark = (g: Group): boolean => g.boxes.every((b) => boxH(b) < gh * 0.6)
    for (let n = 0; n + 2 < nums.length; n++) {
      const [A, B, S] = [nums[n], nums[n + 1], nums[n + 2]]
      const between = (from: number, to: number): boolean => groups.slice(from + 1, to).every(mark)
      if (!between(A.i, B.i) || !between(B.i, S.i)) continue
      const [ga, gb, gs] = [A.g, B.g, S.g]
      const colonGap = gb.x0 - ga.x1
      const stockGap = gs.x0 - gb.x1
      if (colonGap < gh * 0.5 || colonGap > gh * 2.5 || stockGap < gh * 1.5 || stockGap > gh * 8) continue
      const ly0 = Math.min(...[...ga.boxes, ...gb.boxes].map((b) => b.y0))
      const ly1 = Math.max(...[...ga.boxes, ...gb.boxes].map((b) => b.y1))
      const colon = colonScore(ink, img.width, ga.x1, gb.x0, ly0, ly1, peak)
      if (!(colon.bright >= 0.3 || (colon.bright >= 0.2 && colon.dark >= 0.65))) continue
      const prev = groups[A.i - 1]
      const aH = Math.max(...ga.boxes.map(boxH))
      const mid = (ly0 + ly1) / 2
      const beyond =
        !!prev &&
        prev.boxes.length === 1 &&
        ga.x0 - prev.x1 <= gh * 1.2 &&
        Math.abs((prev.boxes[0].y0 + prev.boxes[0].y1) / 2 - mid) <= gh * 0.3 &&
        isChevron(prev.boxes[0], mask, img.width, aH)
      const pad = Math.max(1, Math.round(gh * 0.15))
      const cell = (g: Group): CellRect => ({ x0: g.x0 - pad, y0: ly0 - pad, x1: g.x1 + pad, y1: ly1 + pad })
      rows.push({
        beyond,
        a: cell(ga),
        b: cell(gb),
        stock: cell(gs),
        parts: { a: ga.boxes, b: gb.boxes, stock: gs.boxes },
        y0: ly0,
        y1: ly1
      })
    }
  }
  const table = pickTable(rows, gh)
  // одна строка без «‹» — это не стакан, а курс посреди окна обмена (Alt не зажат)
  if (table.length < 2 && !table[0]?.beyond) return null
  return { rows: table, glyphH: gh, ink, mean, peak, width: img.width, height: img.height }
}

/**
 * Строки одной таблицы: самая длинная цепочка строк с ровным шагом (1,2…2,4 высоты цифр), двоеточия на одной
 * вертикали, количество — в одной колонке.
 */
function pickTable(rows: BookRowLayout[], gh: number): BookRowLayout[] {
  let best: BookRowLayout[] = []
  for (let i = 0; i < rows.length; i++) {
    const chain = [rows[i]]
    for (let j = i + 1; j < rows.length; j++) {
      const prev = chain[chain.length - 1]
      const step = rows[j].y0 - prev.y0
      if (step < gh * 1.2) continue
      if (step > gh * 2.4) break
      const colon = (r: BookRowLayout): number => (r.a.x1 + r.b.x0) / 2
      const stock = (r: BookRowLayout): number => (r.stock.x0 + r.stock.x1) / 2
      if (Math.abs(colon(rows[j]) - colon(chain[0])) > gh * 0.6) continue
      if (Math.abs(stock(rows[j]) - stock(chain[0])) > gh * 2.5) continue
      chain.push(rows[j])
    }
    if (chain.length > best.length) best = chain
  }
  return best
}
