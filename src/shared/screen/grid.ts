// Окна с обычной сеткой (S68, заготовка): награды Ритуала (PoE 1 и PoE 2, «Favours»), окно торговца Экспедиции
// (Туйен и др.). В отличие от особых вкладок, ячейки здесь — одна решётка с общим шагом, а предметы бывают любого
// размера (1×1 … 2×4). Чистый модуль, как recognize.ts.
//
// 1. Кандидаты в ячейки по рамкам (slots.ts): в сетке рамки соседних ячеек общие, квадраты стоят вплотную.
// 2. Решётка: шаг — медиана размеров, начало — голосование остатков (x mod шаг, y mod шаг), границы — ряды и столбцы
//    решётки, где кандидатов хотя бы два.
// 3. Каждая ячейка: «занято» (разброс яркости, как у свободных ячеек вкладок), предмет 1×1 — ближайшая иконка
//    каталога (сфера, знамение, осколок); крупный предмет занимает несколько ячеек и иконкой 1×1 не узнаётся —
//    ячейка «занята, не узнана». Узнавание предметов w×h и цены уников — следующий шаг (нужны образцы окон).

import { clampRect, type Bitmap, type Rect } from '../ocr/bitmap'
import type { ScreenCell } from '../types/screen'
import { shrinkGray, toGray } from './image'
import { bestPlacement, cellPatch, iconRect, nearestIcons, type IconDesc } from './icons'
import { occupied, SLOT_RANGE } from './recognize'
import { refineSlot, slotCandidates } from './slots'

const WORK_HEIGHT = 720
const MATCH = 0.55
const NN_SHIFTS = [-0.06, 0, 0.06]

export interface Lattice {
  /** левый верхний угол ячейки (0, 0) и шаг, точки снимка */
  x: number
  y: number
  pitch: number
  cols: number
  rows: number
}

export interface GridInput {
  img: Bitmap
  clientHeight: number
  icons: readonly IconDesc[]
  /** где искать окно (по умолчанию весь снимок) */
  region?: Rect
}

export interface GridResult {
  lattice: Lattice | null
  cells: ScreenCell[]
  ms: number
}

/** Решётка по кандидатам-квадратам: null — меньше 6 ячеек на общей решётке. */
export function fitLattice(boxes: ReadonlyArray<{ x: number; y: number; size: number }>): Lattice | null {
  if (boxes.length < 6) return null
  const sizes = boxes.map((b) => b.size).sort((a, b) => a - b)
  const size = sizes[sizes.length >> 1]
  // шаг — по расстояниям между соседями в ряду и столбце (размер квадрата зависит от того, какой край рамки нашёлся,
  // а ошибка шага в 4 % на 12 столбцах — полячейки)
  const steps: number[] = []
  for (const b of boxes)
    for (const c of boxes) {
      const dx = c.x - b.x
      const dy = c.y - b.y
      if (Math.abs(dy) < size * 0.2 && dx > size * 0.7 && dx < size * 1.4) steps.push(dx)
      if (Math.abs(dx) < size * 0.2 && dy > size * 0.7 && dy < size * 1.4) steps.push(dy)
    }
  if (steps.length < 4) return null
  steps.sort((p, q) => p - q)
  const pitch0 = steps[steps.length >> 1]
  // остатки по шагу: в решётке они у всех ячеек одни (с точностью до рамки)
  const bins = 24
  const hx = new Array<number>(bins).fill(0)
  const hy = new Array<number>(bins).fill(0)
  const frac = (v: number): number => (((v / pitch0) % 1) + 1) % 1
  for (const b of boxes) {
    hx[Math.floor(frac(b.x) * bins) % bins]++
    hy[Math.floor(frac(b.y) * bins) % bins]++
  }
  const peak = (h: number[]): number => {
    let best = 0
    for (let i = 1; i < bins; i++) if (h[i] + h[(i + bins - 1) % bins] + h[(i + 1) % bins] > h[best] + h[(best + bins - 1) % bins] + h[(best + 1) % bins]) best = i
    return ((best + 0.5) / bins) * pitch0
  }
  // грубые начало и шаг → наименьшие квадраты «координата = начало + индекс · шаг» по кандидатам на решётке (ошибка шага
  // в полточки на 12 столбцах — уже полячейки)
  const fitAxis = (o0: number, pick: (b: { x: number; y: number }) => number): { o: number; p: number } => {
    let o = o0
    let p = pitch0
    for (let it = 0; it < 3; it++) {
      let n = 0
      let si = 0
      let sv = 0
      let sii = 0
      let siv = 0
      for (const b of boxes) {
        const v = pick(b)
        const i = Math.round((v - o) / p)
        if (Math.abs(v - (o + i * p)) > p * 0.25) continue
        n++
        si += i
        sv += v
        sii += i * i
        siv += i * v
      }
      const den = n * sii - si * si
      if (n < 3 || den === 0) break
      p = (n * siv - si * sv) / den
      o = (sv - p * si) / n
    }
    return { o, p }
  }
  const fx = fitAxis(peak(hx), (b) => b.x)
  const fy = fitAxis(peak(hy), (b) => b.y)
  const pitch = (fx.p + fy.p) / 2
  const ox = fx.o
  const oy = fy.o
  // индексы решётки у кандидатов, стоящих на ней
  const cols = new Map<number, number>()
  const rows = new Map<number, number>()
  for (const b of boxes) {
    const i = Math.round((b.x - ox) / pitch)
    const j = Math.round((b.y - oy) / pitch)
    if (Math.abs(b.x - (ox + i * pitch)) > pitch * 0.2 || Math.abs(b.y - (oy + j * pitch)) > pitch * 0.2) continue
    cols.set(i, (cols.get(i) ?? 0) + 1)
    rows.set(j, (rows.get(j) ?? 0) + 1)
  }
  // границы — самый длинный ряд индексов с кандидатами (пропуск в один ряд или столбец допустим: ячейки под крупным
  // предметом рамок не имеют)
  const span = (m: Map<number, number>): [number, number] | null => {
    const keys = [...m.keys()].sort((p, q) => p - q)
    let best: [number, number] | null = null
    let start = 0
    for (let i = 1; i <= keys.length; i++) {
      if (i < keys.length && keys[i] - keys[i - 1] <= 2) continue
      const run: [number, number] = [keys[start], keys[i - 1]]
      if (!best || run[1] - run[0] > best[1] - best[0]) best = run
      start = i
    }
    return best
  }
  const cs = span(cols)
  const rs = span(rows)
  if (!cs || !rs) return null
  const lat: Lattice = { x: ox + cs[0] * pitch, y: oy + rs[0] * pitch, pitch, cols: cs[1] - cs[0] + 1, rows: rs[1] - rs[0] + 1 }
  return lat.cols * lat.rows >= 6 ? lat : null
}

