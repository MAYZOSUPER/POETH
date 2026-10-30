// Анойнт PoE1 (S54): три масла на амулете дают нотабл дерева. Файл — resources/data/poe1/build/anoints.json
// (генератор tools/build-data/anoints.mjs: поле `recipe` нод официальной выгрузки дерева GGG + тиры масел из
// таблицы клиента), приходит и через канал обновления данных. Имена нот — из tree.json (те же hash), имена
// масел на языке клиента и иконки — данные APT по tradeTag (`clear-oil`), цены — фид обмена GGG (Фаустус, S24).
//
// Здесь: нота → 3 масла, набор масел → нота (порядок масел не важен, масла повторяются), поиск ноты по имени
// RU/EN, анойнт амулета из билда PoB (только то, что указал автор), стоимость по ценам масел.
// Чистый модуль; tests/build-data/anoints.test.ts.

import type { PobBuild } from '../pob/model'
import { pobItem } from '../pob/model'
import type { PobStagePlan } from '../pob/stages'
import { readPobItem, type PobModLine } from './pobItem'
import type { GameLang, TreeData, TreeNode } from './types'

/** Путь внутри данных игры (resources/data/poe1, userData/data/poe1). */
export const BUILD_ANOINTS_FILE = 'build/anoints.json'
/** Версия формата, которую понимает приложение (новее — ждём обновления приложения). */
export const ANOINTS_FORMAT = 1
/** Масел в рецепте ноты. */
export const ANOINT_OILS = 3

/**
 * anoints.json: масла по тиру — [id как в выгрузке GGG, английское имя, tradeTag]; рецепты — hash ноды → индексы
 * масел по возрастанию тира; `only` — ноты только для анойнта (на дереве их не взять).
 */
export interface AnointDataRaw {
  v: number
  meta: { tree: string; sources: string[]; recipes: number }
  oils: [string, string, string][]
  recipes: Record<string, number[]>
  only: number[]
}

export interface AnointOil {
  /** индекс в списке = порядок тира: Prismatic 0, Clear 1 … Golden 13 */
  index: number
  /** id как в рецепте выгрузки GGG (`ClearOil`) */
  id: string
  /** английское имя (`Clear Oil`): по нему цена у Фаустуса; запасное имя, пока не загрузились данные APT */
  en: string
  /** tradeTag (`clear-oil`): имя на языке клиента и иконка из данных APT */
  tag: string
}

export type AnointRecipe = readonly [number, number, number]

