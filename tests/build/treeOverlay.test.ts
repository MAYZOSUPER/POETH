import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { BUILD_TREE_FILE, nodePosition, parseTreeData } from '@shared/build/data'
import type { TreeData } from '@shared/build/types'
import {
  MAX_SAVED_VIEWS,
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
  withView,
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

  it('пределы масштаба: от половины до 12 раз опорного', () => {
    expect(scaleOk(0.108, HD)).toBe(true)
    expect(scaleOk(0.05, HD)).toBe(false)
    expect(scaleOk(0.108 * 12, HD)).toBe(true)
    expect(scaleOk(0.108 * 13, HD)).toBe(false)
    expect(scaleOk(Number.NaN, HD)).toBe(false)
  })
})

describe('проекция мир ↔ окно', () => {
  const v: TreeView = { scale: 0.144, ox: 1234.5, oy: -321 }

  it('project и unproject обратны', () => {
    for (const p of [{ x: 0, y: 0 }, witchStart, { x: -9000, y: 7000 }]) close(unproject(v, project(v, p)), p)
  })

  it('после входа: круг класса в центре окна, масштаб — до упора', () => {
    const d = defaultView(HD, witchStart)
    expect(d.scale).toBeCloseTo(0.108, 10)
    close(project(d, witchStart), { x: 960, y: 540 })
    expect(isZoomedOut(d, HD)).toBe(true)
  })

  it('совпадает с формулой Exile-UI: (мир − круг класса) · h/10000 + курсор', () => {
    const cursor = { x: 700, y: 610 }
    const v1 = alignAt(defaultView(QHD, witchStart), witchStart, cursor)
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

  it('смена разрешения: отдаление сохраняется, центр окна смотрит в ту же точку дерева', () => {
    const d = alignAt(defaultView(HD, witchStart), witchStart, { x: 200, y: 900 })
    const r = rescaleView(d, HD, QHD)
    expect(isZoomedOut(r, QHD)).toBe(true)
    close(unproject(r, { x: 1280, y: 720 }), unproject(d, { x: 960, y: 540 }))
  })

  it('в CSS-пиксели оверлея: делим на devicePixelRatio', () => {
    const css = viewToCss({ scale: 0.135, ox: 250, oy: 125 }, 1.25)
    expect(css.scale).toBeCloseTo(0.108, 12)
    expect([css.ox, css.oy]).toEqual([200, 100])
    expect(viewToCss(v, 0)).toEqual(v)
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