/**
 * Нарастить решётку: крайний ряд или столбец часто без кандидатов (рамка окна рядом), — берём соседний ряд, если
 * рамки есть хотя бы у половины его ячеек. hasFrame — проверка квадрата на снимке.
 */
export function growLattice(l: Lattice, hasFrame: (r: Rect) => boolean, img: { width: number; height: number }): void {
  const cell = (i: number, j: number): Rect => ({ x: l.x + i * l.pitch, y: l.y + j * l.pitch, width: l.pitch, height: l.pitch })
  const inside = (r: Rect): boolean => r.x >= 0 && r.y >= 0 && r.x + r.width <= img.width && r.y + r.height <= img.height
  const ok = (cells: Rect[]): boolean => cells.every(inside) && cells.filter(hasFrame).length >= Math.max(2, cells.length / 2)
  for (let guard = 0; guard < 8; guard++) {
    let grown = false
    if (ok(Array.from({ length: l.cols }, (_, i) => cell(i, -1)))) {
      l.y -= l.pitch
      l.rows++
      grown = true
    }
    if (ok(Array.from({ length: l.cols }, (_, i) => cell(i, l.rows)))) {
      l.rows++
      grown = true
    }
    if (ok(Array.from({ length: l.rows }, (_, j) => cell(-1, j)))) {
      l.x -= l.pitch
      l.cols++
      grown = true
    }
    if (ok(Array.from({ length: l.rows }, (_, j) => cell(l.cols, j)))) {
      l.cols++
      grown = true
    }
    if (!grown) break
  }
}

export function recognizeGrid(inp: GridInput): GridResult {
  const t0 = performance.now()
  const { img } = inp
  const H = inp.clientHeight
  const region = clampRect(inp.region ?? { x: 0, y: 0, width: img.width, height: img.height }, img.width, img.height)
  const kw = Math.min(1, WORK_HEIGHT / H)
  const gray = shrinkGray(toGray(img, region), kw)
  const boxes = slotCandidates(gray, { minSize: SLOT_RANGE[0] * H * kw, maxSize: SLOT_RANGE[1] * H * kw }).map((b) => ({
    x: region.x + b.x / kw,
    y: region.y + b.y / kw,
    size: b.size / kw
  }))
  const lattice = fitLattice(boxes)
  if (lattice) growLattice(lattice, (r) => {
    const b = refineSlot(gray, { x: (r.x - region.x) * kw, y: (r.y - region.y) * kw, size: r.width * kw }, Math.max(2, r.width * kw * 0.08))
    return !!b && b.score >= 3
  }, img)
  const cells: ScreenCell[] = []
  if (lattice)
    for (let j = 0; j < lattice.rows; j++)
      for (let i = 0; i < lattice.cols; i++) {
        const rect = { x: lattice.x + i * lattice.pitch, y: lattice.y + j * lattice.pitch, width: lattice.pitch, height: lattice.pitch }
        if (rect.x < 0 || rect.y < 0 || rect.x + rect.width > img.width || rect.y + rect.height > img.height) continue
        const present = occupied(img, rect)
        let item: string | null = null
        let match = 0
        if (present) {
          // клетка решётки может стоять на 2–3 точки мимо рисунка: ближайшие иконки при нескольких сдвигах, потом лучшая
          const pool = new Map<IconDesc, number>()
          for (const dy of NN_SHIFTS)
            for (const dx of NN_SHIFTS)
              for (const h of nearestIcons(cellPatch(img, iconRect(rect, 0.88, dx, dy)), inp.icons, 2)) pool.set(h.icon, Math.max(pool.get(h.icon) ?? -1, h.score.total))
          for (const [icon, v] of [...pool.entries()].sort((p, q) => q[1] - p[1]).slice(0, 3)) {
            if (v < MATCH * 0.8) break
            const p = bestPlacement(img, rect, icon, [0.8, 0.88, 0.96], NN_SHIFTS)
            if (p.score.total >= MATCH && p.score.total > match) {
              item = icon.name
              match = p.score.total
            }
          }
        }
        cells.push({ rect, item, present, count: null, countSure: false, match, slot: j * lattice.cols + i })
      }
  return { lattice, cells, ms: performance.now() - t0 }
}
