// Поиск ячеек окна игры по рамкам (S68, чистый модуль). Без раскладки и без знания разрешения: ячейка особой
// вкладки тайника, окна Ритуала или торговца — квадрат с ровной рамкой, внутри темнее или светлее, чем снаружи.
//
// Для каждого размера s и угла (x, y) считаем перепад яркости поперёк каждой из четырёх сторон (префиксные суммы
// знакового градиента вдоль строки/столбца — O(1) на сторону). Сторона «сильная», когда перепад одного знака
// по всей длине (прямая линия), а у квадрата все четыре перепада направлены одинаково внутрь. Фактура фона и
// рисунок иконок дают перепады вразнобой — сумма вдоль стороны гасится. Углы сторон не берём (у PoE 2 на углах
// рамки узор). Дальше: локальные максимумы, подавление пересечений, общий размер ячеек и выравнивание в ряды или
// столбцы — одиночные квадраты из рисунка фона отпадают.

import type { GrayF } from './image'

export interface SlotBox {
  /** левый верхний угол и сторона, точки картинки поиска */
  x: number
  y: number
  size: number
  /** перепад на самой слабой стороне, единицы яркости на точку */
  score: number
  /** +1 — внутри темнее рамки, −1 — светлее */
  polarity: 1 | -1
}

export interface SlotSearch {
  /** размеры квадрата, точки картинки поиска */
  minSize: number
  maxSize: number
  /** порог перепада на самой слабой стороне (по умолчанию 3) */
  minScore?: number
  /** доля стороны, которую не берём у углов (по умолчанию 0,16) */
  cornerSkip?: number
}

interface Prefix {
  w: number
  h: number
  /** суммы знакового dy вдоль строк: (w + 1) на строку */
  rows: Float64Array
  /** суммы знакового dx вдоль столбцов: (h + 1) на столбец */
  cols: Float64Array
}

function prefixes(g: GrayF): Prefix {
  const { width: w, height: h, data } = g
  const rows = new Float64Array(h * (w + 1))
  const cols = new Float64Array(w * (h + 1))
  for (let y = 0; y < h; y++) {
    const up = y > 0 ? (y - 1) * w : y * w
    const dn = y < h - 1 ? (y + 1) * w : y * w
    const base = y * (w + 1)
    let acc = 0
    for (let x = 0; x < w; x++) {
      acc += (data[dn + x] - data[up + x]) * 0.5
      rows[base + x + 1] = acc
    }
  }
  for (let x = 0; x < w; x++) {
    const lf = x > 0 ? x - 1 : x
    const rt = x < w - 1 ? x + 1 : x
    const base = x * (h + 1)
    let acc = 0
    for (let y = 0; y < h; y++) {
      acc += (data[y * w + rt] - data[y * w + lf]) * 0.5
      cols[base + y + 1] = acc
    }
  }
  return { w, h, rows, cols }
}

/** Перепад квадрата (x, y, s): знак — «внутрь темнее» (+) или «светлее» (−), величина — самая слабая сторона. */
function boxScore(p: Prefix, x: number, y: number, s: number, m: number, lim: number): number {
  const L = s - 2 * m
  const rw = p.w + 1
  const ch = p.h + 1
  // верх: внутрь — вниз (+dy); низ: внутрь — вверх (−dy); лево: внутрь — вправо (+dx); право: внутрь — влево (−dx)
  const top = p.rows[y * rw + x + m + L] - p.rows[y * rw + x + m]
  if (top > -lim * L && top < lim * L) return 0
  const bot = -(p.rows[(y + s) * rw + x + m + L] - p.rows[(y + s) * rw + x + m])
  if ((top > 0) !== (bot > 0)) return 0
  const lft = p.cols[x * ch + y + m + L] - p.cols[x * ch + y + m]
  if ((top > 0) !== (lft > 0)) return 0
  const rgt = -(p.cols[(x + s) * ch + y + m + L] - p.cols[(x + s) * ch + y + m])
  if ((top > 0) !== (rgt > 0)) return 0
  const min = Math.min(Math.abs(top), Math.abs(bot), Math.abs(lft), Math.abs(rgt)) / L
  // «внутрь темнее» — перепад внутрь отрицательный (ярко → темно)
  return top < 0 ? min : -min
}

