import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { inflateNode } from '@shared/advisor/codecNode'
import { BUILD_TREE_FILE, nodePosition, parseTreeData } from '@shared/build/data'
import type { TreeData, TreeNode } from '@shared/build/types'
import {
  LABEL_LINE_PX,
  MIN_RING_PX,
  RING_RADIUS,
  edgePath,
  layoutLabels,
  ringRadius,
  stageDrawing,
  type TreeDrawNode,
  type TreeDrawing
} from '@shared/build/treeOverlayDraw'
import { BuildTakenTracker } from '@shared/build/takenLog'
import { takenHashes } from '@shared/build/treeOverlayLog'
import { treeBuildFromPob, treeStageFor } from '@shared/build/treeOverlayStages'
import { importPobCode } from '@shared/pob/import'
import { fixtureCode } from '../pob/fixtures'

// Рисунок этапа для наложения (взять / взято / снять, пути и дуги), этапы из кода PoB и «взято» по журналу (S38).

const tree = parseTreeData(
  JSON.parse(readFileSync(resolve(__dirname, '../../resources/data/poe1', BUILD_TREE_FILE), 'utf8'))
) as TreeData

const WITCH = 3
const witchStart = tree.nodes.get(tree.classes[WITCH].start!)!

/** Путь от круга класса: n нод в ширину по соседям основного дерева. */
function pathFrom(start: TreeNode, n: number): number[] {
  const out: number[] = []
  const seen = new Set([start.hash])
  let frontier = [start.hash]
  while (out.length < n && frontier.length) {
    const next: number[] = []
    for (const h of frontier)
      for (const o of tree.nodes.get(h)!.links) {
        const m = tree.nodes.get(o)!
        if (seen.has(o) || m.asc || m.kind === 'mastery' || m.kind === 'classStart') continue
        seen.add(o)
        if (out.length < n) out.push(o)
        next.push(o)
      }
    frontier = next
  }
  return out
}

const byHash = (d: TreeDrawing, h: number) => d.nodes.find((n) => n.hash === h)

describe('stageDrawing: состояния нод', () => {
  const path = pathFrom(witchStart, 12)
  const prev = path.slice(0, 8)
  const stage = path.slice(0, 6).concat(path.slice(8, 12))

  it('без журнала: новые — взять, общие — были, только в прошлом — снять; круг класса — опора', () => {
    const d = stageDrawing(tree, { classId: WITCH, nodes: stage, prev, log: null })
    for (const h of path.slice(0, 6)) expect(byHash(d, h)?.state).toBe('keep')
    for (const h of path.slice(8, 12)) expect(byHash(d, h)?.state).toBe('take')
    for (const h of path.slice(6, 8)) expect(byHash(d, h)?.state).toBe('remove')
    expect(byHash(d, witchStart.hash)).toMatchObject({ state: 'start', r: RING_RADIUS.classStart })
    expect(d.anchor).toEqual(nodePosition(tree, witchStart))
    expect(d.counts).toEqual({ take: 4, taken: 0, remove: 2 })
  })

  it('первый этап: всё — взять', () => {
    const d = stageDrawing(tree, { classId: WITCH, nodes: prev, prev: null, log: null })
    expect(d.nodes.filter((n) => n.state !== 'start').every((n) => n.state === 'take')).toBe(true)
  })

  it('с журналом: вложенные — взято; снятые журналом — снова взять, и снимать их уже не нужно', () => {
    const log = { taken: new Set([path[0], path[9]]), removed: new Set([path[1], path[6]]) }
    const d = stageDrawing(tree, { classId: WITCH, nodes: stage, prev, log })
    expect(byHash(d, path[0])?.state).toBe('taken')
    expect(byHash(d, path[9])?.state).toBe('taken')
    expect(byHash(d, path[1])?.state).toBe('take')
    expect(byHash(d, path[2])?.state).toBe('keep')
    expect(byHash(d, path[6])).toBeUndefined()
    expect(byHash(d, path[7])?.state).toBe('remove')
  })

  it('восхождения и неизвестные hash не рисуются; неизвестные считаются', () => {
    const asc = [...tree.nodes.values()].find((n) => n.asc === 'Necromancer' && n.kind === 'notable')!
    const d = stageDrawing(tree, { classId: WITCH, nodes: [path[0], asc.hash, 99_999_999], prev: null, log: null })
    expect(byHash(d, asc.hash)).toBeUndefined()
    expect(d.missing).toBe(1)
  })

  it('подписи — у нотаблей и кейстоунов, которые взять или снять', () => {
    const notable = [...tree.nodes.values()].find((n) => !n.asc && n.kind === 'notable')!
    const small = path.find((h) => tree.nodes.get(h)!.kind === 'normal')!
    const d = stageDrawing(tree, { classId: WITCH, nodes: [notable.hash, small], prev: null, log: null })
    expect(byHash(d, notable.hash)).toMatchObject({ label: true, en: notable.en, ru: notable.ru })
    expect(byHash(d, small)?.label).toBe(false)
  })
})

