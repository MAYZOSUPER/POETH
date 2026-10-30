// Метки предметов этапа (S40, K1 + K2 исследования build-key-items.md §1, §3, §5): «Ключевой», «Важный»,
// «Цель·люкс», «Для прокачки» — одна на предмет, по приоритету, с причиной одной строкой.
//
// «Ключевой» — только жёсткие правила из кода PoB (точность ≈ 95–99 %):
//   • предмет даёт главное умение: группа главной связки или полного DPS с `source="Item:<id>:…"`;
//   • главная связка стоит в гнезде уника с «Trigger … Socketed …» (Mjölner, Cospri's Malice);
//   • в дереве этапа есть ноды без пути, а в гнезде — Thread of Hope / Impossible Escape / Intuitive Leap
//     (только если версия дерева билда = версии данных S36: иначе «разрывы» ложные);
//   • пара Forbidden Flame + Forbidden Flesh;
//   • свой список (keyUniques.ts) с тегом skill-source / trigger-host и выполненным условием.
// «Важный» — без жёсткого правила, но ≥ 2 баллов: с первого послекампанийного набора до последнего +2, заметки
// автора «need / обязательно» рядом с именем +3, список (scaler / mechanic / radius-jewel) +2, мод-«механика»
// (кейстоун, «100% … Converted», «has no Reservation», поддержка или +уровень в слоте главной связки) +1,
// группа полного DPS в слоте уника +1.
// «Цель·люкс» — только в последнем «дорогом» наборе ($$$, BiS…), заметки «luxury / BiS / upgrade», список luxury,
// или тир цены T0 без жёсткого правила. «Для прокачки» — уник только в наборах прокачки или список leveling.
// Игрок правит метку сам: edits.marks[id] = true (ключевой) / false (снять).

import type { PobBuild, PobGem } from '../pob/model'
import type { PobStagePlan } from '../pob/stages'
import type { TreeData } from './types'
import { keyUnique, KEY_UNIQUES, type KeyTag } from './keyUniques'
import { itemGrantedSkills, stageIdentities, stageMainGroup, stageRawGroups, type StageItem } from './stageItems'

export type ItemMark = 'key' | 'important' | 'luxury' | 'leveling'

export type MarkReason =
  /** даёт главное умение (камень из группы предмета) */
  | { id: 'source'; gem: PobGem | null }
  /** главная связка — в гнезде этого уника, он её запускает */
  | { id: 'trigger' }
  /** в дереве этапа ноды без пути (hash); их даёт этот самоцвет */
  | { id: 'no-path'; nodes: number[] }
  /** пара Forbidden: нота восхождения (EN, как в моде) */
  | { id: 'forbidden'; notable: string }
  /** свой список POETH */
  | { id: 'list'; tag: KeyTag; ru: string; en: string }
  /** отметил игрок */
  | { id: 'manual' }
  /** с первого послекампанийного набора до последнего */
  | { id: 'stages' }
  /** так пишет автор в заметках */
  | { id: 'notes' }
  /** мод-«механика» уника */
  | { id: 'mod'; what: 'keystone' | 'conversion' | 'reservation' | 'link' }
  /** группа полного DPS в слоте этого уника */
  | { id: 'fulldps' }
  /** только в последнем «дорогом» наборе */
  | { id: 'last-set' }
  /** автор пишет «luxury / BiS / upgrade» */
  | { id: 'notes-luxury' }
  /** дорогой (тир T0 по poe.ninja) */
  | { id: 'price' }
  /** только в наборах прокачки; until — с какого уровня его уже нет у автора */
  | { id: 'leveling-sets'; until: number | null }

export interface ItemLabel {
  /** итоговая метка (с правкой игрока); null — без метки: «можно заменить жёлтой» */
  mark: ItemMark | null
  reason: MarkReason | null
  /** что решили правила (до правки игрока) */
  auto: ItemMark | null
  autoReason: MarkReason | null
  /** правка игрока: true — отметил ключевым, false — снял */
  manual: boolean | null
  /** баллы «важного» (для отладки и тестов) */
  score: number
}

