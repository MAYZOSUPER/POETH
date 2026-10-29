// Этапы дерева для наложения (S38): из разобранного кода PoB (S35) — только этапы, у которых есть дерево
// (`<Spec>`). Прошлый этап для «взять / снять» — ближайший раньше с другим деревом: у гайдов, где этапы идут
// по наборам камней, у соседних этапов бывает одно и то же дерево. Чистый модуль (main, tests/build/**).

import type { PobBuild } from '../pob/model'
import { currentStage, type PobStagePlan, type StageProgress } from '../pob/stages'

export interface TreeStage {
  /** ключ этапа PoB (`spec:3`…) — для выбора игроком */
  key: string
  title: string
  /** индекс в PobStagePlan.stages; null — этапов нет, дерево из списка Spec */
  planIndex: number | null
  /** индекс в PobBuild.specs */
  spec: number
  classId: number
  nodes: number[]
  /** индекс прошлого этапа с другим деревом; null — первый */
  prev: number | null
  leveling: boolean
}

export interface TreeBuild {
  className: string
  ascendClassName: string | null
  /** версия дерева в коде (`3_29`) */
  treeVersion: string
  stages: TreeStage[]
}

function sameNodes(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false
  const s = new Set(a)
  return b.every((h) => s.has(h))
}

/** Этапы с деревом из билда и плана этапов S35; нет этапов с деревом — все Spec по порядку. */
export function treeBuildFromPob(build: PobBuild, plan: PobStagePlan): TreeBuild {
  const stages: TreeStage[] = []
  plan.stages.forEach((s, i) => {
    if (s.spec === null) return
    const spec = build.specs[s.spec]
    if (!spec) return
    stages.push({
      key: s.key,
      title: s.title,
      planIndex: i,
      spec: s.spec,
      classId: spec.classId,
      nodes: [...spec.nodes],
      prev: null,
      leveling: s.leveling
    })
  })
  if (stages.length === 0)
    build.specs.forEach((spec, i) =>
      stages.push({
        key: `spec:${i}`,
        title: spec.title,
        planIndex: null,
        spec: i,
        classId: spec.classId,
        nodes: [...spec.nodes],
        prev: null,
        leveling: true
      })
    )
  for (let i = 0; i < stages.length; i++) {
    for (let j = i - 1; j >= 0; j--) {
      if (!sameNodes(stages[j].nodes, stages[i].nodes)) {
        stages[i].prev = j
        break
      }
    }
  }
  const active = build.specs[build.activeSpec] ?? build.specs[0]
  return {
    className: build.className,
    ascendClassName: build.ascendClassName,
    treeVersion: active?.treeVersion ?? '',
    stages
  }
}

/** Этап по уровню и акту персонажа (currentStage S35) → индекс в TreeBuild.stages; 0 — если не узнали. */
export function treeStageFor(tree: TreeBuild, plan: PobStagePlan, progress: StageProgress): number {
  if (tree.stages.length === 0) return 0
  const cur = currentStage(plan, progress).index
  if (cur === null) return 0
  // этап без дерева (только камни) — берём последний этап с деревом до него
  let best = 0
  tree.stages.forEach((s, i) => {
    if (s.planIndex !== null && s.planIndex <= cur) best = i
  })
  return best
}
