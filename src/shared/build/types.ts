// Данные вкладки «Билд» (S36): дерево пассивок и камни PoE1. Файлы — resources/data/poe1/build/{tree,gems}.json
// (генераторы tools/build-data/*.mjs, приходят и через канал обновления данных S12). Формат компактный —
// кортежи и таблицы строк; здесь его схема (`*Raw`) и разобранный вид, который отдаёт data.ts.

import type { GameLang } from '../types/settings'

export type { GameLang }

// ---------------------------------------------------------------------------
// Дерево пассивок
// ---------------------------------------------------------------------------

/** Вид ноды; в файле — индекс в этом массиве. */
export const TREE_KINDS = ['normal', 'notable', 'keystone', 'mastery', 'jewel', 'classStart', 'ascStart'] as const
export type TreeNodeKind = (typeof TREE_KINDS)[number]

/** Флаги ноды в файле (биты). */
export const TREE_FLAG = { proxy: 1, multipleChoice: 2, multipleChoiceOption: 4, bloodline: 8 } as const

/** Необязательные поля ноды в файле. */
export interface TreeNodeExtraRaw {
  /** id восхождения (`Assassin`, у Хранителя — `Raider`; у родословных — `Aul`…) */
  a?: string
  /** эффекты мастерства (id эффекта, как в PoB `masteryEffects="{нода,эффект}"`) */
  me?: number[]
  /** очков пассивок даёт нода («Grants 1 Passive Skill Point») */
  pts?: number
  /** гнездо кластерного самоцвета: 0 малое, 1 среднее, 2 большое */
  js?: number
}

/**
 * Нода в файле: [id, имя, вид, флаги, строки статов, статы для расчёта, группа, орбита, место на орбите,
 * соседи с большим hash, необязательное]. Имя и строки — индексы в `names` и `lines`; статы для расчёта —
 * плоско [индекс stat id в `stats`, значение, …].
 */
export type TreeNodeRaw =
  | [string, number, number, number, number[], number[], number, number, number, number[]]
  | [string, number, number, number, number[], number[], number, number, number, number[], TreeNodeExtraRaw]

export interface TreeClassRaw {
  en: string
  ru: string
  /** hash стартовой ноды */
  start: number | null
  /** базовые сила, ловкость, интеллект */
  attr: [number, number, number]
  /** восхождения по порядку: номер в PoB `ascendClassId` = индекс + 1 */
  asc: { id: string; en: string; ru: string; start: number | null }[]
}

export interface TreeDataRaw {
  v: number
  meta: { tree: string; sources: string[]; nodes: number; ruMissingLines: number }
  constants: { orbitRadii: number[]; skillsPerOrbit: number[] }
  /** индекс = classId PoB (0 Scion, 1 Marauder, 2 Ranger, 3 Witch, 4 Duelist, 5 Templar, 6 Shadow) */
  classes: TreeClassRaw[]
  /** альтернативные восхождения (родословные): `secondaryAscendClassId` PoB = индекс + 1 */
  alt: { id: string; en: string; ru: string; start: number | null }[]
  /** id группы → [x, y] */
  groups: Record<string, [number, number]>
  /** [en, ru] */
  names: [string, string][]
  /** [en] или [en, ru] — RU нет у строк, которые собрать не удалось (баффы аур) */
  lines: ([string] | [string, string])[]
  /** stat id для упрощённого расчёта защит (жизнь, ES, мана, сопротивления, атрибуты, броня, уклонение…) */
  stats: string[]
  /** id эффекта → [строки, статы для расчёта] */
  masteries: Record<string, [number[], number[]]>
  /** hash → нода */
  nodes: Record<string, TreeNodeRaw>
}

export interface TreeLine {
  en: string
  /** null — перевода нет, показываем EN */
  ru: string | null
}

export interface TreeNode {
  hash: number
  /** строковый id (как в журнале игры `Successfully allocated passive skill id: …` и в `.build` PoE2) */
  id: string
  en: string
  ru: string
  kind: TreeNodeKind
  /** id восхождения или родословной; null — основное дерево */
  asc: string | null
  /** позиция-заглушка кластерного самоцвета (не настоящая нода) */
  proxy: boolean
  /** выбор из нескольких вариантов (Ascendant: «Path of the …») */
  multipleChoice: boolean
  multipleChoiceOption: boolean
  /** нода родословной (альтернативное восхождение) */
  bloodline: boolean
  stats: TreeLine[]
  /** stat id → значение (только статы для расчёта защит) */
  calc: Record<string, number>
  group: number
  orbit: number
  orbitIndex: number
  /** соседи (в обе стороны) */
  links: number[]
  masteryEffects: number[]
  /** очков пассивок даёт нода */
  points: number
  /** гнездо кластерного самоцвета: 0 малое, 1 среднее, 2 большое; null — нет */
  clusterSize: number | null
}

