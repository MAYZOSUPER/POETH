// «Вложение» PoE 2 (S66): три дистиллированные эмоции на амулете дают нотабл дерева — как анойнт PoE 1 (S54,
// src/shared/build/anoints.ts), но **порядок эмоций значим** (в данных 0.5.5 без учёта порядка совпадают наборы
// 642 пар нот). Файл — resources/data/poe2/build/instill.json (генератор tools/build-data/poe2/instill.mjs:
// поле `recipe` выгрузки дерева GGG + эмоции RePoE + имена RU/EN из данных EE2), приходит и через канал данных.
//
// Здесь: нота → 3 эмоции по порядку, 3 эмоции → нота, «выбраны не все — какие ноты подходят», поиск ноты по имени
// RU/EN и тексту статов, вложение амулета из билда PoB2, стоимость по ценам эмоций (exalted, «у Ange» — S61).
// Чистый модуль; tests/build2/instill.test.ts.

import type { Pob2Build } from '../../pob/poe2'
import { normName } from '../../build/anoints'
import type { Poe2StagePlan } from './stages'

/** Путь внутри данных игры (resources/data/poe2, userData/data/poe2). */
export const POE2_INSTILL_FILE = 'build/instill.json'
/** Версия формата, которую понимает приложение. */
export const INSTILL_FORMAT = 1
/** Эмоций в рецепте. */
export const INSTILL_EMOTIONS = 3

export interface Emotion {
  /** индекс = сила: разбавленные 0–2, обычные 3–6, концентрированные 7–9, густые 10–12 */
  index: number
  /** id в рецепте выгрузки GGG (`LiquidParanoia`) */
  id: string
  /** id предмета (`Metadata/Items/Currency/DistilledEmotion4`) */
  baseId: string
  /** английское имя: по нему цена у Ange (S61) */
  en: string
  /** '' — RU-имени нет в данных */
  ru: string
  /** tradeTag (`liquid-paranoia`) */
  tag: string
}

export interface InstillNotable {
  hash: number
  en: string
  ru: string
  /** тексты статов EN (официальная выгрузка); RU-текстов в открытых данных нет */
  stats: string[]
}

export type InstillRecipe = readonly [number, number, number]