/** Тир цены poe.ninja (S33): T0 ≥ 10 div, T1 ≥ 1, T2 ≥ 0,1, low — дешевле. */
export type PriceTier = 'T0' | 'T1' | 'T2' | 'low'

export interface ItemPrice {
  tier: PriceTier
  chaos: number
  div: number
}

export interface LabelOptions {
  tree?: TreeData | null
  /** цены уников по имени (EN); нет снимка — undefined */
  prices?: ReadonlyMap<string, ItemPrice> | null
  /** правки игрока: id предмета → true / false */
  marks?: Readonly<Record<string, boolean>> | null
}

const RADIUS_JEWELS = new Set(['Thread of Hope', 'Impossible Escape', 'Intuitive Leap'])
const TRIGGER_RE = /\bTriggers? (?:a )?Socketed\b|\bTrigger Socketed\b|Socketed (?:\w+ )*Spells? (?:are|is) Triggered/i
const LINK_SUPPORT_RE = /^Socketed Gems are Supported by|to Level of Socketed/i
const CONVERSION_RE = /^100% of \w+ Damage Converted to/i
const RESERVATION_RE = /has no Reservation|Reserves? Life instead/i
const FORBIDDEN_RE = /^Allocates (.+?) if you have the matching modifier on Forbidden (?:Flame|Flesh)$/i

const NEED_RE = /\b(?:need|needs|needed|must|mandatory|required|requires?|core|essential|key (?:item|unique))\b|обязател|ключев|без н(?:его|её)|нуж(?:ен|на|но)\b/i
const LUXURY_RE = /\b(?:luxury|bis|best in slot|upgrade|optional|nice to have)\b|люкс|апгрейд|не обязател/i
const EXPENSIVE_SET_RE = /\$\$|\bbis\b|mirror|luxury|min ?max|люкс/i

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Строки заметок, где упомянут уник (имя без учёта регистра или сокращение из списка целым словом). */
function noteLines(notes: string, name: string): string[] {
  if (!notes) return []
  const words = [name, ...(keyUnique(name)?.aliases ?? [])]
  const res = words.map((w, i) => new RegExp(`(?:^|[^\\p{L}])${escapeRe(w)}(?:$|[^\\p{L}])`, i === 0 ? 'iu' : 'u'))
  return notes.split(/\r?\n/).filter((l) => res.some((re) => re.test(l)))
}

/** Версия дерева билда («3_29») = версия данных S36 («3.29.1»): только тогда «ноды без пути» не ложные. */
export function sameTreeVersion(tree: TreeData, treeVersion: string): boolean {
  const m = /^(\d+)_(\d+)/.exec(treeVersion)
  return !!m && tree.meta.tree.split('.').slice(0, 2).join('.') === `${m[1]}.${m[2]}`
}

/** Взятые ноды без пути от старта класса (не восхождение, не кластер, не мастерство). */
export function disconnectedNodes(tree: TreeData, classId: number, nodes: readonly number[]): number[] {
  const start = tree.classes.find((c) => c.id === classId)?.start
  if (start == null) return []
  const taken = new Set(nodes)
  const seen = new Set<number>([start])
  const queue = [start]
  while (queue.length) {
    const h = queue.pop() as number
    for (const n of tree.nodes.get(h)?.links ?? []) {
      if (seen.has(n) || !taken.has(n)) continue
      seen.add(n)
      queue.push(n)
    }
  }
  return nodes.filter((h) => {
    if (seen.has(h) || h >= 65536) return false
    const n = tree.nodes.get(h)
    if (!n || n.asc !== null || n.proxy || n.bloodline || n.kind === 'mastery' || n.kind === 'classStart' || n.kind === 'ascStart') return false
    // гнёзда внутри кластерного самоцвета (affliction_jewel_slot…) висят на заглушках-proxy, а не на пути
    return !n.links.some((x) => tree.nodes.get(x)?.proxy)
  })
}

