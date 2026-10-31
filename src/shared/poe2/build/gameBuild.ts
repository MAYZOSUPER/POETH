// Билд PoB2 → официальный игровой файл `.build` PoE 2 (S66; чистый модуль, tests/build2/gameBuild.test.ts).
//
// Формат — GGG, «Build Planner», объект Build «Version 1 (Experimental)»
// (https://www.pathofexile.com/developer/docs/game): JSON с `name`, `author`, `link`, `description`, `ascendancy`,
// `passives`, `skills`, `inventory_slots`; у пассивов, камней и слотов — `level_interval` [с, по] и
// `additional_text` (разметка `<тег>{текст}`). Игра сама следит за папкой Documents/My Games/Path of Exile 2/
// BuildPlanner. К 1.0 (11.12.2026) формат может поменяться: версия и сборка файла — только здесь
// (GAME_BUILD_VERSION, toGameBuild), остальной код получает готовый объект.
//
// Что пишем:
//  - `ascendancy` — id восхождения (`Huntress1`) из PoB2 (`ascendancyInternalId`), иначе по classId/ascendClassId;
//  - `passives` — строковые id нод (`melee17`) по hash из выгрузки дерева GGG; стартовые ноды класса и восхождения
//    не пишем (их даёт игра); порядок — по этапам, внутри этапа — от стартовой ноды по связям дерева (как брать);
//    `weapon_set` 1/2 — ноды наборов оружия PoB2; выбор атрибута у нод «+5 к любому атрибуту» — подсказкой;
//  - `skills` — неогранённые камни умений с поддержками (`support_skills`) по группам PoB2; стандартные атаки
//    оружия, умения от предметов и дерева и мета-камни игра в `.build` не принимает — их пропускаем (отчёт);
//  - `inventory_slots` — подсказки к слотам экипировки: уник (`unique_name` + имя), иначе редкость и база;
//  - `level_interval` — уровни этапа (stages.ts); билд из одного этапа — без уровней.
// Личных данных нет: автора не пишем, ссылка — только на публичную пасту, откуда игрок взял код.

import type { Pob2Build, Pob2Spec } from '../../pob/poe2'
import type { PobItem, PobSkillGroup } from '../../pob/model'
import { findAscendancy, findGem, gemName, NODE_FLAG, type Poe2Gem, type Poe2GemData, type Poe2TreeData } from './data'
import { MAX_LEVEL, type Poe2Stage, type Poe2StagePlan } from './stages'

/** Версия объекта Build, под которую собран файл (GGG: «Version: 1 (Experimental)»). */
export const GAME_BUILD_VERSION = 1

export type BuildHintLang = 'ru' | 'en'

export type LevelInterval = [number, number]

export interface GameBuildPassive {
  id: string
  level_interval?: LevelInterval
  weapon_set?: number
  additional_text?: string
}

export interface GameBuildSupport {
  id: string
  level_interval?: LevelInterval
  additional_text?: string
}

export interface GameBuildSkill {
  id: string
  level_interval?: LevelInterval
  additional_text?: string
  support_skills?: Array<string | GameBuildSupport>
}

export interface GameBuildSlot {
  inventory_id: string
  slot_x?: number
  slot_y?: number
  level_interval?: LevelInterval
  unique_name?: string
  additional_text?: string
}

/** Объект Build «Version 1 (Experimental)». */
export interface GameBuildFile {
  name: string
  author?: string
  link?: string
  description?: string
  ascendancy?: string
  passives?: Array<string | GameBuildPassive>
  skills?: Array<string | GameBuildSkill>
  inventory_slots?: GameBuildSlot[]
}

/** Имена предметов на языке подсказок (данные EE2 в main); нет — английское имя PoB. */
export interface ItemNames {
  unique(en: string): string | null
  base(en: string): string | null
}

export interface GameBuildOptions {
  /** название билда (видно в игровом планировщике) */
  name: string
  /** язык подсказок `additional_text` */
  lang: BuildHintLang
  /** публичная страница пасты, откуда взят код; null — код вставлен */
  link?: string | null
  items?: ItemNames | null
}

export interface GameBuildReport {
  stages: number
  passives: number
  skills: number
  supports: number
  slots: number
  /** ноды, которых нет в данных дерева (другая версия дерева) */
  unknownNodes: number
  /** камни, которых нет в данных игры (имя PoB) */
  unknownGems: string[]
  /** мета-камни — игра их в `.build` пока не принимает */
  metaGems: string[]
  /** группы без камня умения: стандартная атака оружия, умения предметов и дерева */
  skippedGroups: number
  warnings: string[]
}

