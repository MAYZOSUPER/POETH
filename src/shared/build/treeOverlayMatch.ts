// Автоподгонка наложения дерева по снимку окна игры (S38, вариант (б) фазы 1). Чистый модуль: main гонит его в
// отдельном потоке (src/main/build/treeOverlayFitWorker.ts), тесты — на картинках, нарисованных по tree.json.
//
// Снимок — только по хоткею игрока (Alt+P), только в памяти, в сеть и на диск не уходит. Ищем не «вслепую», а
// около подсказок — где наложение думает дерево (панорама и зум по мыши), «как после входа» (z = 2, круг класса
// в центре), сохранённое положение: без подсказки дерево слишком однообразно (на снимках S38 вслепую — 3 из 8),
// с подсказкой ±150 точек и ±2 щелчка колеса — см. отчёт S38.
//
// Как: рамки нод — кольца с резким краем; поле — модуль градиента яркости. Счёт положения — средний градиент на
// окружностях нод (радиус рамки × scale). Сначала грубо (поле размыто, шаг 8 точек), потом точнее, потом каждая
// нода — к своему кольцу рядом (±3 точки) и наименьшие квадраты по совпавшим: средний счёт смещён на 1–4 точки
// (подсветка рамок), а центры колец — нет (сверено с центрами зелёных взятых нод, 0,5 точки).
//
// Координаты: снимок — индексы пикселей (центр пикселя i — i); TreeView наружу — как у оверлея, пиксель i
// покрывает [i, i + 1), поэтому сдвиг ± 0,5.

import type { Bitmap } from '../ocr/bitmap'
import { nodePosition } from './data'
import type { TreeData } from './types'
import {
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEP,
  zoomOf,
  zoomedOutScale,
  type ClientSize,
  type Point,
  type TreeView
} from './treeOverlay'

/** Нода для подгонки: позиция в tree.json и радиус рамки в единицах дерева. */
export interface FitPoint {
  x: number
  y: number
  r: number
}

export interface FitInput {
  img: Bitmap
  client: ClientSize
  points: readonly FitPoint[]
  /** где может быть дерево (первая — главная); пусто — подгонки нет */
  priors: readonly TreeView[]
  /** курсор (точки клиентской области): вокруг него игра крутит зум */
  cursor: Point | null
}

export interface FitResult {
  /** совпадение уверенное — можно ставить наложение сюда */
  ok: boolean
  view: TreeView
  /** нод на своих кольцах (невязка ≤ INLIER_PX) */
  inliers: number
  /** нод в кадре, которые проверяли */
  checked: number
  ms: number
}

/** Радиус рамки, единицы дерева (по снимкам S38: обычная ~30, нотабль ~55, кейстоун ~80). */
export const FIT_RADIUS = { normal: 30, notable: 55, jewel: 55, keystone: 80 } as const

/** Поиск сдвига вокруг подсказки, точки окна. */
export const FIT_WINDOW_PX = 150
/** Щелчков колеса в обе стороны от зума подсказки. */
export const FIT_ZOOM_STEPS = 2
/** Невязка ноды, при которой она «на своём кольце», точки. */
export const INLIER_PX = 1.5
/** Принять: столько нод на кольцах и такая доля от проверенных (по снимкам S38: верные 0,29–0,54, ложные ≤ 0,13). */
export const MIN_INLIERS = 12
export const MIN_INLIER_SHARE = 0.2

const COARSE_POINTS = 160
/** Грубых максимумов на кандидата: на сильном зуме соседний максимум бывает выше настоящего. */
const COARSE_PEAKS = 3
const FINE_POINTS = 700
const REFINE_PX = 3

interface Field {
  w: number
  h: number
  d: Float32Array
}

// ---------------------------------------------------------------------------
// Поле градиента и размытие
// ---------------------------------------------------------------------------