/** Все квадраты-кандидаты: локальные максимумы по (x, y) для каждого размера. */
function candidates(p: Prefix, o: Required<SlotSearch>): SlotBox[] {
  const out: SlotBox[] = []
  const { w, h } = p
  const map = new Float32Array(w * h)
  for (let s = Math.max(6, Math.round(o.minSize)); s <= Math.round(o.maxSize); s++) {
    const m = Math.max(1, Math.round(s * o.cornerSkip))
    const lim = o.minScore
    const xs = w - s - 1
    const ys = h - s - 1
    if (xs < 1 || ys < 1) break
    map.fill(0)
    for (let y = 1; y < ys; y++)
      for (let x = 1; x < xs; x++) {
        const v = boxScore(p, x, y, s, m, lim)
        if (v >= lim || v <= -lim) map[y * w + x] = v
      }
    for (let y = 1; y < ys; y++)
      for (let x = 1; x < xs; x++) {
        const v = map[y * w + x]
        if (v === 0) continue
        const a = Math.abs(v)
        let best = true
        for (let dy = -1; dy <= 1 && best; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue
            const u = Math.abs(map[(y + dy) * w + x + dx])
            if (u > a || (u === a && (dy < 0 || (dy === 0 && dx < 0)))) {
              best = false
              break
            }
          }
        if (best) out.push({ x, y, size: s, score: a, polarity: v > 0 ? 1 : -1 })
      }
  }
  return out
}

function overlap(a: SlotBox, b: SlotBox): number {
  const ix = Math.min(a.x + a.size, b.x + b.size) - Math.max(a.x, b.x)
  const iy = Math.min(a.y + a.size, b.y + b.size) - Math.max(a.y, b.y)
  if (ix <= 0 || iy <= 0) return 0
  const inter = ix * iy
  return inter / Math.min(a.size * a.size, b.size * b.size)
}

/** Подавление пересечений: лучший квадрат забирает место, пересекающиеся слабее — отпадают. */
export function suppress(boxes: readonly SlotBox[], maxOverlap = 0.3): SlotBox[] {
  const sorted = [...boxes].sort((a, b) => b.score - a.score)
  const kept: SlotBox[] = []
  // сетка для быстрого поиска соседей
  const cell = Math.max(8, Math.max(...sorted.map((b) => b.size), 8))
  const grid = new Map<string, SlotBox[]>()
  const key = (cx: number, cy: number): string => `${cx},${cy}`
  for (const b of sorted) {
    const cx = Math.floor(b.x / cell)
    const cy = Math.floor(b.y / cell)
    let ok = true
    for (let dy = -1; dy <= 1 && ok; dy++)
      for (let dx = -1; dx <= 1 && ok; dx++)
        for (const k of grid.get(key(cx + dx, cy + dy)) ?? [])
          if (overlap(b, k) > maxOverlap) {
            ok = false
            break
          }
    if (!ok) continue
    kept.push(b)
    const list = grid.get(key(cx, cy))
    if (list) list.push(b)
    else grid.set(key(cx, cy), [b])
  }
  return kept
}

/** Размеры ячеек (кластеры ±8 %), где сумма силы квадратов не меньше доли minShare лучшего кластера. */
export function sizeClusters(boxes: readonly SlotBox[], minCount: number, minShare = 0.3): number[] {
  const sorted = [...boxes].sort((a, b) => a.size - b.size)
  const out: Array<{ size: number; sum: number }> = []
  const used = new Set<number>()
  // жадно: самый «тяжёлый» кластер первым, его квадраты больше не участвуют
  for (;;) {
    let best: { size: number; sum: number; idx: number[] } | null = null
    for (let i = 0; i < sorted.length; i++) {
      if (used.has(i)) continue
      const idx: number[] = []
      let sum = 0
      for (let j = i; j < sorted.length && sorted[j].size <= sorted[i].size * 1.16; j++) {
        if (used.has(j)) continue
        idx.push(j)
        sum += sorted[j].score
      }
      if (idx.length >= minCount && sum > (best?.sum ?? 0)) best = { size: sorted[idx[idx.length >> 1]].size, sum, idx }
    }
    if (!best || (out.length && best.sum < out[0].sum * minShare)) break
    for (const j of best.idx) used.add(j)
    out.push({ size: best.size, sum: best.sum })
  }
  return out.map((c) => c.size)
}

/**
 * Опора квадрата на сетку: сколько силы у других квадратов того же размера в его ряду и в его столбце
 * (центры в пределах 8 % стороны), в долях медианной силы, не больше 2 на ряд и на столбец.
 */
function latticeSupport(b: SlotBox, others: readonly SlotBox[], ref: number): { row: number; col: number } {
  const cx = b.x + b.size / 2
  const cy = b.y + b.size / 2
  const tol = b.size * 0.08
  let row = 0
  let col = 0
  for (const c of others) {
    if (c === b || Math.abs(c.size - b.size) > b.size * 0.1) continue
    const ox = c.x + c.size / 2
    const oy = c.y + c.size / 2
    // соседи по ряду — не внахлёст (внахлёст — это соперники за то же место)
    if (Math.abs(oy - cy) <= tol && Math.abs(ox - cx) >= b.size * 0.85) row += c.score
    if (Math.abs(ox - cx) <= tol && Math.abs(oy - cy) >= b.size * 0.85) col += c.score
  }
  return { row: Math.min(2, row / ref), col: Math.min(2, col / ref) }
}