// ---------------------------------------------------------------------------- подсказки

const T = {
  ru: {
    choose: 'Выберите',
    attr: { str: 'Сила', dex: 'Ловкость', int: 'Интеллект' },
    main: 'Главное умение билда',
    rarity: { UNIQUE: 'Уникальный', RARE: 'Редкий', MAGIC: 'Магический', NORMAL: 'Обычный' },
    desc: (n: number) => `Из Path of Building через POETH. Этапов по уровням: ${n}.`
  },
  en: {
    choose: 'Choose',
    attr: { str: 'Strength', dex: 'Dexterity', int: 'Intelligence' },
    main: 'Main skill of the build',
    rarity: { UNIQUE: 'Unique', RARE: 'Rare', MAGIC: 'Magic', NORMAL: 'Normal' },
    desc: (n: number) => `From Path of Building via POETH. Level stages: ${n}.`
  }
} as const

/** Текст для `additional_text`: без разметки игры (`<…>`, `{…}`) и управляющих символов, с пределом длины. */
export function plainHint(s: string, max = 200): string {
  const t = String(s ?? '')
    .replace(/[<>{}]/g, '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return t.length > max ? t.slice(0, max) : t
}

/** Название билда для файла и игры: без управляющих символов, ≤ 80 символов; пусто — «PoE 2 build». */
export function cleanBuildName(s: string): string {
  const t = String(s ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s{2,}/g, ' ').trim()
  return (t.length > 80 ? t.slice(0, 80).trim() : t) || 'PoE 2 build'
}

// ---------------------------------------------------------------------------- интервалы

/**
 * Интервал уровней по этапам, где есть вещь: с начала первого такого этапа до конца последнего (пропуск посередине
 * — перераспределение — не дробим: одна запись на id). Весь диапазон 1–100 — без интервала.
 */
function interval(stages: readonly Poe2Stage[], present: ReadonlySet<number>): LevelInterval | undefined {
  let first = -1
  let last = -1
  for (let i = 0; i < stages.length; i++) {
    if (!present.has(i)) continue
    if (first < 0) first = i
    last = i
  }
  if (first < 0) return undefined
  const from = stages[first].from
  const to = last === stages.length - 1 ? MAX_LEVEL : stages[last].to
  return from <= 1 && to >= MAX_LEVEL ? undefined : [from, to]
}

function addAt<K>(map: Map<K, Set<number>>, key: K, stage: number): void {
  let s = map.get(key)
  if (!s) map.set(key, (s = new Set()))
  s.add(stage)
}

// ---------------------------------------------------------------------------- пассивы

const START = NODE_FLAG.classStart | NODE_FLAG.ascStart

/** Ноды Spec в порядке взятия: от стартовой ноды класса по связям, потом восхождение, потом прочее по hash. */
export function nodeOrder(spec: Pob2Spec, tree: Poe2TreeData): number[] {
  const want = new Set(spec.nodes.filter((h) => tree.nodes.has(h) && !((tree.nodes.get(h)?.flags ?? 0) & START)))
  const out: number[] = []
  const seen = new Set<number>()
  const bfs = (seed: number | undefined): void => {
    if (seed === undefined || !tree.nodes.has(seed)) return
    const queue = [seed]
    seen.add(seed)
    while (queue.length) {
      const h = queue.shift() as number
      const near = [...(tree.nodes.get(h)?.near ?? [])].sort((a, b) => a - b)
      for (const n of near) {
        if (seen.has(n) || !want.has(n)) continue
        seen.add(n)
        out.push(n)
        queue.push(n)
      }
    }
  }
  bfs(tree.starts.get(spec.classId))
  const ascStart = [...tree.nodes.values()].find((n) => n.flags & NODE_FLAG.ascStart && n.ascendancy === spec.ascendancy)
  bfs(ascStart?.hash)
  for (const h of [...want].sort((a, b) => a - b)) if (!seen.has(h)) out.push(h)
  return out
}

function passives(build: Pob2Build, plan: Poe2StagePlan, tree: Poe2TreeData, lang: BuildHintLang, report: GameBuildReport): GameBuildPassive[] {
  const at = new Map<number, Set<number>>()
  const order: number[] = []
  const unknown = new Set<number>()
  // набор оружия и выбор атрибута — с первого этапа, где они заданы (в прокачке у автора их часто нет)
  const weapon = new Map<number, number>()
  const attr = new Map<number, 'str' | 'dex' | 'int'>()
  plan.stages.forEach((st, i) => {
    const spec = st.spec === null ? undefined : build.specs[st.spec]
    if (!spec) return
    for (const h of spec.nodes) if (!tree.nodes.has(h)) unknown.add(h)
    for (const h of nodeOrder(spec, tree)) {
      if (!at.has(h)) order.push(h)
      addAt(at, h, i)
      if (!weapon.has(h)) {
        if (spec.weaponSets[0].includes(h)) weapon.set(h, 1)
        else if (spec.weaponSets[1].includes(h)) weapon.set(h, 2)
      }
      if (!attr.has(h)) {
        const a = spec.attributes.str.includes(h) ? 'str' : spec.attributes.dex.includes(h) ? 'dex' : spec.attributes.int.includes(h) ? 'int' : null
        if (a) attr.set(h, a)
      }
    }
  })
  report.unknownNodes = unknown.size
  const t = T[lang]
  return order.map((h) => {
    const node = tree.nodes.get(h) as NonNullable<ReturnType<typeof tree.nodes.get>>
    const p: GameBuildPassive = { id: node.id }
    const li = interval(plan.stages, at.get(h) as Set<number>)
    if (li) p.level_interval = li
    const ws = weapon.get(h)
    if (ws) p.weapon_set = ws
    const a = attr.get(h)
    if (a) p.additional_text = `${t.choose}: <b>{${t.attr[a]}}`
    return p
  })
}

// ---------------------------------------------------------------------------- камни

interface GroupGems {
  skills: Poe2Gem[]
  supports: Poe2Gem[]
}

/** Камни группы PoB2 по данным игры; мета-камни и неизвестные — в отчёт. */
function groupGems(g: PobSkillGroup, gems: Poe2GemData, report: GameBuildReport): GroupGems {
  const out: GroupGems = { skills: [], supports: [] }
  for (const gem of g.gems) {
    if (!gem.enabled) continue
    const found = findGem(gems, gem.gemId)
    if (!found) {
      // стандартная атака оружия — не камень, её в отчёт не пишем
      if (gem.gemId && !/PlayerDefault/.test(gem.gemId) && !report.unknownGems.includes(gem.nameSpec)) report.unknownGems.push(gem.nameSpec)
      continue
    }
    if (found.kind === 'meta') {
      if (!report.metaGems.includes(found.en)) report.metaGems.push(found.en)
    } else if (found.kind === 'skill') {
      if (!out.skills.some((s) => s.id === found.id)) out.skills.push(found)
    } else if (!out.supports.some((s) => s.id === found.id)) out.supports.push(found)
  }
  return out
}

/** Главное умение билда: первый камень умения в главной группе активного набора (PoB2 mainSocketGroup). */
export function mainSkill(build: Pob2Build, gems: Poe2GemData): Poe2Gem | null {
  const set = build.skillSets[build.activeSkillSet]
  if (!set) return null
  const quiet: GameBuildReport = emptyReport()
  const groups = set.groups.filter((g) => g.enabled && !g.source)
  const main = build.mainSocketGroup ? set.groups[build.mainSocketGroup - 1] : undefined
  const first = (g: PobSkillGroup | undefined): Poe2Gem | null => (g && g.enabled && !g.source ? groupGems(g, gems, quiet).skills[0] ?? null : null)
  return first(main) ?? groups.map(first).find((x) => x) ?? null
}

function skills(build: Pob2Build, plan: Poe2StagePlan, gems: Poe2GemData, lang: BuildHintLang, report: GameBuildReport): GameBuildSkill[] {
  const at = new Map<string, Set<number>>()
  const supAt = new Map<string, Map<string, Set<number>>>()
  const order: string[] = []
  const supOrder = new Map<string, string[]>()
  // пропущенные группы — по набору и номеру группы: один набор на нескольких этапах считаем один раз
  const skipped = new Set<string>()
  plan.stages.forEach((st, i) => {
    const set = st.skills === null ? undefined : build.skillSets[st.skills]
    if (!set) return
    set.groups.forEach((g, gi) => {
      if (!g.enabled) return
      if (g.source) {
        skipped.add(`${st.skills}:${gi}`)
        return
      }
      const gg = groupGems(g, gems, report)
      if (!gg.skills.length) {
        skipped.add(`${st.skills}:${gi}`)
        return
      }
      gg.skills.forEach((s, k) => {
        if (!at.has(s.id)) order.push(s.id)
        addAt(at, s.id, i)
        // поддержки — к первому камню умения группы (у мета-связок их делит игра, в `.build` так не записать)
        if (k > 0) return
        let m = supAt.get(s.id)
        if (!m) supAt.set(s.id, (m = new Map()))
        let so = supOrder.get(s.id)
        if (!so) supOrder.set(s.id, (so = []))
        for (const p of gg.supports) {
          if (!m.has(p.id)) so.push(p.id)
          addAt(m, p.id, i)
        }
      })
    })
  })
  report.skippedGroups = skipped.size
  const main = mainSkill(build, gems)
  return order.map((id) => {
    const s: GameBuildSkill = { id }
    const li = interval(plan.stages, at.get(id) as Set<number>)
    if (li) s.level_interval = li
    if (main && main.id === id) s.additional_text = `<b>{${T[lang].main}}`
    const sups = (supOrder.get(id) ?? []).map((pid): string | GameBuildSupport => {
      const sli = interval(plan.stages, supAt.get(id)?.get(pid) as Set<number>)
      // поддержка на всё время умения — без своего интервала
      return sli && (!li || sli[0] !== li[0] || sli[1] !== li[1]) ? { id: pid, level_interval: sli } : pid
    })
    if (sups.length) s.support_skills = sups
    return s
  })
}

// ---------------------------------------------------------------------------- слоты

/** Слот PoB2 → id из таблицы Inventories игры (GGG: Weapon1, Helm1, BodyArmour1, Gloves1, Boots1, Belt1, Ring1…). */
export const POB2_INVENTORY: Readonly<Record<string, string>> = {
  'Weapon 1': 'Weapon1',
  'Weapon 2': 'Offhand1',
  'Weapon 1 Swap': 'Weapon2',
  'Weapon 2 Swap': 'Offhand2',
  Helmet: 'Helm1',
  'Body Armour': 'BodyArmour1',
  Gloves: 'Gloves1',
  Boots: 'Boots1',
  Amulet: 'Amulet1',
  'Ring 1': 'Ring1',
  'Ring 2': 'Ring2',
  Belt: 'Belt1'
}
const SLOT_ORDER = Object.keys(POB2_INVENTORY)

type Rarity = 'UNIQUE' | 'RARE' | 'MAGIC' | 'NORMAL'

interface ItemHead {
  rarity: Rarity
  /** имя уника или редкого */
  name: string | null
  /** база (у магических — нет: имя склеено с аффиксами) */
  base: string | null
}

/** Шапка текста предмета PoB2: «Rarity: RARE», имя, база. null — не предмет. */
export function itemHead(item: PobItem): ItemHead | null {
  const lines = item.text.split('\n').map((l) => l.trim()).filter(Boolean)
  const m = /^Rarity:\s*(UNIQUE|RARE|MAGIC|NORMAL)$/i.exec(lines[0] ?? '')
  if (!m) return null
  const rarity = m[1].toUpperCase() as Rarity
  const line = (i: number): string | null => {
    const s = lines[i]
    return s && s.length <= 100 && !/[:{}<>]/.test(s) ? s : null
  }
  if (rarity === 'UNIQUE' || rarity === 'RARE') return { rarity, name: line(1), base: line(2) }
  if (rarity === 'NORMAL') return { rarity, name: null, base: line(1) }
  return { rarity, name: null, base: null }
}

const UNIQUE_NAME_RE = /^[A-Za-z][A-Za-z' ,-]{0,79}$/

function slots(build: Pob2Build, plan: Poe2StagePlan, opts: GameBuildOptions): GameBuildSlot[] {
  const at = new Map<string, Set<number>>()
  const what = new Map<string, { inv: string; head: ItemHead }>()
  const order: string[] = []
  plan.stages.forEach((st, i) => {
    const set = st.items === null ? undefined : build.itemSets[st.items]
    if (!set) return
    for (const slot of SLOT_ORDER) {
      const id = set.slots[slot as keyof typeof set.slots]
      const item = id ? build.items.find((x) => x.id === id) : undefined
      const head = item ? itemHead(item) : null
      if (!head) continue
      const inv = POB2_INVENTORY[slot]
      const key = `${inv}|${head.rarity}|${head.name ?? ''}|${head.base ?? ''}`
      if (!at.has(key)) {
        order.push(key)
        what.set(key, { inv, head })
      }
      addAt(at, key, i)
    }
  })
  const t = T[opts.lang]
  const ru = opts.lang === 'ru'
  order.sort((a, b) => SLOT_ORDER.indexOf(slotOf(a)) - SLOT_ORDER.indexOf(slotOf(b)) || order.indexOf(a) - order.indexOf(b))
  return order.map((key) => {
    const { inv, head } = what.get(key) as { inv: string; head: ItemHead }
    const s: GameBuildSlot = { inventory_id: inv }
    const li = interval(plan.stages, at.get(key) as Set<number>)
    if (li) s.level_interval = li
    if (head.rarity === 'UNIQUE' && head.name) {
      if (UNIQUE_NAME_RE.test(head.name)) s.unique_name = head.name
      const name = plainHint((ru && opts.items?.unique(head.name)) || head.name)
      s.additional_text = `<unique>{${name}}`
    } else {
      const base = head.base ? plainHint((ru && opts.items?.base(head.base)) || head.base) : ''
      const color = head.rarity === 'RARE' ? 'yellow' : head.rarity === 'MAGIC' ? 'blue' : 'white'
      s.additional_text = `<${color}>{${t.rarity[head.rarity]}${base ? `: ${base}` : ''}}`
    }
    return s
  })

  function slotOf(key: string): string {
    const inv = key.split('|')[0]
    return SLOT_ORDER.find((s) => POB2_INVENTORY[s] === inv) ?? ''
  }
}

// ---------------------------------------------------------------------------- сборка

function emptyReport(): GameBuildReport {
  return { stages: 0, passives: 0, skills: 0, supports: 0, slots: 0, unknownNodes: 0, unknownGems: [], metaGems: [], skippedGroups: 0, warnings: [] }
}

/** id восхождения для `.build`: из PoB2, иначе по классу и номеру восхождения. */
export function buildAscendancy(build: Pob2Build, tree: Poe2TreeData): string | null {
  const spec = build.specs[build.activeSpec] ?? build.specs[0]
  if (!spec) return null
  if (spec.ascendancy && findAscendancy(tree, spec.ascendancy)) return spec.ascendancy
  const cls = tree.classes[spec.classId]
  return (spec.ascendClassId > 0 && cls?.ascendancies[spec.ascendClassId - 1]?.id) || null
}

/** Название по умолчанию: «Восхождение — главное умение» на языке подсказок. */
export function defaultBuildName(build: Pob2Build, tree: Poe2TreeData, gems: Poe2GemData, lang: BuildHintLang): string {
  const asc = findAscendancy(tree, buildAscendancy(build, tree))
  const who = (asc && ((lang === 'ru' && asc.ru) || asc.en)) || build.ascendClassName || build.className || 'PoE 2'
  const skill = mainSkill(build, gems)
  return cleanBuildName(skill ? `${who} — ${gemName(skill, lang)}` : who)
}

/** Билд PoB2 + план этапов → объект Build для файла `.build` и отчёт (что пропущено). */
export function toGameBuild(
  build: Pob2Build,
  plan: Poe2StagePlan,
  tree: Poe2TreeData,
  gems: Poe2GemData,
  opts: GameBuildOptions
): { file: GameBuildFile; report: GameBuildReport } {
  const report = emptyReport()
  report.stages = plan.stages.length
  const file: GameBuildFile = { name: cleanBuildName(opts.name) }
  const link = opts.link && /^https:\/\/[^\s"<>]{1,300}$/.test(opts.link) ? opts.link : null
  if (link) file.link = link
  file.description = T[opts.lang].desc(plan.stages.length)
  const asc = buildAscendancy(build, tree)
  if (asc) file.ascendancy = asc
  else report.warnings.push('no-ascendancy')

  const p = passives(build, plan, tree, opts.lang, report)
  const s = skills(build, plan, gems, opts.lang, report)
  const sl = slots(build, plan, opts)
  if (p.length) file.passives = p.map((x) => (Object.keys(x).length === 1 ? x.id : x))
  if (s.length) file.skills = s.map((x) => (Object.keys(x).length === 1 ? x.id : x))
  if (sl.length) file.inventory_slots = sl
  report.passives = p.length
  report.skills = s.length
  report.supports = s.reduce((n, x) => n + (x.support_skills?.length ?? 0), 0)
  report.slots = sl.length
  return { file, report }
}

/** Текст файла: JSON с отступами (файл читают и люди), UTF-8 без BOM, перевод строки в конце. */
export function serializeGameBuild(file: GameBuildFile): string {
  return `${JSON.stringify(file, null, 2)}\n`
}
