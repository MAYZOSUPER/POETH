// Рисунок этапа билда для наложения на игровое дерево (S38): какие ноды показать, каким цветом и какие пути
// между ними. Координаты — мировые (tree.json, nodePosition); на экран их переносит TreeView (treeOverlay.ts),
// поэтому при панораме рисунок не пересчитывается. Чистый модуль (main, tests/build/**).
//
// Состояния ноды (как у Exile-UI: зелёные — взять, красные — снять, белые — уже были):
// - take   — взять на этом этапе (нет в прошлом этапе или по журналу ещё не взята);
// - taken  — уже взята (по журналу игры Client.txt);
// - keep   — была в прошлом этапе, журнал о ней не знает (взята раньше, чем журнал начал читаться);
// - remove — снять при переходе: была в прошлом этапе, а в этом её нет;
// - start  — стартовый круг класса: опора калибровки.
// Восхождения в игре — отдельное окно поверх круга класса, их не рисуем; заглушки кластерных самоцветов — тоже.

import { nodePosition, orbitAngle } from './data'
import type { TreeData, TreeNode, TreeNodeKind } from './types'
import type { Point } from './treeOverlay'

export type TreeDrawState = 'take' | 'taken' | 'keep' | 'remove' | 'start'

export interface TreeDrawNode {
  hash: number
  x: number
  y: number
  /** радиус кольца, единицы дерева (чуть больше ноды в игре — нода видна внутри) */
  r: number
  kind: TreeNodeKind
  state: TreeDrawState
  /** подписать имя (нотабли, кейстоуны и гнёзда, которые взять или снять) */
  label: boolean
  en: string
  ru: string
}

export interface TreeDrawEdge {
  a: number
  b: number
  state: Exclude<TreeDrawState, 'start'>
  /** путь SVG в координатах дерева: прямая или дуга по орбите группы */
  d: string
}

export interface TreeDrawing {
  nodes: TreeDrawNode[]
  edges: TreeDrawEdge[]
  /** стартовый круг класса (мир); null — класс не найден в данных дерева */
  anchor: Point | null
  /** ноды этапа, которых нет в данных дерева (другая версия дерева, кластерные самоцветы) */
  missing: number
  counts: { take: number; taken: number; remove: number }
}

export interface StageDrawInput {
  /** classId PoB (0 Scion … 6 Shadow) */
  classId: number
  /** ноды этапа (hash, как `<Spec nodes>`) */
  nodes: readonly number[]
  /** ноды прошлого этапа; null — этап первый */
  prev: readonly number[] | null
  /** что журнал игры знает о нодах персонажа; null — журнал не читается */
  log: TakenNodes | null
}

/** Ноды по журналу Client.txt: последнее, что о ноде писала игра, — «вложена» или «снята». */
export interface TakenNodes {
  taken: ReadonlySet<number>
  removed: ReadonlySet<number>
}

/** Радиусы колец, единицы дерева (нода в игре: обычная ~40, нотабль ~60, кейстоун ~100, круг класса ~200). */
export const RING_RADIUS: Readonly<Record<TreeNodeKind, number>> = {
  normal: 52,
  notable: 78,
  keystone: 120,
  mastery: 100,
  jewel: 78,
  classStart: 230,
  ascStart: 60
}

const round = (v: number): number => Math.round(v * 10) / 10

/** Нода на основном дереве (восхождения и заглушки не рисуем). */
function drawable(n: TreeNode | undefined): n is TreeNode {
  return !!n && n.asc === null && !n.proxy && n.kind !== 'ascStart'
}

/** Путь между нодами: на одной орбите одной группы — дуга по короткой стороне (как в игре), иначе прямая. */
export function edgePath(tree: TreeData, a: TreeNode, b: TreeNode): string | null {
  const pa = nodePosition(tree, a)
  const pb = nodePosition(tree, b)
  if (!pa || !pb) return null
  const r = tree.constants.orbitRadii[a.orbit] ?? 0
  if (a.group === b.group && a.orbit === b.orbit && r > 0) {
    const per = tree.constants.skillsPerOrbit[a.orbit] ?? 0
    const delta = (((orbitAngle(per, b.orbitIndex) - orbitAngle(per, a.orbitIndex)) % 360) + 360) % 360
    // углы растут по часовой стрелке (ось y вниз) — флаг sweep=1 у SVG тоже по часовой
    const sweep = delta <= 180 ? 1 : 0
    return `M${round(pa.x)} ${round(pa.y)}A${r} ${r} 0 0 ${sweep} ${round(pb.x)} ${round(pb.y)}`
  }
  return `M${round(pa.x)} ${round(pa.y)}L${round(pb.x)} ${round(pb.y)}`
}