/**
 * Кандидаты в ячейки: квадраты с сильной рамкой общего размера (их хотя бы minGroup). Соперники за одно место
 * (внахлёст) остаются — выбирает pickSlots по рамке или по содержимому (сходство с иконкой).
 */
export function slotCandidates(g: GrayF, search: SlotSearch, minGroup = 4): SlotBox[] {
  const o: Required<SlotSearch> = { minScore: 3, cornerSkip: 0.16, ...search }
  const all = suppress(candidates(prefixes(g), o), 0.6)
  if (!all.length) return []
  // порог силы — от лучших квадратов картинки: рамки ячеек одинаковые, случайные квадраты слабее
  const top = all
    .map((b) => b.score)
    .sort((a, b) => b - a)
    .slice(0, 24)
  const ref = top[Math.min(top.length - 1, Math.floor(top.length * 0.5))]
  const strong = all.filter((b) => b.score >= Math.max(o.minScore, ref * 0.28))
  const sizes = sizeClusters(strong, minGroup)
  return strong.filter((b) => sizes.some((sz) => b.size >= sz * 0.9 && b.size <= sz * 1.1))
}

/**
 * Выбор ячеек из кандидатов: лучший по rank забирает место (пересекающиеся слабее отпадают), затем остаются
 * стоящие в ряд или столбец с другими ячейками. rank ≤ 0 — не ячейка.
 */
export function pickSlots<T extends SlotBox>(cands: readonly T[], rank: (b: T) => number, maxOverlap = 0.3): T[] {
  const ranked = cands.map((b) => ({ b, r: rank(b) })).filter((x) => x.r > 0)
  const kept = suppress(
    ranked.map((x, i) => ({ ...x.b, score: x.r, idx: i })),
    maxOverlap
  ).map((k) => ranked[(k as SlotBox & { idx: number }).idx].b)
  if (kept.length < 2) return kept
  const med = [...kept].sort((a, b) => a.score - b.score)[kept.length >> 1].score || 1
  return kept
    .filter((b) => {
      const sup = latticeSupport(b, kept, med)
      return sup.row + sup.col > 0
    })
    .sort((a, b) => a.y - b.y || a.x - b.x)
}

/** Ячейки только по рамкам (без иконок): кандидаты → выбор по силе рамки. */
export function detectSlots(g: GrayF, search: SlotSearch, minGroup = 4): SlotBox[] {
  return pickSlots(slotCandidates(g, search, minGroup), (b) => b.score)
}

/** Уточнить квадрат на другой картинке (обычно полного разрешения) поиском вокруг (x, y, size). */
export function refineSlot(g: GrayF, box: { x: number; y: number; size: number }, radius: number, cornerSkip = 0.16): SlotBox | null {
  const x0 = Math.max(1, Math.floor(box.x - radius))
  const y0 = Math.max(1, Math.floor(box.y - radius))
  const s0 = Math.max(6, Math.floor(box.size - radius))
  const s1 = Math.ceil(box.size + radius)
  const x1 = Math.ceil(box.x + radius)
  const y1 = Math.ceil(box.y + radius)
  // префиксы только по окну вокруг квадрата
  const pad = 2
  const wx0 = Math.max(0, x0 - pad)
  const wy0 = Math.max(0, y0 - pad)
  const wx1 = Math.min(g.width, x1 + s1 + pad + 1)
  const wy1 = Math.min(g.height, y1 + s1 + pad + 1)
  const ww = wx1 - wx0
  const wh = wy1 - wy0
  if (ww <= 8 || wh <= 8) return null
  const sub = new Float32Array(ww * wh)
  for (let y = 0; y < wh; y++) sub.set(g.data.subarray((wy0 + y) * g.width + wx0, (wy0 + y) * g.width + wx1), y * ww)
  const p = prefixes({ width: ww, height: wh, data: sub })
  let best: SlotBox | null = null
  for (let s = s0; s <= s1; s++) {
    const m = Math.max(1, Math.round(s * cornerSkip))
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const lx = x - wx0
        const ly = y - wy0
        if (lx < 1 || ly < 1 || lx + s >= ww - 1 || ly + s >= wh - 1) continue
        const v = boxScore(p, lx, ly, s, m, 0)
        const a = Math.abs(v)
        if (a > (best?.score ?? 0)) best = { x, y, size: s, score: a, polarity: v > 0 ? 1 : -1 }
      }
  }
  return best
}