/** Этапы (индексы плана), в наборе которых есть предмет. */
function presence(build: PobBuild, plan: PobStagePlan): (id: string) => number[] {
  const sets = plan.stages.map((_, i) => stageIdentities(build, plan, i))
  return (id) => sets.flatMap((s, i) => (s.has(id) ? [i] : []))
}

/** Метки предметов этапа (ключ — StageItem.key). */
export function itemLabels(build: PobBuild, plan: PobStagePlan, index: number, items: readonly StageItem[], opts: LabelOptions = {}): Map<string, ItemLabel> {
  const out = new Map<string, ItemLabel>()
  const granted = itemGrantedSkills(build)
  const mainGroup = stageMainGroup(build, plan, index)
  const groups = stageRawGroups(build, plan, index)
  const fullDpsSlots = new Set(groups.filter((g) => g.enabled && g.includeInFullDPS && g.slot && !g.source).map((g) => g.slot as string))
  const stage = plan.stages[index]
  const spec = stage?.spec !== null && stage?.spec !== undefined ? build.specs[stage.spec] : undefined
  const tree = opts.tree ?? null
  const noPath = tree && spec && sameTreeVersion(tree, spec.treeVersion) ? disconnectedNodes(tree, spec.classId, spec.nodes) : []
  const forbidden = items.filter((x) => x.info.rarity === 'unique' && /^Forbidden (?:Flame|Flesh)$/.test(x.info.name))
  const pair = forbidden.some((x) => x.info.name === 'Forbidden Flame') && forbidden.some((x) => x.info.name === 'Forbidden Flesh')
  const where = presence(build, plan)
  const distinctSets = new Set(plan.stages.map((s) => s.items).filter((x) => x !== null)).size
  // послекампанийные этапы (ранние карты и эндгейм) с разными наборами: «с бюджетного до конца» имеет смысл, только
  // если наборы меняются (варианты эндгейма на одном наборе — не этапы покупок)
  // (и только узнанные этапы: у вариантов билда — «AG/zealotry», «sanctum» — наборы не этапы, сигнал выключен)
  const post = plan.stages
    .map((s, i) => ({ s, i }))
    .filter((x) => x.s.items !== null && x.s.guess.kind !== 'unknown' && (!x.s.leveling || x.s.guess.kind === 'maps'))
  const postSets = new Set(post.map((x) => x.s.items)).size

  for (const it of items) {
    const unique = it.info.rarity === 'unique'
    const name = it.info.name
    const lines = [...it.info.implicits, ...it.info.explicits].map((m) => m.text)
    const listed = unique ? keyUnique(name) : null
    let key: MarkReason | null = null

    // ---- жёсткие правила
    const src = granted.find((g) => g.itemId === it.itemId || (unique && g.name === name))
    if (src) key = { id: 'source', gem: src.group.gems.find((g) => g.enabled) ?? null }
    if (!key && unique && mainGroup?.slot && it.slots.includes(mainGroup.slot) && lines.some((l) => TRIGGER_RE.test(l))) key = { id: 'trigger' }
    if (!key && unique && RADIUS_JEWELS.has(name) && noPath.length) key = { id: 'no-path', nodes: noPath }
    if (!key && pair && forbidden.includes(it)) {
      const notable = lines.map((l) => FORBIDDEN_RE.exec(l)?.[1]).find(Boolean) ?? forbidden.flatMap((f) => f.info.explicits).map((m) => FORBIDDEN_RE.exec(m.text)?.[1]).find(Boolean)
      key = { id: 'forbidden', notable: notable ?? '' }
    }
    if (!key && listed && listed.tag === 'skill-source' && listed.skills && groups.some((g) => g.gems.some((x) => listed.skills!.includes(x.nameSpec)))) {
      key = { id: 'list', tag: listed.tag, ru: listed.ru, en: listed.en }
    }
    if (!key && listed && listed.tag === 'trigger-host' && mainGroup?.slot && it.slots.includes(mainGroup.slot)) {
      key = { id: 'list', tag: listed.tag, ru: listed.ru, en: listed.en }
    }

    // ---- баллы «важного», люкс и прокачка
    const imp: { score: number; reason: MarkReason | null } = { score: 0, reason: null }
    const add = (n: number, r: MarkReason): void => {
      imp.score += n
      imp.reason ??= r
    }
    const at = where(it.id)
    const notes = unique ? noteLines(build.notes, name) : []
    const notesNeed = notes.some((l) => NEED_RE.test(l) && !LUXURY_RE.test(l))
    const notesLuxury = notes.some((l) => LUXURY_RE.test(l))
    if (notesNeed) add(3, { id: 'notes' })
    if (unique && postSets >= 2 && at.includes(post[0].i) && at.includes(post[post.length - 1].i)) add(2, { id: 'stages' })
    if (listed && (listed.tag === 'scaler' || listed.tag === 'mechanic' || listed.tag === 'radius-jewel')) add(2, { id: 'list', tag: listed.tag, ru: listed.ru, en: listed.en })
    if (unique) {
      if (lines.some((l) => CONVERSION_RE.test(l))) add(1, { id: 'mod', what: 'conversion' })
      else if (lines.some((l) => RESERVATION_RE.test(l))) add(1, { id: 'mod', what: 'reservation' })
      else if (tree && lines.some((l) => isKeystone(tree, l))) add(1, { id: 'mod', what: 'keystone' })
      if (mainGroup?.slot && it.slots.includes(mainGroup.slot) && lines.some((l) => LINK_SUPPORT_RE.test(l))) add(1, { id: 'mod', what: 'link' })
      if (it.slots.some((s) => fullDpsSlots.has(s))) add(1, { id: 'fulldps' })
    }

    const price = unique ? opts.prices?.get(name) : undefined
    const label = ((): { mark: ItemMark | null; reason: MarkReason | null } => {
      if (key) return { mark: 'key', reason: key }
      if (imp.score >= 2) return { mark: 'important', reason: imp.reason }
      if (!unique) return { mark: null, reason: null }
      const last = post[post.length - 1]
      const lastSet = last && last.s.items !== null ? build.itemSets[last.s.items] : undefined
      const onlyLast = distinctSets >= 2 && at.length > 0 && !!last && at.every((i) => plan.stages[i].items === last.s.items) && EXPENSIVE_SET_RE.test(lastSet?.title ?? '')
      const levelingOnly =
        distinctSets >= 2 && at.length > 0 && at.every((i) => plan.stages[i].leveling && plan.stages[i].guess.kind !== 'maps') && plan.stages.some((s) => !s.leveling)
      const list = (tag: KeyTag): MarkReason => ({ id: 'list', tag, ru: listed?.ru ?? '', en: listed?.en ?? '' })
      if (onlyLast) return { mark: 'luxury', reason: { id: 'last-set' } }
      if (notesLuxury) return { mark: 'luxury', reason: { id: 'notes-luxury' } }
      if (listed?.tag === 'luxury') return { mark: 'luxury', reason: list('luxury') }
      if (price?.tier === 'T0') return { mark: 'luxury', reason: { id: 'price' } }
      if (levelingOnly) {
        const next = plan.stages.slice(Math.max(...at) + 1).find((s) => s.from !== null)
        return { mark: 'leveling', reason: { id: 'leveling-sets', until: next?.from ?? null } }
      }
      if (listed?.tag === 'leveling') return { mark: 'leveling', reason: list('leveling') }
      return { mark: null, reason: null }
    })()

    const m = opts.marks && Object.prototype.hasOwnProperty.call(opts.marks, it.id) ? opts.marks[it.id] : null
    const manual = typeof m === 'boolean' ? m : null
    let mark = label.mark
    let shown = label.reason
    if (manual === true && label.mark !== 'key') {
      mark = 'key'
      shown = { id: 'manual' }
    } else if (manual === false && (label.mark === 'key' || label.mark === 'important')) {
      mark = null
      shown = null
    }
    out.set(it.key, { mark, reason: shown, auto: label.mark, autoReason: label.reason, manual, score: imp.score })
  }
  return out
}