describe('stageDrawing: пути', () => {
  it('рёбра — только между нарисованными нодами, по одному; к кругу класса линий нет', () => {
    const path = pathFrom(witchStart, 10)
    const d = stageDrawing(tree, { classId: WITCH, nodes: path, prev: null, log: null })
    const drawn = new Set(d.nodes.map((n) => n.hash))
    const keys = new Set<string>()
    for (const e of d.edges) {
      expect(drawn.has(e.a) && drawn.has(e.b)).toBe(true)
      expect(e.a).toBeLessThan(e.b)
      expect(tree.nodes.get(e.a)!.links).toContain(e.b)
      expect(e.a === witchStart.hash || e.b === witchStart.hash).toBe(false)
      keys.add(`${e.a}-${e.b}`)
    }
    expect(keys.size).toBe(d.edges.length)
    expect(d.edges.length).toBeGreaterThan(0)
  })

  it('ребро к снимаемой ноде — «снять»', () => {
    const path = pathFrom(witchStart, 10)
    const d = stageDrawing(tree, { classId: WITCH, nodes: path.slice(0, 5), prev: path, log: null })
    for (const e of d.edges) {
      const removed = !path.slice(0, 5).includes(e.a) || !path.slice(0, 5).includes(e.b)
      if (removed) expect(e.state).toBe('remove')
    }
  })

  it('одна орбита одной группы — дуга по короткой стороне, иначе прямая', () => {
    // соседи на одной орбите одной группы
    let pair: [TreeNode, TreeNode] | null = null
    for (const n of tree.nodes.values()) {
      if (n.asc || n.orbit === 0) continue
      const m = n.links.map((o) => tree.nodes.get(o)!).find((o) => o.group === n.group && o.orbit === n.orbit)
      if (m) {
        pair = [n, m]
        break
      }
    }
    const [a, b] = pair!
    const r = tree.constants.orbitRadii[a.orbit]
    const ab = edgePath(tree, a, b)!
    const ba = edgePath(tree, b, a)!
    expect(ab).toMatch(new RegExp(`A${r} ${r} 0 0 [01] `))
    // в обратную сторону — та же дуга, другой флаг направления
    expect(ab.split(' 0 0 ')[1][0]).not.toBe(ba.split(' 0 0 ')[1][0])

    const other = a.links.map((o) => tree.nodes.get(o)!).find((o) => o.group !== a.group)
    if (other) expect(edgePath(tree, a, other)).toMatch(/^M[-\d.]+ [-\d.]+L[-\d.]+ [-\d.]+$/)
  })
})

describe('этапы дерева из кода PoB', () => {
  const res = importPobCode(fixtureCode('pobbin-acts-all-axes'), inflateNode)
  if (!res.ok) throw new Error(res.error)
  const tb = treeBuildFromPob(res.build, res.stages)

  it('«Act 1»…«Act 10»: этап — дерево, прошлый этап — предыдущий с другим деревом', () => {
    expect(tb.stages.length).toBeGreaterThanOrEqual(10)
    expect(tb.stages[0].prev).toBeNull()
    for (let i = 1; i < tb.stages.length; i++) expect(tb.stages[i].prev).not.toBeNull()
    expect(tb.stages[0].title).toMatch(/Act 1/)
    // ноды этапа есть в дереве 3.29 (почти все: дерево билда 3.26)
    for (const s of tb.stages) {
      const d = stageDrawing(tree, { classId: s.classId, nodes: s.nodes, prev: null, log: null })
      expect(d.missing).toBeLessThanOrEqual(Math.ceil(s.nodes.length * 0.1))
      expect(d.anchor).not.toBeNull()
    }
  })

  it('этап по уровню персонажа: 1 уровень — первый, 70 — не первый', () => {
    expect(treeStageFor(tb, res.stages, { level: 1 })).toBe(0)
    expect(treeStageFor(tb, res.stages, { level: 70, campaignDone: true })).toBeGreaterThan(0)
  })

  it('нет этапов с деревом — все Spec по порядку', () => {
    const plain = treeBuildFromPob(res.build, { primary: 'none', stages: [] })
    expect(plain.stages).toHaveLength(res.build.specs.length)
    expect(plain.stages[0].key).toBe('spec:0')
  })
})