export interface TreeMasteryEffect {
  effect: number
  stats: TreeLine[]
  calc: Record<string, number>
}

export interface TreeAscendancy {
  id: string
  en: string
  ru: string
  start: number | null
}

export interface TreeClass {
  /** classId PoB */
  id: number
  en: string
  ru: string
  start: number | null
  attr: [number, number, number]
  asc: TreeAscendancy[]
}

export interface TreeData {
  version: number
  meta: TreeDataRaw['meta']
  constants: TreeDataRaw['constants']
  classes: TreeClass[]
  alt: TreeAscendancy[]
  groups: Map<number, { x: number; y: number }>
  nodes: Map<number, TreeNode>
  byId: Map<string, TreeNode>
  masteries: Map<number, TreeMasteryEffect>
}

/** Разница двух наборов нод (этапы билда, «что взято» по журналу → этап). */
export interface TreeDiff {
  /** взять — в порядке целевого набора */
  add: number[]
  /** снять — в порядке исходного набора */
  remove: number[]
  /** сколько очков сброса нужно: снимаемые ноды без стартовых */
  respec: number
}

// ---------------------------------------------------------------------------
// Камни
// ---------------------------------------------------------------------------

/** Флаги камня в файле (биты). */
export const GEM_FLAG = { support: 1, vaal: 2, transfigured: 4 } as const

/** Источник камня в файле: [квест, 0 — награда / 1 — продавец, NPC (EN), маска классов (0 — все)]. */
export type GemSourceRaw = [string, 0 | 1, string, number]

/**
 * Камень в файле: [en, ru, цвет r/g/b/w, флаги, индекс таблицы уровней в `req`, источники?, gameId?, skillId?].
 * gameId — id предмета, если не равен ключу; skillId — id эффекта (PoB `skillId`), если не равен variantId.
 */
export type GemRaw =
  | [string, string, string, number, number]
  | [string, string, string, number, number, GemSourceRaw[]]
  | [string, string, string, number, number, GemSourceRaw[], string | 0]
  | [string, string, string, number, number, GemSourceRaw[], string | 0, string]

export interface GemQuestRaw {
  act: number
  /** уровень персонажа к сдаче квеста (по маршруту), null — неизвестен */
  lvl: number | null
  en: string
  ru: string
}

export interface GemsDataRaw {
  v: number
  meta: { sources: string[]; gems: number }
  /** базовые классы: бит i маски — classes[i] */
  classes: string[]
  /** требуемый уровень персонажа по уровням камня: [уровень 1, уровень 2, …] */
  req: number[][]
  quests: Record<string, GemQuestRaw>
  /** NPC EN → RU (как в клиенте) */
  npcs: Record<string, string>
  /** ключ — gemId PoB (`Metadata/Items/Gems/SkillGem` + variantId) */
  gems: Record<string, GemRaw>
}

export type GemColor = 'r' | 'g' | 'b' | 'w'

export interface GemSource {
  kind: 'quest' | 'vendor'
  questId: string
  act: number
  /** уровень персонажа к сдаче квеста, null — неизвестен */
  level: number | null
  questEn: string
  questRu: string
  npcEn: string
  npcRu: string
  /** базовые классы; пусто — все */
  classes: string[]
}

export interface Gem {
  /** ключ PoB (`<Gem gemId=…>`) */
  gemId: string
  /** id предмета игры (по нему награды маршрута и данные предметов APT) */
  gameId: string
  /** id эффекта (PoB `skillId`) */
  skillId: string
  /** PoB `variantId` */
  variantId: string
  en: string
  ru: string
  color: GemColor
  support: boolean
  vaal: boolean
  transfigured: boolean
  /** требуемый уровень персонажа: [уровень камня 1, 2, …] */
  req: number[]
  sources: GemSource[]
}

export interface GemsData {
  version: number
  meta: GemsDataRaw['meta']
  classes: string[]
  gems: Map<string, Gem>
  /** id эффекта → ключ PoB */
  bySkill: Map<string, string>
  /** id предмета → ключ PoB базового (не трансфигурированного) камня */
  byGameId: Map<string, string>
}

/** Где взять камень классу на уровне персонажа. */
export interface GemWhere {
  gem: Gem
  /** лучший источник: уже доступный к этому уровню, иначе ближайший; null — в кампании не выдают и не продают */
  source: GemSource | null
  /** источник доступен к этому уровню (квест уже сдан по маршруту) */
  available: boolean
  /** трансфигурированный: источник — у базового камня */
  viaBase: Gem | null
  /** с какого уровня персонажа камень 1 уровня можно вставить */
  usableFrom: number
  /** можно ли вставить сейчас */
  usable: boolean
}