const keystoneNames = new WeakMap<TreeData, Set<string>>()

/** Строка мода = имя кейстоуна (так PoB узнаёт кейстоун с предмета). */
function isKeystone(tree: TreeData, line: string): boolean {
  let names = keystoneNames.get(tree)
  if (!names) {
    names = new Set([...tree.nodes.values()].filter((n) => n.kind === 'keystone').map((n) => n.en))
    keystoneNames.set(tree, names)
  }
  return names.has(line.trim())
}

// ---------------------------------------------------------------------------- «Купить первым»

export type BuyGroup = 'key' | 'important' | 'save' | 'later'

export interface BuyRow {
  key: string
  group: BuyGroup
}

const TIER_RANK: Record<PriceTier, number> = { low: 0, T2: 1, T1: 2, T0: 3 }

/**
 * Порядок «Купить первым» (§3): ключевой дешёвый (T2 и дешевле) → ключевой T1 → важный дешёвый → важный T1 →
 * ключевой T0 — «копить» (а пока — замена). Без цен — ключевые, затем важные, по слотам. Покупать сейчас — только
 * то, что можно надеть на уровне этапа (`level`); ключевые и важные выше уровня — группа «later» («позже, с N ур.»).
 * Остальное — «по слотам».
 */
export function buyFirst(items: readonly StageItem[], labels: ReadonlyMap<string, ItemLabel>, level: number, prices?: ReadonlyMap<string, ItemPrice> | null): BuyRow[] {
  const rows: Array<BuyRow & { rank: number; order: number }> = []
  items.forEach((it, order) => {
    const mark = labels.get(it.key)?.mark
    if (mark !== 'key' && mark !== 'important') return
    if (it.info.levelReq !== null && it.info.levelReq > level) {
      rows.push({ key: it.key, group: 'later', rank: 200 + (mark === 'key' ? 0 : 1), order })
      return
    }
    const tier = it.info.rarity === 'unique' ? prices?.get(it.info.name)?.tier : undefined
    const t = tier ? TIER_RANK[tier] : 0
    if (mark === 'key' && tier === 'T0') rows.push({ key: it.key, group: 'save', rank: 100, order })
    else if (mark === 'key') rows.push({ key: it.key, group: 'key', rank: t, order })
    else rows.push({ key: it.key, group: 'important', rank: 10 + t, order })
  })
  rows.sort((a, b) => a.rank - b.rank || a.order - b.order)
  return rows.map(({ key, group }) => ({ key, group }))
}

/** Для тестов и разметки: все имена своего списка. */
export const KEY_UNIQUE_NAMES: readonly string[] = Object.keys(KEY_UNIQUES)

// ---------------------------------------------------------------------------- цены (снимок poe.ninja S33)

/** Строка снимка цен S33 (ItemRow), которая нужна для тиров. */
export interface PriceRow {
  name: string
  foulborn: boolean
  links?: 5 | 6
  chaos: number
  div: number
  tier: PriceTier
}

/** Цены уников по имени (EN): обычная форма без Foulborn и связей, самая дешёвая из вариантов. */
export function itemPrices(rows: readonly PriceRow[]): Map<string, ItemPrice> {
  const out = new Map<string, ItemPrice>()
  for (const r of rows) {
    if (r.foulborn || r.links) continue
    const had = out.get(r.name)
    if (!had || r.chaos < had.chaos) out.set(r.name, { tier: r.tier, chaos: r.chaos, div: r.div })
  }
  return out
}
