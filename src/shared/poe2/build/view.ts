// Что показывает экран «Билд» PoE 2 (S66): сводка билда и предпросмотр этапов — до записи файла `.build`
// (чистый модуль, tests/build2/view.test.ts). Считается в main (там разбор и данные), окну приходят только
// строки и числа.

import type { Pob2Build } from '../../pob/poe2'
import type { Pob2Source } from '../../pob/import'
import { NODE_FLAG, findAscendancy, findGem, type Poe2GemData, type Poe2TreeData } from './data'
import { buildAscendancy, defaultBuildName, itemHead, mainSkill, nodeOrder, toGameBuild, POB2_INVENTORY, type GameBuildReport } from './gameBuild'
import { buildInstill, type InstillData } from './instill'
import type { Poe2StageKind, Poe2StagePlan } from './stages'

export interface Build2GemView {
  en: string
  /** '' — RU-имени нет в данных */
  ru: string
  /** поддержек в связке */
  supports: number
  /** главное умение билда */
  main: boolean
}

export interface Build2NodeView {
  en: string
  ru: string
  keystone: boolean
}

export interface Build2StageView {
  /** название этапа у автора; '' — «весь билд» */
  title: string
  kind: Poe2StageKind
  from: number
  to: number
  /** нод на дереве этапа (без стартовых) */
  points: number
  /** новых нод относительно прошлого этапа */
  added: number
  /** новые нотаблы и кейстоуны этапа (до 8) */
  key: Build2NodeView[]
  /** камни умений этапа */
  skills: Build2GemView[]
  /** слотов экипировки с подсказкой */
  items: number
}

export interface Build2Summary {
  id: string
  className: string
  ascendancy: { id: string; en: string; ru: string } | null
  level: number
  source: Pob2Source
  importedAt: number
  /** название по умолчанию: «Восхождение — главное умение» */
  defaultName: { ru: string; en: string }
  primary: Poe2StagePlan['primary']
  stages: Build2StageView[]
  /** что попадёт в файл и что пропущено (мета-камни, умения предметов, ноды другой версии дерева) */
  report: GameBuildReport
  /** вложение с амулета автора; null — нет */
  instill: { hash: number | null; name: string } | null
  /** версия дерева PoB2 (`0_5`) и данных приложения (`0.5.5`) — расходятся: предупредить */
  treeVersion: { pob: string; data: string }
}

const START = NODE_FLAG.classStart | NODE_FLAG.ascStart
const KEY = NODE_FLAG.notable | NODE_FLAG.keystone

/** Сводка билда для экрана: этапы, камни, ключевые ноды, отчёт экспорта. */
export function build2Summary(
  stored: { id: string; source: Pob2Source; importedAt: number },
  build: Pob2Build,
  plan: Poe2StagePlan,
  tree: Poe2TreeData,
  gems: Poe2GemData,
  instill?: InstillData | null
): Build2Summary {
  const ascId = buildAscendancy(build, tree)
  const asc = findAscendancy(tree, ascId)
  const main = mainSkill(build, gems)
  let prev = new Set<number>()
  const stages: Build2StageView[] = plan.stages.map((st) => {
    const spec = st.spec === null ? undefined : build.specs[st.spec]
    const nodes = spec ? nodeOrder(spec, tree).filter((h) => !((tree.nodes.get(h)?.flags ?? 0) & START)) : []
    const added = nodes.filter((h) => !prev.has(h))
    prev = new Set(nodes)
    const key: Build2NodeView[] = []
    for (const h of added) {
      const n = tree.nodes.get(h)
      if (!n || !(n.flags & KEY) || !n.name || n.ascendancy) continue
      if (key.length >= 8) break
      key.push({ en: n.name, ru: instill?.notables.get(h)?.ru ?? '', keystone: !!(n.flags & NODE_FLAG.keystone) })
    }
    const set = st.skills === null ? undefined : build.skillSets[st.skills]
    const skills: Build2GemView[] = []
    for (const g of set?.groups ?? []) {
      if (!g.enabled || g.source) continue
      const found = g.gems.filter((x) => x.enabled).map((x) => findGem(gems, x.gemId))
      const skill = found.find((x) => x?.kind === 'skill')
      if (!skill || skills.some((s) => s.en === skill.en)) continue
      skills.push({ en: skill.en, ru: skill.ru, supports: found.filter((x) => x?.kind === 'support').length, main: !!main && main.id === skill.id })
    }
    const iset = st.items === null ? undefined : build.itemSets[st.items]
    let items = 0
    for (const slot of Object.keys(POB2_INVENTORY)) {
      const id = iset?.slots[slot as keyof typeof iset.slots]
      const item = id ? build.items.find((x) => x.id === id) : undefined
      if (item && itemHead(item)) items++
    }
    return { title: st.title, kind: st.kind, from: st.from, to: st.to, points: nodes.length, added: added.length, key, skills, items }
  })
  const { report } = toGameBuild(build, plan, tree, gems, { name: 'x', lang: 'en' })
  const bi = instill ? buildInstill(build, plan, instill) : null
  const spec = build.specs[build.activeSpec] ?? build.specs[0]
  return {
    id: stored.id,
    className: build.className,
    ascendancy: asc ? { id: asc.id, en: asc.en, ru: asc.ru } : null,
    level: build.level,
    source: stored.source,
    importedAt: stored.importedAt,
    defaultName: { ru: defaultBuildName(build, tree, gems, 'ru'), en: defaultBuildName(build, tree, gems, 'en') },
    primary: plan.primary,
    stages,
    report,
    instill: bi ? { hash: bi.hash, name: bi.name } : null,
    treeVersion: { pob: spec?.treeVersion ?? '', data: tree.meta.tree }
  }
}

/** Версии дерева совпадают по «мажор.минор»: `0_5` ~ `0.5.5`. */
export function sameTreeVersion(pob: string, data: string): boolean {
  const a = pob.replace(/_/g, '.').split('.').slice(0, 2).join('.')
  const b = data.split('.').slice(0, 2).join('.')
  return !a || !b || a === b
}
