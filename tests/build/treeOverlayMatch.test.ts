import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { BUILD_TREE_FILE, parseTreeData } from '@shared/build/data'
import type { TreeData } from '@shared/build/types'
import { ZOOM_STEP, project, unproject, wheelView, zoomOf, zoomedOutScale, type TreeView } from '@shared/build/treeOverlay'
import { blurField, candidates, fitPoints, fitTree, gradientField, uiBoxes, type FitPoint } from '@shared/build/treeOverlayMatch'
import type { Bitmap } from '@shared/ocr/bitmap'

// Автоподгонка наложения по снимку (S38). Снимки из игры в репозиторий не кладём (там чат с чужими никами) —
// здесь картинки, нарисованные по tree.json: кольца нод в известном положении, лишние кольца и «интерфейс»
// поверх. На снимках из игры подгонка проверена отдельно (отчёт S38: 105 принятых из 119, неверных 0).

const tree = parseTreeData(
  JSON.parse(readFileSync(resolve(__dirname, '../../resources/data/poe1', BUILD_TREE_FILE), 'utf8'))
) as TreeData
const points = fitPoints(tree)
const HD = { width: 1920, height: 1080 }

let seed = 1
const rnd = (): number => (seed = (seed * 16807) % 2147483647) / 2147483647

/** Кольца нод (и лишние кольца-помехи) на тёмном фоне; область интерфейса — пёстрая. */
function render(view: TreeView, extra = 250): Bitmap {
  const { width: w, height: h } = HD
  const g = new Float32Array(w * h).fill(18)
  const ringAt = (cx: number, cy: number, r: number, v: number): void => {
    const x0 = Math.max(0, Math.floor(cx - r - 2))
    const x1 = Math.min(w - 1, Math.ceil(cx + r + 2))
    const y0 = Math.max(0, Math.floor(cy - r - 2))
    const y1 = Math.min(h - 1, Math.ceil(cy + r + 2))
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const k = Math.max(0, 1 - Math.abs(Math.hypot(x - cx, y - cy) - r) / 1.2)
        if (k > 0) g[y * w + x] = Math.max(g[y * w + x], 18 + v * k)
      }
  }
  for (const p of points) {
    const s = project(view, p)
    // пиксель i покрывает [i, i + 1): центр кольца в индексах — минус 0,5
    if (s.x > -40 && s.y > -40 && s.x < w + 40 && s.y < h + 40) ringAt(s.x - 0.5, s.y - 0.5, p.r * view.scale, 190)
  }
  for (let i = 0; i < extra; i++) ringAt(rnd() * w, rnd() * h, 3 + rnd() * 20, 120 + rnd() * 80)
  for (const b of uiBoxes(HD))
    for (let y = Math.max(0, Math.floor(b.y0)); y < Math.min(h, b.y1); y++)
      for (let x = Math.max(0, Math.floor(b.x0)); x < Math.min(w, b.x1); x++) g[y * w + x] = (x * 7 + y * 13) % 255
  const data = new Uint8Array(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    const v = Math.min(255, Math.round(g[i] + rnd() * 6))
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v
    data[i * 4 + 3] = 255
  }
  return { width: w, height: h, data }
}

/** Наибольшая ошибка по углам и центру окна, точки. */
function err(a: TreeView, b: TreeView): number {
  let m = 0
  for (const p of [{ x: 0, y: 0 }, { x: 1920, y: 0 }, { x: 0, y: 1080 }, { x: 1920, y: 1080 }, { x: 960, y: 540 }]) {
    const q = project(b, unproject(a, p))
    m = Math.max(m, Math.hypot(q.x - p.x, q.y - p.y))
  }
  return m
}

