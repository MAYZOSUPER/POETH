// Второй вердикт «по гайду» (S41, исследование §7.1 п. 3): ближе ли вещь из окна цены к предмету этапа в этом слоте
// (S40, stageItems), чем надетая. Без движка PoB: ключевые числа предмета гайда (жизнь, ЭЩ у бижутерии,
// сопротивления, скорость у обуви) — «что хочет гайд», доля закрытого у новой и у надетой вещи. Уник гайда —
// по имени. Чистый модуль: окно цены, tests/build/equipCompare.test.ts.

import type { PobBuild } from '../pob/model'
import type { PobStagePlan } from '../pob/stages'
import type { EquipItem, EquipKind } from '../types/equip'
import { numbersFromLines, sumNumbers } from './equipCompare'
import type { PobItemInfo } from './pobItem'
import { stageItems, type SlotKind, type StageItem } from './stageItems'

const SLOT_OF: Partial<Record<EquipKind, SlotKind>> = {
  weapon1h: 'weapon',
  weapon2h: 'weapon',
  bow: 'weapon',
  shield: 'offhand',
  quiver: 'offhand',
  helmet: 'helmet',
  body: 'body',
  gloves: 'gloves',
  boots: 'boots',
  amulet: 'amulet',
  ring: 'ring',
  belt: 'belt',
  flask: 'flask',
  jewel: 'jewel',
  abyss: 'abyss'
}

/** Предмет этапа гайда для вида вещи (первый подходящий слот); флаконы — того же вида по базе. */
export function guideItem(build: PobBuild, plan: PobStagePlan, index: number, item: EquipItem): StageItem | null {
  const kind = SLOT_OF[item.kind]
  if (!kind) return null
  const list = stageItems(build, plan, index).filter((x) => x.kind === kind)
  if (item.kind === 'flask') return list.find((x) => sameFlask(x.info, item.base)) ?? null
  return list[0] ?? null
}

const flaskWord = (name: string): string | null => /(Life|Mana|Hybrid) Flask/.exec(name)?.[1] ?? null
/** Флакон гайда того же вида: жизнь/мана/гибрид — по слову в базе, особые — та же база в имени магического. */
function sameFlask(info: PobItemInfo, base: string): boolean {
  const b = info.rarity === 'unique' ? info.base : info.name
  const w = flaskWord(base)
  return w ? flaskWord(b) === w : b.includes(base)
}

export type GuideWantId = 'life' | 'es' | 'res' | 'speed'

export interface GuideWant {
  id: GuideWantId
  value: number
}

export interface GuideVerdict {
  verdict: 'closer' | 'further' | 'same'
  /** EN-имя уника гайда (null — у гайда жёлтая/синяя вещь) */
  unique: string | null
  /** это и есть уник гайда */
  match: boolean
  /** что гайд хочет от слота (числа предмета гайда) */
  wants: GuideWant[]
}

const JEWELLERY = new Set<EquipKind>(['ring', 'amulet', 'belt'])
const THRESHOLD = 0.05

function wantsOf(info: PobItemInfo, kind: EquipKind): GuideWant[] {
  const n = numbersFromLines(
    [...info.implicits, ...info.explicits].map((m) => m.text),
    kind
  )
  const out: GuideWant[] = []
  if (n.life > 0) out.push({ id: 'life', value: n.life })
  if (n.es > 0 && JEWELLERY.has(kind)) out.push({ id: 'es', value: n.es })
  const res = Math.max(0, n.res.fire) + Math.max(0, n.res.cold) + Math.max(0, n.res.lightning) + Math.max(0, n.res.chaos)
  if (res > 0) out.push({ id: 'res', value: res })
  if (kind === 'boots' && n.speed > 0) out.push({ id: 'speed', value: n.speed })
  return out
}

function has(item: EquipItem, id: GuideWantId): number {
  const n = item.n
  if (id === 'res') return Math.max(0, n.res.fire) + Math.max(0, n.res.cold) + Math.max(0, n.res.lightning) + Math.max(0, n.res.chaos)
  return Math.max(0, n[id])
}

/** Доля «что хочет гайд», закрытая вещью (0…1). */
function cover(item: EquipItem, wants: readonly GuideWant[]): number {
  return wants.reduce((s, w) => s + Math.min(1, has(item, w.id) / w.value), 0) / wants.length
}

/**
 * Ближе ли вещь к предмету гайда, чем надетая (`worn` — то, что вещь снимет; пусто — сравниваем только с гайдом).
 * null — сравнивать не с чем (у предмета гайда нет ни жизни, ни сопротивлений, ни скорости, и это не уник).
 */
export function guideVerdict(guide: PobItemInfo, item: EquipItem, worn: readonly EquipItem[]): GuideVerdict | null {
  const unique = guide.rarity === 'unique' ? guide.name : null
  const wants = wantsOf(guide, item.kind)
  const match = !!unique && item.name === unique
  const wornMatch = !!unique && worn.some((w) => w.name === unique)
  if (match || wornMatch) return { verdict: match && !wornMatch ? 'closer' : wornMatch && !match ? 'further' : 'same', unique, match, wants }
  if (!wants.length) return null
  const a = cover(item, wants)
  // двуручное против пары — пара вместе
  const b = worn.length ? cover({ ...item, n: sumNumbers(worn) }, wants) : 0
  return { verdict: a > b + THRESHOLD ? 'closer' : a < b - THRESHOLD ? 'further' : 'same', unique, match: false, wants }
}