export interface InstillData {
  version: number
  meta: { tree: string; sources: string[]; recipes: number }
  emotions: Emotion[]
  /** hash ноты → индексы эмоций в порядке рецепта */
  recipes: Map<number, InstillRecipe>
  /** ключ «i,j,k» (порядок важен) → hash ноты */
  byEmotions: Map<string, number>
  notables: Map<number, InstillNotable>
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string'

/** JSON instill.json → данные; null — не наш формат или формат новее приложения. */
export function parseInstillData(raw: unknown): InstillData | null {
  if (!isObj(raw) || raw.v !== INSTILL_FORMAT || !Array.isArray(raw.emotions) || !isObj(raw.recipes) || !isObj(raw.notables)) return null
  const emotions: Emotion[] = []
  for (const e of raw.emotions as unknown[]) {
    if (!Array.isArray(e) || !e.slice(0, 5).every(isStr) || !/^[A-Za-z]{3,60}$/.test(e[0])) return null
    emotions.push({ index: emotions.length, id: e[0], baseId: e[1], en: e[2].slice(0, 80), ru: e[3].slice(0, 80), tag: e[4].slice(0, 80) })
  }
  const recipes = new Map<number, InstillRecipe>()
  const byEmotions = new Map<string, number>()
  for (const [key, list] of Object.entries(raw.recipes)) {
    const hash = Number(key)
    if (!Number.isInteger(hash) || !Array.isArray(list) || list.length !== INSTILL_EMOTIONS) continue
    if (!list.every((i) => Number.isInteger(i) && i >= 0 && i < emotions.length)) continue
    const r = [list[0], list[1], list[2]] as const
    recipes.set(hash, r)
    if (!byEmotions.has(r.join(','))) byEmotions.set(r.join(','), hash)
  }
  const notables = new Map<number, InstillNotable>()
  for (const [key, n] of Object.entries(raw.notables)) {
    const hash = Number(key)
    if (!recipes.has(hash) || !Array.isArray(n) || !isStr(n[0]) || !isStr(n[1])) continue
    const stats = Array.isArray(n[2]) ? (n[2] as unknown[]).filter(isStr).map((s) => s.slice(0, 300)).slice(0, 12) : []
    notables.set(hash, { hash, en: n[0].slice(0, 100), ru: n[1].slice(0, 100), stats })
  }
  if (!recipes.size) return null
  const m = isObj(raw.meta) ? raw.meta : {}
  return {
    version: raw.v as number,
    meta: { tree: isStr(m.tree) ? m.tree : '', sources: Array.isArray(m.sources) ? m.sources.filter(isStr) : [], recipes: recipes.size },
    emotions,
    recipes,
    byEmotions,
    notables
  }
}

export type InstillLang = 'ru' | 'en'

export function notableName(n: InstillNotable, lang: InstillLang): string {
  return lang === 'ru' && n.ru ? n.ru : n.en
}

export function emotionName(e: Emotion, lang: InstillLang): string {
  return lang === 'ru' && e.ru ? e.ru : e.en
}

/** Нота → три эмоции в порядке рецепта; null — ноту не вкладывают. */
export function instillEmotions(data: InstillData, hash: number): Emotion[] | null {
  const r = data.recipes.get(hash)
  return r ? r.map((i) => data.emotions[i]) : null
}

/** Три эмоции по порядку → нота; null — такого рецепта нет. */
export function instillByEmotions(data: InstillData, picked: readonly number[]): number | null {
  if (picked.length !== INSTILL_EMOTIONS) return null
  return data.byEmotions.get(picked.join(',')) ?? null
}

/**
 * Выбраны не все места: ноты, у которых на выбранных местах те же эмоции («первая — паранойя, вторая — любая»).
 * null на месте — не выбрано. Порядок — по hash (UI сортирует по имени).
 */
export function instillsMatching(data: InstillData, slots: readonly (number | null)[]): number[] {
  if (!slots.some((s) => s !== null && s !== undefined)) return []
  const out: number[] = []
  for (const [hash, r] of data.recipes) if (r.every((e, i) => slots[i] === null || slots[i] === undefined || slots[i] === e)) out.push(hash)
  return out.sort((a, b) => a - b)
}

/** Нота по точному имени EN или RU («Allocates X» в PoB2, «Активирует X» в игре); null — не вкладывают. */
export function instillByName(data: InstillData, name: string): number | null {
  const q = normName(name.replace(/^(?:allocates|активирует)\s+/i, ''))
  if (!q) return null
  for (const n of data.notables.values()) if (normName(n.en) === q || normName(n.ru) === q) return n.hash
  return null
}

export interface InstillHit {
  hash: number
  /** совпало: имя с начала, слово имени с начала, слово в тексте статов, часть слова в имени */
  by: 'start' | 'word' | 'stat' | 'part'
}

const RANK: Record<InstillHit['by'], number> = { start: 0, word: 1, stat: 2, part: 3 }
const words = (s: string): string[] => s.split(/[^\p{L}\p{N}']+/u).filter(Boolean)

/** Слово подходит: начинается с запроса или (русский, от 4 букв) — то же слово в другом падеже (как у S54). */
function wordMatcher(q: string): (w: string) => boolean {
  const stem = q.length >= 4 && /[а-я]$/.test(q) ? q.slice(0, -1) : null
  return (w) => w.startsWith(q) || (stem !== null && w.startsWith(stem) && w.length <= q.length + 1)
}

/**
 * Поиск ноты по имени на любом языке (RU-клиент, а имя из английского гайда — тоже найдётся); от 3 букв — и по
 * тексту статов EN. Порядок: имя с начала, слово имени, слово в статах, часть слова; внутри — по имени на языке.
 */
export function searchInstill(data: InstillData, query: string, lang: InstillLang, limit = 8): InstillHit[] {
  const q = normName(query)
  if (!q) return []
  const match = wordMatcher(q)
  const wordHit = (s: string): boolean => (q.includes(' ') ? s.includes(q) : words(s).some(match))
  const hits: (InstillHit & { name: string })[] = []
  for (const n of data.notables.values()) {
    const names = [normName(n.en), normName(n.ru)].filter(Boolean)
    let by: InstillHit['by'] | null = null
    if (names.some((s) => s.startsWith(q))) by = 'start'
    else if (names.some(wordHit)) by = 'word'
    else if (q.length >= 3 && n.stats.some((l) => wordHit(normName(l)))) by = 'stat'
    else if (names.some((s) => s.includes(q))) by = 'part'
    if (by) hits.push({ hash: n.hash, by, name: notableName(n, lang) })
  }
  hits.sort((a, b) => RANK[a.by] - RANK[b.by] || a.name.localeCompare(b.name, lang) || a.hash - b.hash)
  return hits.slice(0, limit).map(({ hash, by }) => ({ hash, by }))
}

// ---------------------------------------------------------------------------- вложение из билда PoB2

/** «{enchant}Allocates X» / «{crafted}Allocates X» в тексте предмета PoB2 → X. */
const ALLOCATES_RE = /^(?:\{[a-z]+(?::[^}]*)?\})*\{(?:enchant|crafted)\}(?:\{[a-z]+(?::[^}]*)?\})*Allocates (.+)$/

/** Имя ноты вложения на амулете набора предметов; null — амулета нет или он без вложения. */
export function setInstillName(build: Pob2Build, setIndex: number | null | undefined): string | null {
  if (setIndex === null || setIndex === undefined) return null
  const id = build.itemSets[setIndex]?.slots.Amulet
  const item = id ? build.items.find((x) => x.id === id) : undefined
  if (!item) return null
  for (const line of item.text.split('\n')) {
    const m = ALLOCATES_RE.exec(line.trim())
    if (m) return m[1].trim()
  }
  return null
}

export interface BuildInstill {
  /** hash ноты; null — ноты нет в данных (другая версия игры) */
  hash: number | null
  /** имя как у автора (EN, из «Allocates …») */
  name: string
  /** этап, на амулете которого вложение; null — активный набор вне этапов */
  stage: number | null
}

/** Вложение, которое указал автор: амулет этапа на экране, потом следующие этапы, предыдущие, активный набор. */
export function buildInstill(build: Pob2Build, plan: Poe2StagePlan, data: InstillData, shown = plan.stages.length - 1): BuildInstill | null {
  const stages = plan.stages
  const order = [shown, ...[...stages.keys()].filter((i) => i > shown), ...[...stages.keys()].filter((i) => i < shown).reverse()]
  for (const i of order) {
    const name = setInstillName(build, stages[i]?.items)
    if (name) return { hash: instillByName(data, name), name, stage: i }
  }
  const active = setInstillName(build, build.activeItemSet)
  return active ? { hash: instillByName(data, active), name: active, stage: null } : null
}

// ---------------------------------------------------------------------------- стоимость

export interface InstillCost {
  /** exalted за каждую эмоцию рецепта; null — цены нет */
  each: (number | null)[]
  /** сумма в exalted; null — хотя бы у одной эмоции цены нет (тогда без цены, не «примерно») */
  total: number | null
}

/** Стоимость рецепта: английское имя эмоции → exalted за 1 шт. (цена у Ange, S61). */
export function instillCost(emotions: readonly Emotion[], prices: ReadonlyMap<string, number> | null | undefined): InstillCost {
  const each = emotions.map((e) => {
    const p = prices?.get(e.en)
    return p !== undefined && Number.isFinite(p) && p > 0 ? p : null
  })
  const total = each.length && each.every((p) => p !== null) ? each.reduce<number>((s, p) => s + (p ?? 0), 0) : null
  return { each, total }
}

export interface InstillCostView {
  unit: 'exalted' | 'divine'
  /** < 10 — с одним знаком после запятой, иначе целое */
  n: number
}

/** Сумма в exalted → как показать: от 1 div — в divine (по курсу), иначе в exalted. */
export function instillCostView(exalted: number, exaltedPerDivine: number | null | undefined): InstillCostView {
  const round = (v: number): number => (v >= 10 ? Math.round(v) : Math.round(v * 10) / 10)
  if (exaltedPerDivine && exaltedPerDivine > 0 && exalted >= exaltedPerDivine) return { unit: 'divine', n: round(exalted / exaltedPerDivine) }
  return { unit: 'exalted', n: round(exalted) }
}