describe('поле и кадр', () => {
  it('градиент: ступенька яркости — пик на границе, ровное поле — ноль', () => {
    const w = 8
    const h = 6
    const data = new Uint8Array(w * h * 4)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.fill(x >= 4 ? 200 : 0, (y * w + x) * 4, (y * w + x) * 4 + 3)
    const g = gradientField({ width: w, height: h, data })
    expect(g.d[2 * w + 1]).toBe(0)
    expect(g.d[2 * w + 3]).toBeGreaterThan(0)
    expect(g.d[2 * w + 4]).toBeGreaterThan(0)
    expect(g.d[2 * w + 6]).toBe(0)
  })

  it('размытие сохраняет среднее и сглаживает пик', () => {
    const d = new Float32Array(21 * 21)
    d[10 * 21 + 10] = 441
    const b = blurField({ w: 21, h: 21, d }, 2)
    const sum = b.d.reduce((a, v) => a + v, 0)
    expect(sum).toBeCloseTo(441, 2)
    expect(b.d[10 * 21 + 10]).toBeLessThan(441 / 10)
  })

  it('интерфейс игры масштабируется по высоте окна: кнопки дерева — сверху по центру', () => {
    const [top] = uiBoxes(HD)
    expect((top.x0 + top.x1) / 2).toBe(960)
    expect(top.y1).toBeCloseTo(191, 0)
    const [top2] = uiBoxes({ width: 2560, height: 1440 })
    expect(top2.y1 / top.y1).toBeCloseTo(1440 / 1080, 6)
  })

  it('ноды для подгонки — только основное дерево с известным радиусом рамки', () => {
    expect(points.length).toBeGreaterThan(2000)
    expect(points.every((p: FitPoint) => p.r > 0 && Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true)
    const asc = [...tree.nodes.values()].filter((n) => n.asc).length
    expect(points.length).toBeLessThan(tree.nodes.size - asc)
  })
})

describe('кандидаты от подсказки', () => {
  it('±2 щелчка колеса (в пределах 1…5), зум вокруг центра окна и курсора', () => {
    const prior: TreeView = { scale: zoomedOutScale(1080) * 2, ox: 900, oy: 500 }
    const c = candidates([prior], HD, { x: 1265, y: 604 })
    const zs = [...new Set(c.map((v) => Math.round((v.s / zoomedOutScale(1080)) * 1000) / 1000))].sort()
    expect(zs).toEqual([1, 1.375, 2, 2.625, 3.25])
    // сама подсказка — без сдвига, в индексах пикселей снимка (−0,5)
    expect(c[0]).toEqual({ s: prior.scale, ox: 899.5, oy: 499.5 })
    // тот же зум — один кандидат, другие — по два центра зума
    expect(c).toHaveLength(1 + 4 * 2)
  })
})

describe('подгонка по картинке', () => {
  const base = zoomedOutScale(1080)
  const truth: TreeView = { scale: base * 2.625, ox: 731.25, oy: 377.75 }
  const img = render(truth)

  it('подсказка сдвинута на ~100 точек и ошиблась на щелчок колеса — находит точно (≤ 0,5 точки)', () => {
    const cursor = { x: 1100, y: 640 }
    const off = wheelView(truth, HD, cursor, 1)
    const prior = { ...off, ox: off.ox + 70, oy: off.oy - 85 }
    expect(zoomOf(prior, HD)).toBeCloseTo(2.625 - ZOOM_STEP, 9)
    const r = fitTree({ img, client: HD, points, priors: [prior], cursor })!
    expect(r.ok).toBe(true)
    expect(err(truth, r.view)).toBeLessThan(0.5)
    expect(r.inliers / r.checked).toBeGreaterThan(0.5)
  })

  it('подсказка далеко (600 точек) — не уверен, наложение не двигаем', () => {
    const prior = { ...truth, ox: truth.ox + 600, oy: truth.oy + 380 }
    const r = fitTree({ img, client: HD, points, priors: [prior], cursor: null })
    expect(r === null || !r.ok).toBe(true)
  })

  it('снимок не того размера или без подсказок — null', () => {
    expect(fitTree({ img, client: { width: 1600, height: 900 }, points, priors: [truth], cursor: null })).toBeNull()
    expect(fitTree({ img, client: HD, points, priors: [], cursor: null })).toBeNull()
  })
})
