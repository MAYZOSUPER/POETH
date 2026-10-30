import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { BUILD_TREE_FILE, nodePosition, parseTreeData } from '@shared/build/data'
import type { TreeData } from '@shared/build/types'
import {
  MAX_SAVED_VIEWS,
  ZOOM_STEP,
  alignAt,
  alignTwo,
  calibrationKey,
  defaultView,
  emptyCalibration,
  isZoomedOut,
  normalizeCalibration,
  panView,
  project,
  rescaleView,
  savedView,
  scaleOk,
  unproject,
  viewToCss,
  wheelView,
  withView,
  zoomOf,
  zoomedOutScale,
  type TreeView
} from '@shared/build/treeOverlay'

// Проекция дерева tree.json на окно игры и калибровка наложения (S38).

const tree = parseTreeData(
  JSON.parse(readFileSync(resolve(__dirname, '../../resources/data/poe1', BUILD_TREE_FILE), 'utf8'))
) as TreeData

const HD = { width: 1920, height: 1080 }
const QHD = { width: 2560, height: 1440 }

const pos = (hash: number) => nodePosition(tree, tree.nodes.get(hash)!)!
const witchStart = pos(tree.classes[3].start!)
const close = (a: { x: number; y: number }, b: { x: number; y: number }, eps = 1e-6) => {
  expect(a.x).toBeCloseTo(b.x, -Math.log10(eps))
  expect(a.y).toBeCloseTo(b.y, -Math.log10(eps))
}

describe('масштаб «отдалено до упора»', () => {
  it('высота окна / 10000 (как Exile-UI): 1080 → 0.108, 1440 → 0.144, 720 → 0.072', () => {
    expect(zoomedOutScale(1080)).toBeCloseTo(0.108, 10)
    expect(zoomedOutScale(1440)).toBeCloseTo(0.144, 10)
    expect(zoomedOutScale(720)).toBeCloseTo(0.072, 10)
  })

  it('пределы масштаба: z от 1 до 5 с запасом 10 %', () => {
    expect(scaleOk(0.108, HD)).toBe(true)
    expect(scaleOk(0.108 * 0.85, HD)).toBe(false)
    expect(scaleOk(0.108 * 5.4, HD)).toBe(true)
    expect(scaleOk(0.108 * 5.6, HD)).toBe(false)
    expect(scaleOk(Number.NaN, HD)).toBe(false)
  })
})