/** Модуль градиента яркости (Собель) по снимку BGRA. */
export function gradientField(img: Bitmap): Field {
  const { width: w, height: h, data } = img
  const g = new Float32Array(w * h)
  for (let i = 0, j = 0; i < w * h; i++, j += 4) g[i] = (data[j] + data[j + 1] + data[j + 2]) / 3
  const d = new Float32Array(w * h)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1, i = y * w + 1; x < w - 1; x++, i++) {
      const gx = g[i - w + 1] + 2 * g[i + 1] + g[i + w + 1] - g[i - w - 1] - 2 * g[i - 1] - g[i + w - 1]
      const gy = g[i + w - 1] + 2 * g[i + w] + g[i + w + 1] - g[i - w - 1] - 2 * g[i - w] - g[i - w + 1]
      d[i] = Math.sqrt(gx * gx + gy * gy)
    }
  }
  return { w, h, d }
}

/** Размытие: три прохода скользящим средним радиуса r по строкам и столбцам (≈ гаусс σ ≈ r). */
export function blurField(f: Field, r: number): Field {
  let a = f.d.slice()
  let b = new Float32Array(a.length)
  const pass = (src: Float32Array, dst: Float32Array, n: number, stride: number, lines: number, lineStep: number): void => {
    const k = 1 / (2 * r + 1)
    for (let l = 0; l < lines; l++) {
      const base = l * lineStep
      let acc = 0
      for (let i = -r; i <= r; i++) acc += src[base + Math.min(n - 1, Math.max(0, i)) * stride]
      for (let i = 0; i < n; i++) {
        dst[base + i * stride] = acc * k
        acc += src[base + Math.min(n - 1, i + r + 1) * stride] - src[base + Math.max(0, i - r) * stride]
      }
    }
  }
  for (let t = 0; t < 3; t++) {
    pass(a, b, f.w, 1, f.h, f.w)
    pass(b, a, f.h, f.w, f.w, 1)
  }
  b = a
  return { w: f.w, h: f.h, d: b }
}

function sample(f: Field, x: number, y: number): number {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  if (x0 < 0 || y0 < 0 || x0 >= f.w - 1 || y0 >= f.h - 1) return 0
  const fx = x - x0
  const fy = y - y0
  const i = y0 * f.w + x0
  const d = f.d
  return (d[i] * (1 - fx) + d[i + 1] * fx) * (1 - fy) + (d[i + f.w] * (1 - fx) + d[i + f.w + 1] * fx) * fy
}

const circle = (n: number): { c: Float64Array; s: Float64Array } => {
  const c = new Float64Array(n)
  const s = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    c[i] = Math.cos((2 * Math.PI * i) / n)
    s[i] = Math.sin((2 * Math.PI * i) / n)
  }
  return { c, s }
}
const RING8 = circle(8)
const RING12 = circle(12)

function ring(f: Field, x: number, y: number, r: number, k: { c: Float64Array; s: Float64Array }): number {
  let acc = 0
  for (let i = 0; i < k.c.length; i++) acc += sample(f, x + r * k.c[i], y + r * k.s[i])
  return acc / k.c.length
}

// ---------------------------------------------------------------------------
// Кадр: какие ноды видны и не под интерфейсом игры
// ---------------------------------------------------------------------------

interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

/**
 * Интерфейс игры поверх дерева (PoE масштабирует его по высоте окна): заголовок и кнопки дерева сверху по
 * центру, сферы и панели снизу слева и справа. Ноды под ним не считаем.
 */
export function uiBoxes(c: ClientSize): Box[] {
  const h = c.height
  const w = c.width
  return [
    { x0: w / 2 - 0.31 * h, y0: 0, x1: w / 2 + 0.31 * h, y1: 0.177 * h },
    { x0: 0, y0: h - 0.29 * h, x1: 0.53 * h, y1: h },
    { x0: w - 0.53 * h, y0: h - 0.2 * h, x1: w, y1: h }
  ]
}