export interface AnointData {
  version: number
  meta: AnointDataRaw['meta']
  oils: AnointOil[]
  /** hash ноды → индексы масел по тиру */
  recipes: Map<number, AnointRecipe>
  /** ключ набора масел (`oilsKey`) → hash ноды */
  byOils: Map<string, number>
  /** ноты только для анойнта */
  only: Set<number>
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string'

/** Набор масел без учёта порядка: «1,6,10». */
export function oilsKey(oils: readonly number[]): string {
  return [...oils].sort((a, b) => a - b).join(',')
}

/** JSON anoints.json → разобранные рецепты; null — не наш формат или формат новее приложения. */
export function parseAnointData(raw: unknown): AnointData | null {
  if (!isObj(raw) || raw.v !== ANOINTS_FORMAT || !Array.isArray(raw.oils) || !isObj(raw.recipes)) return null
  const r = raw as unknown as AnointDataRaw
  const oils: AnointOil[] = []
  for (const o of r.oils) {
    if (!Array.isArray(o) || !isStr(o[0]) || !isStr(o[1]) || !isStr(o[2])) return null
    oils.push({ index: oils.length, id: o[0], en: o[1], tag: o[2] })
  }
  const recipes = new Map<number, AnointRecipe>()
  const byOils = new Map<string, number>()
  for (const [key, list] of Object.entries(r.recipes)) {
    const hash = Number(key)
    if (!Number.isInteger(hash) || !Array.isArray(list) || list.length !== ANOINT_OILS) continue
    if (!list.every((i) => Number.isInteger(i) && i >= 0 && i < oils.length)) continue
    const sorted = [...list].sort((a, b) => a - b) as unknown as AnointRecipe
    recipes.set(hash, sorted)
    const k = oilsKey(sorted)
    if (!byOils.has(k)) byOils.set(k, hash)
  }
  const only = new Set(Array.isArray(r.only) ? r.only.filter((h) => Number.isInteger(h) && recipes.has(h)) : [])
  return {
    version: r.v,
    meta: isObj(r.meta) ? r.meta : { tree: '', sources: [], recipes: recipes.size },
    oils,
    recipes,
    byOils,
    only
  }
}

/** Нота → три масла (по тиру); null — ноту не анойнтят. */
export function anointOils(data: AnointData, hash: number): AnointOil[] | null {
  const r = data.recipes.get(hash)
  return r ? r.map((i) => data.oils[i]) : null
}

/** Три масла (индексы, любой порядок, с повторами) → нота; null — такого рецепта нет или масел не три. */
export function anointByOils(data: AnointData, oils: readonly number[]): number | null {
  if (oils.length !== ANOINT_OILS) return null
  return data.byOils.get(oilsKey(oils)) ?? null
}

/** Ноты, в рецепте которых есть все выбранные масла (с повторами): «осталось выбрать одно — вот варианты». */
export function anointsWithOils(data: AnointData, picked: readonly number[]): number[] {
  if (!picked.length) return []
  const out: number[] = []
  for (const [hash, recipe] of data.recipes) {
    const left = [...recipe]
    if (picked.every((o) => {
      const i = left.indexOf(o)
      if (i < 0) return false
      left.splice(i, 1)
      return true
    })) out.push(hash)
  }
  return out.sort((a, b) => a - b)
}

// ---------------------------------------------------------------------------- имена и поиск

/** Для сравнения: регистр, «ё» = «е», апострофы и лишние пробелы не важны. */
export function normName(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[’'`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/** Ноты анойнта с деревом: hash → нода. Нода, которой нет в tree.json, пропускается (данные разных версий). */
function notes(data: AnointData, tree: TreeData): TreeNode[] {
  const out: TreeNode[] = []
  for (const hash of data.recipes.keys()) {
    const n = tree.nodes.get(hash)
    if (n) out.push(n)
  }
  return out
}

/** Нота по точному имени EN или RU (как в строке «Allocates <имя>» PoB или в игре); null — не анойнтят. */
export function anointByName(data: AnointData, tree: TreeData, name: string): number | null {
  const q = normName(name)
  if (!q) return null
  for (const n of notes(data, tree)) if (normName(n.en) === q || normName(n.ru) === q) return n.hash
  return null
}

export interface AnointHit {
  hash: number
  /** совпало: имя с начала, слово имени с начала, слово в тексте статов, часть слова в имени */
  by: 'start' | 'word' | 'stat' | 'part'
}

const RANK: Record<AnointHit['by'], number> = { start: 0, word: 1, stat: 2, part: 3 }

const words = (s: string): string[] => s.split(/[^\p{L}\p{N}']+/u).filter(Boolean)

/**
 * Слово подходит к запросу из одного слова: начинается с него или, у русского от 4 букв, это то же слово в другом
 * падеже — основа без последней буквы и окончание до двух букв («мана» найдёт «маны», «маной», но не «мантию»).
 */
function wordMatcher(q: string): (w: string) => boolean {
  const stem = q.length >= 4 && /[а-я]$/.test(q) ? q.slice(0, -1) : null
  return (w) => w.startsWith(q) || (stem !== null && w.startsWith(stem) && w.length <= q.length + 1)
}

/**
 * Поиск ноты для анойнта по имени на любом языке (RU-клиент, а имя из английского гайда — тоже найдётся);
 * от 3 букв — и по тексту статов («мана», «aura»). Порядок: имя с начала, слово имени с начала, слово в статах,
 * часть слова в имени («мана» в «шамана» — последним); внутри — по имени на языке клиента.
 */
export function searchAnoints(data: AnointData, tree: TreeData, query: string, lang: GameLang, limit = 8): AnointHit[] {
  const q = normName(query)
  if (!q) return []
  const match = wordMatcher(q)
  const wordHit = (s: string): boolean => (q.includes(' ') ? s.includes(q) : words(s).some(match))
  const hits: (AnointHit & { name: string })[] = []
  for (const n of notes(data, tree)) {
    const names = [normName(n.en), normName(n.ru)]
    let by: AnointHit['by'] | null = null
    if (names.some((s) => s.startsWith(q))) by = 'start'
    else if (names.some(wordHit)) by = 'word'
    else if (q.length >= 3 && n.stats.some((l) => wordHit(normName(l.en)) || (l.ru !== null && wordHit(normName(l.ru))))) by = 'stat'
    else if (names.some((s) => s.includes(q))) by = 'part'
    if (by) hits.push({ hash: n.hash, by, name: lang === 'ru' ? n.ru : n.en })
  }
  hits.sort((a, b) => RANK[a.by] - RANK[b.by] || a.name.localeCompare(b.name, lang) || a.hash - b.hash)
  return hits.slice(0, limit).map(({ hash, by }) => ({ hash, by }))
}

// ---------------------------------------------------------------------------- анойнт из билда PoB

/** «Allocates <нота>» — анойнт; строки Forbidden Flame/Flesh («… if you have the matching modifier …») — нет. */
const ALLOCATES_RE = /^Allocates (.+)$/
const FORBIDDEN_RE = /\bif you have the matching modifier\b/i

/** Имя ноты анойнта в строках предмета: созданная или зачарованная строка «Allocates X» (PoB пишет `{crafted}`). */
export function anointLine(lines: readonly PobModLine[]): string | null {
  for (const l of lines) {
    if (!l.crafted && !l.enchant) continue
    const m = ALLOCATES_RE.exec(l.text.trim())
    if (m && !FORBIDDEN_RE.test(l.text)) return m[1].trim()
  }
  return null
}

/** Имя ноты анойнта на амулете набора предметов PoB; null — амулета нет или он без анойнта. */
export function setAnointName(build: PobBuild, setIndex: number | null | undefined): string | null {
  if (setIndex === null || setIndex === undefined) return null
  const id = build.itemSets[setIndex]?.slots.Amulet
  const item = pobItem(build, id)
  const info = item ? readPobItem(item.text) : null
  return info ? anointLine([...info.implicits, ...info.explicits]) : null
}

export interface BuildAnoint {
  /** имя ноты как у автора (EN, из «Allocates …») */
  name: string
  /** этап, на амулете которого анойнт; null — активный набор предметов вне этапов */
  stage: number | null
  /** анойнт на амулете этапа на экране (а не взят с другого этапа автора) */
  here: boolean
}

/**
 * Анойнт, который указал автор: амулет этапа на экране; если у этого амулета анойнта нет — ближайший следующий
 * этап с анойнтом, потом предыдущий, потом активный набор предметов. Анойнта нигде нет — null (не выдумываем).
 */
export function buildAnoint(build: PobBuild, plan: PobStagePlan, shown: number): BuildAnoint | null {
  const stages = plan.stages
  const at = (i: number): string | null => setAnointName(build, stages[i]?.items)
  const here = at(shown)
  if (here) return { name: here, stage: shown, here: true }
  const order = [...stages.keys()].filter((i) => i > shown).concat([...stages.keys()].filter((i) => i < shown).reverse())
  for (const i of order) {
    const name = at(i)
    if (name) return { name, stage: i, here: false }
  }
  const active = setAnointName(build, build.activeItemSet)
  return active ? { name: active, stage: null, here: false } : null
}

// ---------------------------------------------------------------------------- стоимость

export interface AnointCost {
  /** chaos за каждое масло рецепта; null — цены нет */
  each: (number | null)[]
  /** сумма в chaos; null — хотя бы у одного масла цены нет (тогда без цены, не «примерно») */
  total: number | null
}

/** Стоимость рецепта по ценам масел: tradeTag → chaos за 1 шт. (фид обмена). */
export function anointCost(oils: readonly AnointOil[], prices: ReadonlyMap<string, number> | null | undefined): AnointCost {
  const each = oils.map((o) => {
    const p = prices?.get(o.tag)
    return p !== undefined && Number.isFinite(p) && p > 0 ? p : null
  })
  const total = each.length && each.every((p) => p !== null) ? each.reduce<number>((s, p) => s + (p ?? 0), 0) : null
  return { each, total }
}

export interface CostView {
  unit: 'chaos' | 'divine'
  /** число для показа: < 10 — с одним знаком после запятой, иначе целое */
  n: number
}

/** Сумма в chaos → как показать: от 1 div — в divine (по курсу фида), иначе в chaos. */
export function costView(chaos: number, chaosPerDivine: number | null | undefined): CostView {
  const round = (v: number): number => (v >= 10 ? Math.round(v) : Math.round(v * 10) / 10)
  if (chaosPerDivine && chaosPerDivine > 0 && chaos >= chaosPerDivine) return { unit: 'divine', n: round(chaos / chaosPerDivine) }
  return { unit: 'chaos', n: round(chaos) }
}