describe('«взято» по журналу', () => {
  // подсчёт общий с вкладкой «Билд» (BuildTakenTracker, S39); здесь — перевод id → hash и персонаж для этапа
  const L = (time: string, text: string) => `2026/10/30 ${time} 68950031 cffb0658 [INFO Client 19012] ${text}`
  const login = L('10:00:00', 'Async connecting to fra.login.pathofexile.com:20488')
  const level = (name: string, n: number, cls = 'Witch') => L('10:00:05', `: ${name} (${cls}) is now level ${n}`)
  const alloc = (id: string, on = true) => L('10:00:06', `Successfully ${on ? 'allocated' : 'unallocated'} passive skill id: ${id}, name: x`)
  const path = pathFrom(witchStart, 4).map((h) => tree.nodes.get(h)!)
  const hashes = (t: BuildTakenTracker) => takenHashes(tree, t.snapshot(true))

  it('вложение и снятие — в hash нод персонажа текущего входа', () => {
    const t = new BuildTakenTracker()
    expect(hashes(t)).toBeNull()
    t.ingest([login, level('Alice', 2), alloc(path[0].id), alloc(path[1].id), alloc(path[1].id, false)])
    expect(t.character()).toEqual({ name: 'Alice', className: 'Witch', level: 2 })
    const n = hashes(t)!
    expect([...n.taken]).toEqual([path[0].hash])
    expect([...n.removed]).toEqual([path[1].hash])
  })

  it('журнал группы: чужое «is now level» не уводит ни «взято», ни уровень к другому игроку', () => {
    const t = new BuildTakenTracker()
    t.ingest([login, level('Моя', 5), level('Чужой', 30, 'Marauder'), alloc(path[0].id)])
    expect(t.character()).toEqual({ name: 'Моя', className: 'Witch', level: 5 })
    expect([...hashes(t)!.taken]).toEqual([path[0].hash])
    t.ingest([level('Моя', 6), level('Чужой', 31, 'Marauder'), alloc(path[1].id)])
    expect(t.character()?.level).toBe(6)
    expect([...hashes(t)!.taken]).toEqual([path[0].hash, path[1].hash])
    // вход другим персонажем — у него свои ноды, у первого всё на месте
    t.ingest([login, level('Вторая', 9), alloc(path[2].id)])
    expect([...hashes(t)!.taken]).toEqual([path[2].hash])
    t.ingest([login, level('Моя', 7)])
    expect([...hashes(t)!.taken]).toEqual([path[0].hash, path[1].hash])
  })

  it('до первого повышения после входа — копим и отдаём этому персонажу', () => {
    const t = new BuildTakenTracker()
    t.ingest([login, alloc(path[2].id)])
    expect(t.character()).toBeNull()
    expect([...hashes(t)!.taken]).toEqual([path[2].hash])
    t.ingest([level('Bob', 5)])
    expect([...hashes(t)!.taken]).toEqual([path[2].hash])
  })

  it('атлас и id не из этих данных дерева не считаются', () => {
    const t = new BuildTakenTracker()
    t.ingest([login, level('Bob', 9), alloc('atlas_path_39'), alloc('no_such_node')])
    expect(t.snapshot(true).taken).toEqual(['no_such_node'])
    expect(hashes(t)).toBeNull()
    expect(takenHashes(tree, null)).toBeNull()
  })
})

describe('на экране: кольца и подписи', () => {
  const node = (hash: number, x: number, y: number, en: string): TreeDrawNode => ({
    hash,
    x,
    y,
    r: RING_RADIUS.notable,
    kind: 'notable',
    state: 'take',
    label: true,
    en,
    ru: en
  })

  it('кольцо не меньше 5 CSS-пикселей при сильном отдалении', () => {
    expect(ringRadius({ r: 78 }, 0.2)).toBe(78)
    expect(ringRadius({ r: 78 }, 0.03) * 0.03).toBeCloseTo(MIN_RING_PX, 9)
  })

  it('соседние нотабли (стенд: «Повелитель арены» и «Мастерство гладиатора») — подписи не налезают', () => {
    const view = { scale: 0.072, ox: 0, oy: 0 }
    // в 40 единицах дерева друг от друга: на экране — 3 точки
    const boxes = layoutLabels([node(1, 1000, 1000, 'Повелитель арены'), node(2, 1040, 1000, 'Мастерство гладиатора')], view, 'ru')
    const [a, b] = boxes
    const w = (t: string) => t.length * 7
    const span = (l: (typeof boxes)[number]) => (l.anchor === 'start' ? [l.x, l.x + w(l.text)] : [l.x - w(l.text), l.x])
    const [al, ar] = span(a)
    const [bl, br] = span(b)
    const overlapX = al < br && ar > bl
    const overlapY = Math.abs(a.y - b.y) < LABEL_LINE_PX
    expect(overlapX && overlapY).toBe(false)
  })

  it('далёкие нотабли — подпись справа от кольца, по центру', () => {
    const view = { scale: 0.1, ox: 10, oy: 20 }
    const [a] = layoutLabels([node(1, 0, 0, 'A')], view, 'en')
    expect(a).toMatchObject({ anchor: 'start', y: 20 })
    expect(a.x).toBeCloseTo(10 + RING_RADIUS.notable * 0.1 + 4, 9)
  })
})