function inFrame(x: number, y: number, r: number, c: ClientSize, ui: Box[]): boolean {
  if (x < r + 2 || y < r + 2 || x > c.width - r - 3 || y > c.height - r - 3) return false
  for (const b of ui) if (x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1) return false
  return true
}

/** Ноды около кадра (с запасом на окно поиска) — чтобы не перебирать все 2400 на каждом сдвиге. */
function nearFrame(points: readonly FitPoint[], s: number, ox: number, oy: number, c: ClientSize, pad: number): FitPoint[] {
  const out: FitPoint[] = []
  for (const p of points) {
    const x = p.x * s + ox
    const y = p.y * s + oy
    if (x > -pad && y > -pad && x < c.width + pad && y < c.height + pad) out.push(p)
  }
  return out
}

/** Равномерная выборка (детерминированная): каждая k-я. */
function thin<T>(list: T[], max: number): T[] {
  if (list.length <= max) return list
  const out: T[] = []
  const k = list.length / max
  for (let i = 0; i < max; i++) out.push(list[Math.floor(i * k)])
  return out
}

function score(f: Field, pts: FitPoint[], s: number, ox: number, oy: number, c: ClientSize, ui: Box[], k: typeof RING8, max: number): number {
  let acc = 0
  let n = 0
  for (const p of pts) {
    const x = p.x * s + ox
    const y = p.y * s + oy
    const r = p.r * s
    if (!inFrame(x, y, r, c, ui)) continue
    acc += ring(f, x, y, r, k)
    if (++n >= max) break
  }
  return n >= MIN_INLIERS ? acc / n : -1
}

// ---------------------------------------------------------------------------
// Кандидаты от подсказок
// ---------------------------------------------------------------------------

interface Cand {
  s: number
  ox: number
  oy: number
}