describe('проекция мир ↔ окно', () => {
  const v: TreeView = { scale: 0.144, ox: 1234.5, oy: -321 }

  it('project и unproject обратны', () => {
    for (const p of [{ x: 0, y: 0 }, witchStart, { x: -9000, y: 7000 }]) close(unproject(v, project(v, p)), p)
  })

  it('после входа: круг класса в центре окна, z = 2', () => {
    const d = defaultView(HD, witchStart)
    expect(d.scale).toBeCloseTo(0.216, 10)
    expect(zoomOf(d, HD)).toBeCloseTo(2, 12)
    close(project(d, witchStart), { x: 960, y: 540 })
    expect(isZoomedOut(d, HD)).toBe(false)
  })

  it('отдалено до упора — формула Exile-UI: (мир − круг класса) · h/10000 + курсор', () => {
    const cursor = { x: 700, y: 610 }
    const v1 = alignAt({ scale: zoomedOutScale(QHD.height), ox: 0, oy: 0 }, witchStart, cursor)
    for (const h of [...tree.nodes.keys()].slice(0, 200)) {
      const n = tree.nodes.get(h)!
      if (n.asc) continue
      const p = nodePosition(tree, n)!
      close(project(v1, p), {
        x: (p.x - witchStart.x) * (QHD.height / 10000) + cursor.x,
        y: (p.y - witchStart.y) * (QHD.height / 10000) + cursor.y
      })
    }
  })

  it('калибровка по одной точке: круг класса под курсором, масштаб не меняется', () => {
    const at = { x: 300, y: 200 }
    const a = alignAt(v, witchStart, at)
    expect(a.scale).toBe(v.scale)
    close(project(a, witchStart), at)
  })

  it('по двум точкам: масштаб и сдвиг любого зума', () => {
    const truth: TreeView = { scale: 0.27, ox: 410, oy: -88 }
    const b = pos(tree.classes[0].start!) // Scion — далеко от Witch
    const got = alignTwo(
      { world: witchStart, screen: project(truth, witchStart) },
      { world: b, screen: project(truth, b) },
      HD
    )!
    expect(got.scale).toBeCloseTo(truth.scale, 9)
    expect(got.ox).toBeCloseTo(truth.ox, 6)
    expect(got.oy).toBeCloseTo(truth.oy, 6)
  })

  it('по двум точкам: слишком близко или масштаб вне пределов — null', () => {
    const p = { x: 0, y: 0 }
    expect(alignTwo({ world: p, screen: { x: 0, y: 0 } }, { world: { x: 100, y: 0 }, screen: { x: 50, y: 0 } }, HD)).toBeNull()
    // 3000 точек экрана на 1000 единиц дерева — в 28 раз ближе опорного
    expect(alignTwo({ world: p, screen: { x: 0, y: 0 } }, { world: { x: 1000, y: 0 }, screen: { x: 3000, y: 0 } }, HD)).toBeNull()
  })

  it('панорама: всё дерево сдвигается на дельту курсора', () => {
    const p = panView(v, 37, -12)
    const a = project(v, witchStart)
    const b = project(p, witchStart)
    expect(b.x - a.x).toBeCloseTo(37, 9)
    expect(b.y - a.y).toBeCloseTo(-12, 9)
  })

  it('смена разрешения: зум сохраняется, центр окна смотрит в ту же точку дерева', () => {
    const d = alignAt(defaultView(HD, witchStart), witchStart, { x: 200, y: 900 })
    const r = rescaleView(d, HD, QHD)
    expect(zoomOf(r, QHD)).toBeCloseTo(2, 12)
    close(unproject(r, { x: 1280, y: 720 }), unproject(d, { x: 960, y: 540 }))
  })

  it('в CSS-пиксели оверлея: делим на devicePixelRatio', () => {
    const css = viewToCss({ scale: 0.135, ox: 250, oy: 125 }, 1.25)
    expect(css.scale).toBeCloseTo(0.108, 12)
    expect([css.ox, css.oy]).toEqual([200, 100])
    expect(viewToCss(v, 0)).toEqual(v)
  })
})

// Положения дерева на снимках из игры (S38, 1920×1080, 100 %, PoE1 EN, Scion): подгонка по 13–700 нодам
// tree.json на снимок, координаты — индексы пикселей снимка. Сами снимки в репозиторий не кладём (чат с чужими
// никами) — только эти числа.
const SHOT = {
  /** S38-01: P сразу после входа, дерево не трогали */
  login: { scale: 0.21607, ox: 959.23, oy: 538.29 },
  /** S38-02, 03, 08: отдалено до упора (03 и 08 — потянуто мышью) */
  out: [
    { scale: 0.10798, ox: 955.01, oy: 564.32 },
    { scale: 0.10801, ox: 958.47, oy: 426.05 },
    { scale: 0.10799, ox: 1553.43, oy: 383.44 }
  ],
  /** S38-04…07: от упора +1, +2, +4 щелчка и до упора приближения; курсор неподвижен */
  cursor: { x: 1265, y: 604 },
  wheel: [
    { notches: 1, scale: 0.17553, ox: 768.86, oy: 316.75 },
    { notches: 2, scale: 0.24304, ox: 578.02, oy: 206.47 },
    { notches: 4, scale: 0.37793, ox: 196.25, oy: -13.91 },
    { notches: 99, scale: 0.53983, ox: -261.8, oy: -278.51 }
  ]
}
const scionStart = pos(tree.classes[0].start!)

