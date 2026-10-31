// Этапы билда PoE 2 по уровням персонажа (S66; чистый модуль, tests/build2/stages.test.ts).
// Как у PoE 1 (src/shared/pob/stages.ts, S35): отдельной сущности «этап» в PoB2 нет — это деревья, наборы камней и
// предметов с названиями «Act 2», «Level 1-12», «Interlude», «Maps», «Endgame». Названия читает тот же guessStage;
// уровни актов — из данных игры (tree.json: области актов G1…G4, интерлюдии P1…P3, первые карты — 65), а не
// таблица PoE 1. Для игрового `.build` нужен только диапазон уровней этапа: `level_interval` [с, по].
//
// Основная ось — та, где больше узнанных названий (дерево > камни > предметы при равенстве); для двух других на
// этап берётся то же название, иначе набор, действующий на начало этапа, иначе активный. Ничего не узнано — один
// этап «весь билд» (активные дерево, камни и предметы) на уровни 1–100.

import { guessStage, type StageGuess } from '../../pob/stages'
import type { Pob2Build } from '../../pob/poe2'
import type { Poe2TreeData } from './data'

export type Poe2StageKind = 'act' | 'interlude' | 'level' | 'maps' | 'endgame' | 'all'

export interface Poe2Stage {
  /** название этапа как у автора (по основной оси); '' — «весь билд» */
  title: string
  kind: Poe2StageKind
  /** уровни персонажа, включительно */
  from: number
  to: number
  /** индексы наборов PoB2; null — набора на этой оси нет */
  spec: number | null
  skills: number | null
  items: number | null
}

export interface Poe2StagePlan {
  stages: Poe2Stage[]
  /** по какой оси этапы; 'none' — названия не узнаны, один этап на весь билд */
  primary: 'spec' | 'skills' | 'items' | 'none'
}

export const MAX_LEVEL = 100

const INTERLUDE_RE = /(?<![\p{L}\p{N}_])(?:interlude|интерлюди\p{L}*)(?![\p{L}\p{N}_])/iu

interface Guess {
  index: number
  title: string
  kind: Poe2StageKind
  from: number
  swap: boolean
}

/** С какого уровня этап по названию (PoE 2); null — не узнан или набор на всю кампанию. */
export function stageFrom2(title: string, tree: Pick<Poe2TreeData, 'acts' | 'interlude' | 'maps'>): { kind: Poe2StageKind; from: number } | null {
  if (INTERLUDE_RE.test(title) && tree.interlude) return { kind: 'interlude', from: tree.interlude.from }
  const g: StageGuess = guessStage(title)
  if (g.campaign) return null
  if (g.levelFrom !== undefined) return { kind: g.kind === 'act' ? 'act' : 'level', from: g.levelFrom }
  if (g.kind === 'act' && g.actFrom !== undefined) {
    const act = tree.acts.find((a) => a.act === g.actFrom)
    if (act) return { kind: 'act', from: act.from }
    // акта нет в данных (новые акты 1.0): после последнего известного
    const last = tree.acts[tree.acts.length - 1]
    if (last && g.actFrom > last.act) return { kind: 'act', from: Math.min(tree.interlude?.from ?? last.to + 1, tree.maps - 1) }
    return null
  }
  if (g.kind === 'maps') return { kind: 'maps', from: tree.maps }
  if (g.kind === 'endgame') return { kind: 'endgame', from: tree.maps }
  if (g.kind === 'level' && g.levelFrom !== undefined) return { kind: 'level', from: g.levelFrom }
  return null
}

function guesses(titles: string[], tree: Pick<Poe2TreeData, 'acts' | 'interlude' | 'maps'>): Guess[] {
  const out: Guess[] = []
  titles.forEach((title, index) => {
    const s = stageFrom2(title, tree)
    if (s) out.push({ index, title, kind: s.kind, from: s.from, swap: guessStage(title).swap })
  })
  // есть и «Maps», и «Endgame» — эндгейм позже первых карт (иначе оба начались бы с 65)
  if (out.some((x) => x.kind === 'maps')) for (const x of out) if (x.kind === 'endgame') x.from = Math.min(tree.maps + ENDGAME_AFTER_MAPS, MAX_LEVEL)
  return out
}

/** «Endgame» рядом с «Maps»: на столько уровней позже первых карт. */
const ENDGAME_AFTER_MAPS = 15

const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim()

/** Набор оси для этапа: то же название → действующий на начало этапа → активный. */
function pick(titles: string[], known: Guess[], title: string, from: number, active: number): number | null {
  if (!titles.length) return null
  const same = titles.findIndex((t) => t && norm(t) === norm(title))
  if (same >= 0) return same
  let best: Guess | null = null
  for (const g of known) if (g.from <= from && (!best || g.from > best.from)) best = g
  if (best) return best.index
  return Math.min(Math.max(active, 0), titles.length - 1)
}

/** План этапов билда PoE 2. */
export function resolveStages2(build: Pob2Build, tree: Pick<Poe2TreeData, 'acts' | 'interlude' | 'maps'>): Poe2StagePlan {
  const specT = build.specs.map((s) => s.title)
  const skillT = build.skillSets.map((s) => s.title)
  const itemT = build.itemSets.map((s) => s.title)
  const g = { spec: guesses(specT, tree), skills: guesses(skillT, tree), items: guesses(itemT, tree) }
  const axes = (['spec', 'skills', 'items'] as const).filter((a) => g[a].length > 0)
  const primary = axes.reduce<'spec' | 'skills' | 'items' | null>((best, a) => (!best || g[a].length > g[best].length ? a : best), null)

  if (!primary) {
    return {
      primary: 'none',
      stages: [
        {
          title: '',
          kind: 'all',
          from: 1,
          to: MAX_LEVEL,
          spec: specT.length ? build.activeSpec : null,
          skills: skillT.length ? build.activeSkillSet : null,
          items: itemT.length ? build.activeItemSet : null
        }
      ]
    }
  }

  // этапы основной оси по уровню; «Swap»-варианты и повторы того же уровня — не отдельные этапы
  const main = [...g[primary]].sort((a, b) => a.from - b.from || a.index - b.index)
  const kept: Guess[] = []
  for (const x of main) {
    const prev = kept[kept.length - 1]
    if (prev && prev.from === x.from) {
      if (prev.swap && !x.swap) kept[kept.length - 1] = x
      continue
    }
    kept.push(x)
  }
  const stages: Poe2Stage[] = kept.map((x, i) => {
    const next = kept[i + 1]
    return {
      title: x.title,
      kind: x.kind,
      // первый этап — с 1 уровня: до него у автора ничего нет, а игроку подсказки нужны сразу
      from: i === 0 ? 1 : x.from,
      to: next ? Math.max(x.from, next.from - 1) : MAX_LEVEL,
      spec: primary === 'spec' ? x.index : pick(specT, g.spec, x.title, x.from, build.activeSpec),
      skills: primary === 'skills' ? x.index : pick(skillT, g.skills, x.title, x.from, build.activeSkillSet),
      items: primary === 'items' ? x.index : pick(itemT, g.items, x.title, x.from, build.activeItemSet)
    }
  })
  return { primary, stages }
}