/** Подсказка → положения на соседних зумах (зум вокруг курсора или центра окна — курсор мог сдвинуться). */
export function candidates(priors: readonly TreeView[], c: ClientSize, cursor: Point | null): Cand[] {
  const out: Cand[] = []
  const base = zoomedOutScale(c.height)
  const seen = (x: Cand): boolean =>
    out.some((o) => Math.abs(o.s - x.s) < 1e-6 && Math.abs(o.ox - x.ox) < 20 && Math.abs(o.oy - x.oy) < 20)
  const pivots = [{ x: c.width / 2, y: c.height / 2 }, ...(cursor ? [cursor] : [])]
  for (const p of priors) {
    const z0 = zoomOf(p, c)
    // сначала зум подсказки, потом ±1, ±2 щелчка
    const zs = new Set<number>()
    for (let k = 0; k <= FIT_ZOOM_STEPS; k++)
      for (const d of k ? [-k, k] : [0]) zs.add(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z0 + d * ZOOM_STEP)))
    for (const z of zs) {
      const s = base * z
      const k = s / p.scale
      for (const pv of Math.abs(k - 1) < 1e-9 ? pivots.slice(0, 1) : pivots) {
        // индексы пикселей снимка: сдвиг оверлея − 0,5
        const cand = { s, ox: pv.x - (pv.x - p.ox) * k - 0.5, oy: pv.y - (pv.y - p.oy) * k - 0.5 }
        if (!seen(cand)) out.push(cand)
      }
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Поиск
// ---------------------------------------------------------------------------

/** Размытие грубого прохода по масштабу: кольца крупнее — размываем сильнее (z = 1 → 3, z = 5 → 7 точек). */
const coarseBlur = (s: number, c: ClientSize): number => Math.round(2 + s / zoomedOutScale(c.height))

/** Сетка сдвигов с шагом step; лучшие COARSE_PEAKS максимумов, разнесённые хотя бы на 2 шага. */
function coarse(f: Field, step: number, pts: FitPoint[], c: ClientSize, ui: Box[], cand: Cand): { sc: number; ox: number; oy: number }[] {
  const sub = thin(pts, COARSE_POINTS * 3)
  const all: { sc: number; ox: number; oy: number }[] = []
  for (let dx = -FIT_WINDOW_PX; dx <= FIT_WINDOW_PX; dx += step) {
    for (let dy = -FIT_WINDOW_PX; dy <= FIT_WINDOW_PX; dy += step) {
      const sc = score(f, sub, cand.s, cand.ox + dx, cand.oy + dy, c, ui, RING8, COARSE_POINTS)
      if (sc >= 0) all.push({ sc, ox: cand.ox + dx, oy: cand.oy + dy })
    }
  }
  all.sort((a, b) => b.sc - a.sc)
  const peaks: typeof all = []
  for (const p of all) {
    if (peaks.some((q) => Math.abs(q.ox - p.ox) < 2 * step && Math.abs(q.oy - p.oy) < 2 * step)) continue
    peaks.push(p)
    if (peaks.length >= COARSE_PEAKS) break
  }
  return peaks
}

function climb(f: Field, pts: FitPoint[], c: ClientSize, ui: Box[], s: number, ox: number, oy: number): { sc: number; ox: number; oy: number } {
  let best = { sc: score(f, pts, s, ox, oy, c, ui, RING12, FINE_POINTS), ox, oy }
  for (let step = 4; step >= 0.5; step /= 2) {
    let moved = true
    while (moved) {
      moved = false
      for (const [dx, dy] of [
        [step, 0],
        [-step, 0],
        [0, step],
        [0, -step]
      ]) {
        const sc = score(f, pts, s, best.ox + dx, best.oy + dy, c, ui, RING12, FINE_POINTS)
        if (sc > best.sc) {
          best = { sc, ox: best.ox + dx, oy: best.oy + dy }
          moved = true
        }
      }
    }
  }
  return best
}

interface Match {
  p: FitPoint
  x: number
  y: number
}

/** Каждая нода в кадре — к лучшему кольцу рядом (±REFINE_PX, радиус ×0,8…1,25). */
function refineNodes(g: Field, pts: FitPoint[], c: ClientSize, ui: Box[], v: Cand): Match[] {
  const out: Match[] = []
  for (const p of pts) {
    const cx = p.x * v.s + v.ox
    const cy = p.y * v.s + v.oy
    const r0 = p.r * v.s
    if (!inFrame(cx, cy, r0, c, ui) || r0 < 2.5) continue
    let best = -1
    let bx = cx
    let by = cy
    for (const rk of [0.8, 1, 1.25]) {
      const r = r0 * rk
      for (let dy = -REFINE_PX; dy <= REFINE_PX; dy += 0.5) {
        for (let dx = -REFINE_PX; dx <= REFINE_PX; dx += 0.5) {
          const sc = ring(g, cx + dx, cy + dy, r, RING12)
          if (sc > best) {
            best = sc
            bx = cx + dx
            by = cy + dy
          }
        }
      }
    }
    out.push({ p, x: bx, y: by })
    if (out.length >= FINE_POINTS) break
  }
  return out
}

/** Наименьшие квадраты: экран = s·мир + (ox, oy). */
function lsq(m: Match[]): Cand | null {
  const n = m.length
  if (n < 3) return null
  let sx = 0
  let sy = 0
  let sX = 0
  let sY = 0
  let sww = 0
  let swX = 0
  for (const { p, x, y } of m) {
    sx += p.x
    sy += p.y
    sX += x
    sY += y
    sww += p.x * p.x + p.y * p.y
    swX += p.x * x + p.y * y
  }
  const den = sww - (sx * sx) / n - (sy * sy) / n
  if (!(den > 0)) return null
  const s = (swX - (sX * sx) / n - (sY * sy) / n) / den
  return { s, ox: (sX - s * sx) / n, oy: (sY - s * sy) / n }
}

const resid = (v: Cand, m: Match): number => Math.hypot(m.p.x * v.s + v.ox - m.x, m.p.y * v.s + v.oy - m.y)

function polish(g: Field, pts: FitPoint[], c: ClientSize, ui: Box[], v: Cand): { v: Cand; inliers: number; checked: number } {
  const all = refineNodes(g, pts, c, ui, v)
  let cur = v
  let use = all
  for (let it = 0; it < 5; it++) {
    const fit = lsq(use)
    if (!fit) break
    cur = fit
    const r = use.map((m) => resid(cur, m)).sort((a, b) => a - b)
    const lim = Math.max(INLIER_PX, 2 * r[Math.floor(r.length / 2)])
    use = use.filter((m) => resid(cur, m) <= lim)
  }
  const inliers = all.filter((m) => resid(cur, m) <= INLIER_PX).length
  return { v: cur, inliers, checked: all.length }
}

/** Подгонка по снимку: лучшее найденное и уверенно ли оно (ok: false — остаётся подсказка, игрок совмещает сам). */
export function fitTree(input: FitInput, now: () => number = Date.now): FitResult | null {
  const t0 = now()
  const { img, client, points, priors, cursor } = input
  if (!priors.length || img.width !== Math.round(client.width) || img.height !== Math.round(client.height)) return null
  const g = gradientField(img)
  const fineF = blurField(g, 1)
  const coarseF = new Map<number, Field>()
  const ui = uiBoxes(client)

  const tried: { sc: number; v: Cand; pts: FitPoint[] }[] = []
  for (const cand of candidates(priors, client, cursor)) {
    const pts = nearFrame(points, cand.s, cand.ox, cand.oy, client, FIT_WINDOW_PX + 10)
    if (pts.length < MIN_INLIERS) continue
    const rb = coarseBlur(cand.s, client)
    let cf = coarseF.get(rb)
    if (!cf) coarseF.set(rb, (cf = blurField(g, rb)))
    for (const c1 of coarse(cf, rb + 4, pts, client, ui, cand)) {
      const c2 = climb(fineF, pts, client, ui, cand.s, c1.ox, c1.oy)
      tried.push({ sc: c2.sc, v: { s: cand.s, ox: c2.ox, oy: c2.oy }, pts })
    }
  }
  tried.sort((a, b) => b.sc - a.sc)

  // из лучших по счёту — тот, у кого больше доля нод на своих кольцах (у ложных она в разы меньше)
  let best: { v: Cand; inliers: number; checked: number } | null = null
  const share = (p: { inliers: number; checked: number }): number => (p.inliers >= MIN_INLIERS ? p.inliers / p.checked : 0)
  for (const t of tried.slice(0, 5)) {
    const p = polish(g, t.pts, client, ui, t.v)
    if (!best || share(p) > share(best) || (share(best) === 0 && p.inliers > best.inliers)) best = p
  }
  if (!best) return null
  return {
    ok: best.inliers >= MIN_INLIERS && best.inliers >= MIN_INLIER_SHARE * best.checked,
    view: { scale: best.v.s, ox: best.v.ox + 0.5, oy: best.v.oy + 0.5 },
    inliers: best.inliers,
    checked: best.checked,
    ms: now() - t0
  }
}

/** Ноды основного дерева для подгонки (без восхождений, заглушек кластеров, мастерств и кругов классов). */
export function fitPoints(tree: TreeData): FitPoint[] {
  const out: FitPoint[] = []
  for (const n of tree.nodes.values()) {
    if (n.asc || n.proxy) continue
    const r = n.kind === 'normal' || n.kind === 'notable' || n.kind === 'jewel' || n.kind === 'keystone' ? FIT_RADIUS[n.kind] : 0
    if (!r) continue
    const p = nodePosition(tree, n)
    if (p) out.push({ x: p.x, y: p.y, r })
  }
  return out
}
