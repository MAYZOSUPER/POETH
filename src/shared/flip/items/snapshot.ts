// Снимок цен уников (S33): формат ветки `prices` (собирает CI — tools/data/ninja-snapshot.mjs, раз в час из
// poe.ninja). Приложение читает его как недоверенные данные из сети: всё проверяется и обрезается здесь.

import type { ItemLine, ItemSnapshot, ItemSnapshotIndex, ItemTradeStat } from '../../types/flip'

export const ITEM_SNAPSHOT_VERSION = 1
const MAX_LINES = 20_000
const MAX_LEAGUES = 40
const MAX_TRADE = 8
const MAX_SPARK = 14
const TRADE_ID = /^[a-z]+\.[a-z0-9_]+$/

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown, max = 200): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

/** Имя файла лиги в снимке — как leagueFile() в tools/data/ninja-snapshot.mjs. */
export function leagueFile(league: string): string {
  return `${league.replace(/[^A-Za-z0-9]/g, (c) => `_${c.charCodeAt(0).toString(16)}`).slice(0, 120)}.json`
}

function parseTrade(v: unknown): ItemTradeStat[] | undefined {
  if (!Array.isArray(v)) return undefined
  const out: ItemTradeStat[] = []
  for (const t of v.slice(0, MAX_TRADE)) {
    if (!isObj(t)) continue
    const id = str(t.id, 80)
    if (!id || !TRADE_ID.test(id)) continue
    const s: ItemTradeStat = { id }
    const min = num(t.min)
    const max = num(t.max)
    if (min !== undefined) s.min = min
    if (max !== undefined) s.max = max
    out.push(s)
  }
  return out.length ? out : undefined
}

/** Одна строка снимка; мусор — null. */
export function parseLine(v: unknown): ItemLine | null {
  if (!isObj(v)) return null
  const id = str(v.id, 160)
  const name = str(v.name)
  const base = str(v.base)
  const type = str(v.type, 40)
  const chaos = num(v.chaos)
  if (!id || !name || !base || !type || chaos === undefined || chaos <= 0 || chaos > 1e8) return null
  const line: ItemLine = {
    id,
    name,
    base,
    type,
    cls: Math.round(num(v.cls) ?? 3),
    chaos,
    count: Math.max(0, Math.round(num(v.count) ?? 0)),
    listings: Math.max(0, Math.round(num(v.listings) ?? 0))
  }
  const variant = str(v.variant)
  if (variant) line.variant = variant
  if (v.links === 5 || v.links === 6) line.links = v.links
  const itemType = str(v.itemType, 60)
  if (itemType) line.itemType = itemType
  if (v.corrupted === true) line.corrupted = true
  const implicits = num(v.implicits)
  if (implicits !== undefined && implicits >= 0 && implicits < 20) line.implicits = Math.round(implicits)
  const trade = parseTrade(v.trade)
  if (trade) line.trade = trade
  const change = num(v.change)
  if (change !== undefined) line.change = change
  if (Array.isArray(v.spark)) line.spark = v.spark.slice(0, MAX_SPARK).map((x) => num(x) ?? null)
  return line
}

/** Файл лиги из ветки `prices`; не тот формат — null. */
export function parseSnapshot(json: unknown): ItemSnapshot | null {
  if (!isObj(json) || json.v !== ITEM_SNAPSHOT_VERSION || !Array.isArray(json.lines)) return null
  const league = str(json.league, 100)
  const at = num(json.at)
  if (!league || at === undefined) return null
  const lines: ItemLine[] = []
  const seen = new Set<string>()
  for (const raw of json.lines.slice(0, MAX_LINES)) {
    const l = parseLine(raw)
    if (!l || seen.has(l.id)) continue
    seen.add(l.id)
    lines.push(l)
  }
  if (!lines.length) return null
  const snap: ItemSnapshot = { league, at, source: 'poe.ninja', lines }
  const divine = num(json.divine)
  if (divine !== undefined && divine > 1) snap.divine = divine
  return snap
}

/** index.json ветки `prices`. */
export function parseIndex(json: unknown): ItemSnapshotIndex | null {
  if (!isObj(json) || json.v !== ITEM_SNAPSHOT_VERSION || !Array.isArray(json.leagues)) return null
  const at = num(json.at)
  if (at === undefined) return null
  const leagues: ItemSnapshotIndex['leagues'] = []
  for (const l of json.leagues.slice(0, MAX_LEAGUES)) {
    if (!isObj(l)) continue
    const league = str(l.league, 100)
    const file = str(l.file, 200)
    // только poe1/<имя>.json — без выхода из папки снимка
    if (!league || !file || !/^poe1\/[A-Za-z0-9_]+\.json$/.test(file)) continue
    leagues.push({ league, file, at: num(l.at) ?? at })
  }
  return { at, leagues }
}

// ---------------------------------------------------------------- строки

const FOULBORN = /^Foulborn /

/** Foulborn-версия уника (у poe.ninja — приставка к имени). */
export const isFoulborn = (l: Pick<ItemLine, 'name'>): boolean => FOULBORN.test(l.name)

/** Имя уника без приставки Foulborn — так его ищет сайт трейда (Foulborn — отдельный фильтр). */
export const uniqueName = (l: Pick<ItemLine, 'name'>): string => l.name.replace(FOULBORN, '')

/**
 * Уник, который флипаем: рамка 3 и 10 (у poe.ninja 10 — обычные уники вроде Headhunter, Mageblood-вариантов нет).
 * Фольга (9, «реликвия») — коллекционная цена, на трейде отдельная редкость — пропускаем.
 */
export const isPlainUnique = (l: Pick<ItemLine, 'cls'>): boolean => l.cls === 3 || l.cls === 10

/** Ключ «тот же предмет без учёта связей»: имя, база, вариант. */
export const formKey = (l: Pick<ItemLine, 'name' | 'base' | 'variant'>): string => `${l.name}\u0000${l.base}\u0000${l.variant ?? ''}`

/**
 * Строки без связей, у которых есть 5L/6L-версия: их цена — за 0–4 связи, и искать их на трейде надо с
 * «не больше 4 связей», иначе в выдачу попадут дорогие 5L/6L.
 */
export function unlinkedForms(lines: readonly ItemLine[]): Set<string> {
  const linked = new Set<string>()
  for (const l of lines) if (l.links) linked.add(formKey(l))
  return linked
}