describe('по снимкам из игры (S38)', () => {
  it('отдалено до упора: высота / 10000 с точностью 0,03 %', () => {
    for (const v of SHOT.out) expect(Math.abs(zoomOf(v, HD) - 1)).toBeLessThan(3e-4)
  })

  it('после входа: z = 2, стартовый круг Scion — в центре окна (±0,5 px)', () => {
    expect(zoomOf(SHOT.login, HD)).toBeCloseTo(2, 2)
    const d = defaultView(HD, scionStart)
    const p = project(SHOT.login, scionStart)
    // пиксель снимка i покрывает [i, i + 1): центр окна 960 — между пикселями 959 и 960
    expect(Math.abs(p.x + 0.5 - 960)).toBeLessThan(0.5)
    expect(Math.abs(p.y + 0.5 - 540)).toBeLessThan(0.5)
    expect(d.scale / SHOT.login.scale).toBeCloseTo(1, 3)
  })

  it('щелчок колеса — +0,625 к z, не множитель: 1 → 1,625 → 2,25 → 3,5; приближено до упора — z = 5', () => {
    const z = SHOT.wheel.map((v) => zoomOf(v, HD))
    expect(z[0]).toBeCloseTo(1 + ZOOM_STEP, 2)
    expect(z[1]).toBeCloseTo(1 + 2 * ZOOM_STEP, 2)
    expect(z[2]).toBeCloseTo(1 + 4 * ZOOM_STEP, 2)
    expect(z[3]).toBeCloseTo(5, 2)
  })

  it('зум вокруг курсора: под курсором одна и та же точка дерева на 04…07', () => {
    const under = SHOT.wheel.map((v) => unproject(v, SHOT.cursor))
    for (const u of under) {
      expect(Math.abs(u.x - under[0].x)).toBeLessThan(3)
      expect(Math.abs(u.y - under[0].y)).toBeLessThan(3)
    }
  })

  it('wheelView от предыдущего снимка повторяет 05, 06, 07 (≤ 0,75 px по всему окну — шум подгонки)', () => {
    for (let i = 1; i < SHOT.wheel.length; i++) {
      const shot = SHOT.wheel[i]
      const v = wheelView(SHOT.wheel[i - 1], HD, SHOT.cursor, -(shot.notches - SHOT.wheel[i - 1].notches))
      for (const p of [scionStart, witchStart, { x: 2844, y: 1642 }, { x: 5000, y: -2000 }]) {
        const a = project(v, p)
        const b = project(shot, p)
        // сравниваем там, где точка на экране
        if (b.x < 0 || b.y < 0 || b.x > HD.width || b.y > HD.height) continue
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(0.75)
      }
    }
  })

  it('пределы зума: дальше упора колесо ничего не меняет', () => {
    const out = SHOT.out[0]
    const base = { scale: zoomedOutScale(HD.height), ox: out.ox, oy: out.oy }
    expect(wheelView(base, HD, SHOT.cursor, 3)).toBe(base)
    const max = wheelView(base, HD, SHOT.cursor, -40)
    expect(zoomOf(max, HD)).toBeCloseTo(5, 12)
    expect(wheelView(max, HD, SHOT.cursor, -1)).toBe(max)
    expect(wheelView(max, HD, SHOT.cursor, 0)).toBe(max)
  })
})

describe('сохранённая калибровка по разрешению окна', () => {
  it('ключ — ширина×высота клиентской области', () => {
    expect(calibrationKey({ width: 2560.4, height: 1440 })).toBe('2560x1440')
  })

  it('сохранить и прочитать', () => {
    const v: TreeView = { scale: 0.144, ox: 100, oy: 200 }
    const cal = withView(emptyCalibration(), QHD, v, 1000)
    expect(savedView(cal, QHD)).toEqual(v)
    expect(savedView(cal, HD)).toBeNull()
  })

  it('мусор с диска отбрасывается', () => {
    const cal = normalizeCalibration({
      v: 1,
      views: {
        '1920x1080': { scale: 0.108, ox: 10, oy: 20, at: 5 },
        '1920x1080x': { scale: 0.108, ox: 0, oy: 0 },
        '50x50': { scale: 0.005, ox: 0, oy: 0 },
        '2560x1440': { scale: 'big', ox: 0, oy: 0 },
        '3840x2160': { scale: 99, ox: 0, oy: 0 },
        '1280x720': { scale: 0.072, ox: 1e9, oy: 0 },
        '1600x900': null
      }
    })
    expect(Object.keys(cal.views)).toEqual(['1920x1080'])
    for (const bad of [null, 'x', [], { views: [] }, { views: 'x' }]) expect(normalizeCalibration(bad)).toEqual(emptyCalibration())
  })

  it('помним последние 16 разрешений', () => {
    let cal = emptyCalibration()
    for (let i = 0; i < 20; i++) cal = withView(cal, { width: 1000 + i, height: 1000 }, { scale: 0.1, ox: 0, oy: 0 }, i)
    expect(Object.keys(cal.views)).toHaveLength(MAX_SAVED_VIEWS)
    expect(cal.views['1019x1000']).toBeDefined()
    expect(cal.views['1000x1000']).toBeUndefined()
  })
})
