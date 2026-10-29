// Предметы этапа билда (S40): набор предметов этапа по слотам, флаконы, самоцветы дерева этапа и гнёзда абисса.
// Этап — из плана S35 (resolveStages + правки игрока): набор предметов `items`, дерево `spec` (самоцветы в гнёздах).
// Один и тот же предмет в двух слотах (два кольца, самоцвет в трёх гнёздах) — одна строка с числом слотов.
// Чистый модуль, тесты — tests/build/stageItems.test.ts.

import { pobItem, type PobBuild, type PobGem, type PobSkillGroup } from '../pob/model'
import { skillSections, type PobStagePlan } from '../pob/stages'
import { mainSkill, pobGemKey } from './library'
import { readPobItem, type PobItemInfo } from './pobItem'

export type SlotKind = 'weapon' | 'offhand' | 'helmet' | 'body' | 'gloves' | 'boots' | 'amulet' | 'ring' | 'belt' | 'flask' | 'jewel' | 'abyss' | 'graft'

/** Слоты PoB по порядку показа; смена оружия (Swap) не показывается — новичку это шум. */
const SLOT_KINDS: ReadonlyArray<[string, SlotKind]> = [
  ['Weapon 1', 'weapon'],
  ['Weapon 2', 'offhand'],
  ['Helmet', 'helmet'],
  ['Body Armour', 'body'],
  ['Gloves', 'gloves'],
  ['Boots', 'boots'],
  ['Amulet', 'amulet'],
  ['Ring 1', 'ring'],
  ['Ring 2', 'ring'],
  ['Ring 3', 'ring'],
  ['Belt', 'belt'],
  ['Graft 1', 'graft'],
  ['Graft 2', 'graft'],
  ['Flask 1', 'flask'],
  ['Flask 2', 'flask'],
  ['Flask 3', 'flask'],
  ['Flask 4', 'flask'],
  ['Flask 5', 'flask']
]

/** Слот самоцвета в дереве (для строки и правил). */
export const JEWEL_SLOT = 'Jewel'

export interface StageItem {
  /** ключ строки: первый слот + id предмета */
  key: string
  /**
   * Предмет «тот же» на разных этапах и для ручной метки игрока: у уника — `u:<имя>`, у прочих — `i:<id PoB>`
   * (PoB переносит предмет между наборами с тем же id).
   */
  id: string
  itemId: number
  /** слоты PoB («Ring 1», «Ring 2»), у самоцвета дерева — `Jewel`, у абисса — «Belt Abyssal Socket 1» */
  slots: string[]
  kind: SlotKind
  info: PobItemInfo
}

/** Предмет «тот же» на разных этапах: уник по имени, прочие — по id PoB. */
export function itemIdentity(info: PobItemInfo, itemId: number): string {
  return info.rarity === 'unique' ? `u:${info.name}` : `i:${itemId}`
}

function push(out: StageItem[], build: PobBuild, slot: string, kind: SlotKind, itemId: number | undefined): void {
  if (!itemId) return
  const same = out.find((x) => x.itemId === itemId && x.kind === kind)
  if (same) {
    same.slots.push(slot)
    return
  }
  const item = pobItem(build, itemId)
  const info = item ? readPobItem(item.text) : null
  if (!info) return
  out.push({ key: `${slot}:${itemId}`, id: itemIdentity(info, itemId), itemId, slots: [slot], kind, info })
}

/** Предметы набора этапа + самоцветы дерева этапа. Нет набора — пусто. */
export function stageItems(build: PobBuild, plan: PobStagePlan, index: number): StageItem[] {
  const stage = plan.stages[index]
  if (!stage) return []
  const out: StageItem[] = []
  const set = stage.items !== null ? build.itemSets[stage.items] : undefined
  if (set) for (const [slot, kind] of SLOT_KINDS) push(out, build, slot, kind, set.slots[slot as keyof typeof set.slots])
  const spec = stage.spec !== null ? build.specs[stage.spec] : undefined
  for (const s of spec?.sockets ?? []) push(out, build, JEWEL_SLOT, 'jewel', s.itemId)
  for (const o of set?.otherSlots ?? []) if (/Abyssal Socket/i.test(o.name)) push(out, build, o.name, 'abyss', o.itemId)
  return out
}

/** Тождества предметов (`itemIdentity`) в наборе этапа — «есть ли этот предмет на этапе N». */
export function stageIdentities(build: PobBuild, plan: PobStagePlan, index: number): Set<string> {
  return new Set(stageItems(build, plan, index).map((x) => x.id))
}

// ---------------------------------------------------------------------------- связки этапа

/** Группы камней набора этапа как есть (с группами от предметов). */
export function stageRawGroups(build: PobBuild, plan: PobStagePlan, index: number): PobSkillGroup[] {
  const skills = plan.stages[index]?.skills
  const set = skills ? build.skillSets[skills.set] : undefined
  if (!skills || !set) return []
  if (skills.section === null) return set.groups
  const sec = skillSections(set)[skills.section]
  return sec ? set.groups.slice(sec.groupFrom, sec.groupTo) : []
}

/** Главная связка этапа: группа с главным камнем билда; в активном наборе без разделов — mainSocketGroup. */
export function stageMainGroup(build: PobBuild, plan: PobStagePlan, index: number): PobSkillGroup | null {
  const groups = stageRawGroups(build, plan, index)
  const main = mainSkill(build)
  const same = (g: PobGem): boolean => g.enabled && ((!!main.gemId && pobGemKey(g) === main.gemId) || (!!main.name && g.nameSpec === main.name))
  const byGem = groups.find((g) => g.enabled && g.gems.some(same))
  if (byGem) return byGem
  const skills = plan.stages[index]?.skills
  if (skills && skills.set === build.activeSkillSet && skills.section === null && build.mainSocketGroup) {
    return groups[build.mainSocketGroup - 1] ?? null
  }
  return null
}

export interface ItemSkill {
  /** id предмета PoB из `source="Item:<id>:<Имя>, <база>"` */
  itemId: number
  /** имя предмета (у уника — имя уника) */
  name: string
  group: PobSkillGroup
  main: boolean
}

/**
 * Умения, которые дают предметы (PoB пишет группу с `source="Item:…"` в активный набор камней): главная
 * группа (mainSocketGroup) или группа полного DPS (includeInFullDPS).
 */
export function itemGrantedSkills(build: PobBuild): ItemSkill[] {
  const set = build.skillSets[build.activeSkillSet] ?? build.skillSets[0]
  const out: ItemSkill[] = []
  set?.groups.forEach((g, i) => {
    const m = /^Item:(\d+):(.+?)(?:, [^,]+)?$/.exec(g.source ?? '')
    if (!m || !g.enabled) return
    const main = build.mainSocketGroup === i + 1
    if (!main && !g.includeInFullDPS) return
    out.push({ itemId: Number(m[1]), name: m[2], group: g, main })
  })
  return out
}