/** Ноды и пути этапа для наложения. */
export function stageDrawing(tree: TreeData, input: StageDrawInput): TreeDrawing {
  const stage = new Set(input.nodes)
  const prev = new Set(input.prev ?? [])
  const log = input.log

  const stateOf = new Map<number, TreeDrawState>()
  let missing = 0
  for (const h of stage) {
    const n = tree.nodes.get(h)
    if (!n) {
      missing++
      continue
    }
    if (!drawable(n)) continue
    if (n.kind === 'classStart') continue
    if (log?.taken.has(h)) stateOf.set(h, 'taken')
    else if (log?.removed.has(h)) stateOf.set(h, 'take')
    else stateOf.set(h, prev.has(h) ? 'keep' : 'take')
  }
  for (const h of prev) {
    if (stage.has(h)) continue
    const n = tree.nodes.get(h)
    if (!drawable(n) || n.kind === 'classStart') continue
    // журнал знает, что нода уже снята, — снимать нечего
    if (log?.removed.has(h)) continue
    stateOf.set(h, 'remove')
  }

  const cls = tree.classes[input.classId]
  const start = cls?.start != null ? tree.nodes.get(cls.start) : undefined
  const startPos = start ? nodePosition(tree, start) : null

  const nodes: TreeDrawNode[] = []
  const counts = { take: 0, taken: 0, remove: 0 }
  if (start && startPos) {
    nodes.push({
      hash: start.hash,
      x: round(startPos.x),
      y: round(startPos.y),
      r: RING_RADIUS.classStart,
      kind: start.kind,
      state: 'start',
      label: false,
      en: start.en,
      ru: start.ru
    })
  }
  for (const [h, state] of stateOf) {
    const n = tree.nodes.get(h) as TreeNode
    const p = nodePosition(tree, n)
    if (!p) continue
    if (state === 'take' || state === 'taken' || state === 'remove') counts[state]++
    const big = n.kind === 'notable' || n.kind === 'keystone' || n.kind === 'jewel'
    nodes.push({
      hash: h,
      x: round(p.x),
      y: round(p.y),
      r: RING_RADIUS[n.kind],
      kind: n.kind,
      state,
      label: big && (state === 'take' || state === 'remove'),
      en: n.en,
      ru: n.ru
    })
  }

  const edges: TreeDrawEdge[] = []
  for (const [h, sa] of stateOf) {
    const a = tree.nodes.get(h) as TreeNode
    if (a.kind === 'mastery') continue
    for (const o of a.links) {
      // каждое ребро — один раз, от меньшего hash
      if (o <= h) continue
      const sb = stateOf.get(o)
      if (!sb) continue
      const b = tree.nodes.get(o) as TreeNode
      if (b.kind === 'mastery') continue
      const d = edgePath(tree, a, b)
      if (!d) continue
      edges.push({ a: h, b: o, state: edgeState(sa, sb), d })
    }
  }
  // снизу вверх: снять → были → взяты → взять (новое — поверх)
  const order: Record<TreeDrawState, number> = { remove: 0, keep: 1, taken: 2, take: 3, start: -1 }
  edges.sort((x, y) => order[x.state] - order[y.state])
  nodes.sort((x, y) => order[x.state] - order[y.state])
  return { nodes, edges, anchor: startPos, missing, counts }
}

function edgeState(a: TreeDrawState, b: TreeDrawState): TreeDrawEdge['state'] {
  if (a === 'remove' || b === 'remove') return 'remove'
  if (a === 'take' || b === 'take') return 'take'
  if (a === 'taken' && b === 'taken') return 'taken'
  return 'keep'
}

// ---------------------------------------------------------------------------
// На экране: размер кольца и подписи нотаблей (renderer оверлея; координаты — CSS-пиксели)
// ---------------------------------------------------------------------------

/** Кольцо ноды на экране не меньше этого (CSS-пиксели) — при сильном отдалении ноды игры мельче. */
export const MIN_RING_PX = 5

/** Радиус кольца в единицах дерева при масштабе scale (CSS-пикселей на единицу). */
export function ringRadius(n: Pick<TreeDrawNode, 'r'>, scale: number): number {
  return Math.max(n.r, MIN_RING_PX / scale)
}

export interface LabelBox {
  hash: number
  text: string
  state: TreeDrawState
  x: number
  y: number
  anchor: 'start' | 'end'
}

/** Ширина подписи на глаз (шрифт --fs-sm): точная не нужна — только чтобы соседние подписи не налезали. */
export const LABEL_CHAR_PX = 7
export const LABEL_LINE_PX = 15

/** Подписи нотаблей: справа от кольца, при наложении на соседнюю — слева, ниже или выше (жадно, по порядку). */
export function layoutLabels(
  nodes: readonly TreeDrawNode[],
  view: { scale: number; ox: number; oy: number },
  lang: string
): LabelBox[] {
  const placed: { l: number; t: number; r: number; b: number }[] = []
  const out: LabelBox[] = []
  for (const n of nodes) {
    const text = lang === 'ru' ? n.ru : n.en
    const cx = n.x * view.scale + view.ox
    const cy = n.y * view.scale + view.oy
    const rr = ringRadius(n, view.scale) * view.scale + 4
    const w = text.length * LABEL_CHAR_PX
    const tries: [number, number, 'start' | 'end'][] = [
      [cx + rr, cy, 'start'],
      [cx - rr, cy, 'end'],
      [cx + rr, cy + LABEL_LINE_PX, 'start'],
      [cx + rr, cy - LABEL_LINE_PX, 'start'],
      [cx - rr, cy + LABEL_LINE_PX, 'end'],
      [cx - rr, cy - LABEL_LINE_PX, 'end']
    ]
    const box = ([x, y, a]: (typeof tries)[number]) => ({
      l: a === 'start' ? x : x - w,
      r: a === 'start' ? x + w : x,
      t: y - LABEL_LINE_PX / 2,
      b: y + LABEL_LINE_PX / 2
    })
    const free = tries.find((c) => {
      const b = box(c)
      return !placed.some((p) => b.l < p.r && b.r > p.l && b.t < p.b && b.b > p.t)
    })
    const [x, y, anchor] = free ?? tries[0]
    placed.push(box([x, y, anchor]))
    out.push({ hash: n.hash, text, state: n.state, x, y, anchor })
  }
  return out
}
