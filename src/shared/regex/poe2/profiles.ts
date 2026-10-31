// Профили «что нужно» PoE 2 (S62, идея poe2pricer): сохранённый набор путевого камня или плитки → строка поиска
// для тайника и «Цена по профилю» — тело одного запроса trade2 (статус `available`: выкуп + онлайн).
// Здесь — чистые функции: нормализация файла regex-poe2.json, правки профилей, тело запроса. Сеть — в main.

import type {
  Poe2Profile,
  Poe2ProfileInput,
  Poe2RegexData,
  Poe2RegexPage,
  Poe2RegexPrefs,
  Poe2RegexState,
  Poe2VendorQuery,
  RegexBuildResult,
  TabletQuery,
  TriState,
  WaystoneLabelKey,
  WaystoneQuery
} from '../../types/regex'
import { POE2_RARITIES } from './common'
import { TABLET_TYPES, TABLET_USES_MAX, buildTabletRegex, emptyTabletQuery } from './tablet'
import { POE2_ITEM_CLASSES, POE2_SOCKETS_MAX, POE2_VENDOR_KEYS, emptyPoe2VendorQuery } from './vendor'
import { WAYSTONE_LABEL_KEYS, WAYSTONE_TIER_MAX, buildWaystoneRegex, emptyWaystoneQuery } from './waystone'

export const PROFILES_MAX = 50
export const PROFILE_NAME_MAX = 60
const IDS_MAX = 100
const ID_LEN = 300

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const tri = (v: unknown): TriState => (v === 'only' || v === 'exclude' ? v : 'any')
const num = (v: unknown, max: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, Math.round(v))) : 0
const ids = (v: unknown): string[] =>
  Array.isArray(v)
    ? [...new Set(v.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= ID_LEN))].slice(0, IDS_MAX)
    : []
const pick = <T extends string>(list: readonly T[], v: unknown): T[] =>
  Array.isArray(v) ? list.filter((x) => (v as unknown[]).includes(x)) : []

export function normalizeWaystoneQuery(raw: unknown): WaystoneQuery {
  const q = emptyWaystoneQuery()
  if (!isObj(raw)) return q
  q.tierMin = num(raw.tierMin, WAYSTONE_TIER_MAX)
  q.tierMax = num(raw.tierMax, WAYSTONE_TIER_MAX)
  q.rarity = pick(POE2_RARITIES, raw.rarity)
  q.corrupted = tri(raw.corrupted)
  q.unidentified = tri(raw.unidentified)
  q.avoid = ids(raw.avoid)
  q.want = ids(raw.want).filter((id) => !q.avoid.includes(id))
  q.wantMode = raw.wantMode === 'any' ? 'any' : 'all'
  if (isObj(raw.thresholds)) {
    for (const k of WAYSTONE_LABEL_KEYS) {
      const n = num(raw.thresholds[k], 999)
      if (n > 0) q.thresholds[k] = n
    }
  }
  return q
}

export function normalizeTabletQuery(raw: unknown): TabletQuery {
  const q = emptyTabletQuery()
  if (!isObj(raw)) return q
  q.types = pick(TABLET_TYPES, raw.types)
  q.usesMin = num(raw.usesMin, TABLET_USES_MAX)
  q.rarity = pick(POE2_RARITIES, raw.rarity)
  q.avoid = ids(raw.avoid)
  q.want = ids(raw.want).filter((id) => !q.avoid.includes(id))
  q.wantMode = raw.wantMode === 'any' ? 'any' : 'all'
  return q
}

export function normalizePoe2VendorQuery(raw: unknown): Poe2VendorQuery {
  const q = emptyPoe2VendorQuery()
  if (!isObj(raw)) return q
  if (isObj(raw.mods)) {
    for (const k of POE2_VENDOR_KEYS) {
      const n = num(raw.mods[k], 999)
      if (n > 0) q.mods[k] = n
    }
  }
  q.itemClass = POE2_ITEM_CLASSES.find((c) => c === raw.itemClass) ?? ''
  q.rarity = pick(POE2_RARITIES, raw.rarity)
  q.sockets = num(raw.sockets, POE2_SOCKETS_MAX)
  q.quality = num(raw.quality, 30)
  q.mode = raw.mode === 'all' ? 'all' : 'any'
  return q
}

const PAGES: readonly Poe2RegexPage[] = ['waystone', 'tablet', 'vendor', 'library']

export function defaultPoe2Prefs(): Poe2RegexPrefs {
  return { page: 'waystone', waystone: emptyWaystoneQuery(), tablet: emptyTabletQuery(), vendor: emptyPoe2VendorQuery() }
}

export function emptyPoe2State(): Poe2RegexState {
  return { version: 1, prefs: defaultPoe2Prefs(), profiles: [] }
}

function normalizePrefs(raw: unknown): Poe2RegexPrefs {
  const p = defaultPoe2Prefs()
  if (!isObj(raw)) return p
  p.page = PAGES.find((x) => x === raw.page) ?? 'waystone'
  p.waystone = normalizeWaystoneQuery(raw.waystone)
  p.tablet = normalizeTabletQuery(raw.tablet)
  p.vendor = normalizePoe2VendorQuery(raw.vendor)
  return p
}

/** Профиль из файла или от renderer → валидный или null (пустое имя, чужой вид). */
export function sanitizeProfile(raw: unknown, fallbackId: () => string): Poe2Profile | null {
  if (!isObj(raw)) return null
  const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, PROFILE_NAME_MAX) : ''
  if (!name) return null
  const id = typeof raw.id === 'string' && raw.id && raw.id.length <= 64 ? raw.id : fallbackId()
  if (raw.kind === 'waystone') return { id, name, kind: 'waystone', waystone: normalizeWaystoneQuery(raw.waystone) }
  if (raw.kind === 'tablet') return { id, name, kind: 'tablet', tablet: normalizeTabletQuery(raw.tablet) }
  return null
}

/** Любые данные файла → валидное состояние (битый файл → пустое). */
export function normalizePoe2State(raw: unknown, newId: () => string): Poe2RegexState {
  if (!isObj(raw)) return emptyPoe2State()
  const seen = new Set<string>()
  const profiles: Poe2Profile[] = []
  for (const r of Array.isArray(raw.profiles) ? raw.profiles : []) {
    const p = sanitizeProfile(r, newId)
    if (!p) continue
    if (seen.has(p.id)) p.id = newId()
    seen.add(p.id)
    profiles.push(p)
    if (profiles.length >= PROFILES_MAX) break
  }
  return { version: 1, prefs: normalizePrefs(raw.prefs), profiles }
}

export function patchPoe2Prefs(state: Poe2RegexState, patch: Partial<Poe2RegexPrefs>): Poe2RegexState {
  return { ...state, prefs: normalizePrefs({ ...state.prefs, ...patch }) }
}

/** Добавить (нет id) или изменить профиль; больше PROFILES_MAX не добавляем. */
export function upsertProfile(state: Poe2RegexState, input: Poe2ProfileInput, newId: () => string): Poe2RegexState {
  const existing = input.id ? state.profiles.find((p) => p.id === input.id) : undefined
  const profile = sanitizeProfile({ ...input, id: existing?.id ?? newId() }, newId)
  if (!profile) return state
  if (existing) return { ...state, profiles: state.profiles.map((p) => (p.id === profile.id ? profile : p)) }
  if (state.profiles.length >= PROFILES_MAX) return state
  return { ...state, profiles: [...state.profiles, profile] }
}

export function removeProfile(state: Poe2RegexState, id: string): Poe2RegexState {
  return { ...state, profiles: state.profiles.filter((p) => p.id !== id) }
}

/** Строка поиска профиля для языка клиента данных. */
export function profileRegex(data: Poe2RegexData, p: Poe2Profile): RegexBuildResult {
  return p.kind === 'tablet'
    ? buildTabletRegex(data.tablet, p.tablet ?? emptyTabletQuery())
    : buildWaystoneRegex(data.waystone, p.waystone ?? emptyWaystoneQuery())
}

// ---------------------------------------------------------------------------
// «Цена по профилю»: тело запроса trade2 (формат — TradeRequest S47, src/shared/poe2/pricecheck/query/trade.ts)
// ---------------------------------------------------------------------------

/** Свойства путевого камня → фильтры trade2 (у «редкость монстров» и «эффективность» фильтра на сайте нет). */
const MAP_FILTERS: Partial<Record<WaystoneLabelKey, string>> = {
  packSize: 'map_packsize',
  magicMonsters: 'map_magic_monsters',
  rareMonsters: 'map_rare_monsters',
  dropChance: 'map_bonus',
  itemRarity: 'map_iir'
}

/** «Использований осталось» — псевдо-стат trade2 (как у EE2). */
const USES_STAT = 'pseudo.pseudo_number_of_uses_remaining'

interface StatFilter {
  id: string
  value?: { min?: number }
}
interface StatGroup {
  type: 'and' | 'not' | 'count'
  value?: { min?: number }
  filters: StatFilter[]
}

export interface Poe2TradeBody {
  query: {
    status: { option: 'available' }
    type?: string
    stats: StatGroup[]
    filters: Record<string, { filters: Record<string, unknown> }>
  }
  sort: { price: 'asc' }
}

export interface ProfileTradeQuery {
  body: Poe2TradeBody
  /** Что из профиля в запрос не попало (нет trade id у мода, нет фильтра свойства, несколько типов плиток). */
  skipped: string[]
}

/** trade id мода для поиска: explicit (обычный), у осквернённых — desecrated; implicit — у имплиситов плиток. */
function tradeIdOf(mod: Poe2RegexData['waystone']['mods'][number]): string | null {
  const list = mod.trade ?? []
  const prefer = mod.kind === 'desecrated' ? ['desecrated.', 'explicit.'] : ['explicit.', 'desecrated.', 'implicit.']
  for (const p of prefer) {
    const hit = list.find((id) => id.startsWith(p))
    if (hit) return hit
  }
  return null
}

function rarityFilter(rarity: string[]): Record<string, unknown> | null {
  const list = POE2_RARITIES.filter((r) => rarity.includes(r))
  // trade2 принимает одну редкость (или «nonunique»); несколько — без фильтра
  if (list.length === 1) return { rarity: { option: list[0] } }
  if (list.length === 3 && !list.includes('unique')) return { rarity: { option: 'nonunique' } }
  return null
}

/** Тело запроса trade2 по профилю. Статус всегда `available` (выкуп + онлайн), сортировка — цена по возрастанию. */
export function profileTradeQuery(data: Poe2RegexData, p: Poe2Profile): ProfileTradeQuery {
  const skipped: string[] = []
  const section = p.kind === 'tablet' ? data.tablet : data.waystone
  const q = p.kind === 'tablet' ? p.tablet ?? emptyTabletQuery() : p.waystone ?? emptyWaystoneQuery()
  const byId = new Map(section.mods.map((m) => [m.id, m]))
  const stats: StatGroup[] = []
  const tradeIds = (list: string[]): string[] => {
    const out: string[] = []
    for (const id of list) {
      const mod = byId.get(id)
      const t = mod ? tradeIdOf(mod) : null
      if (t) out.push(t)
      else skipped.push(`mod:${id}`)
    }
    return [...new Set(out)]
  }
  const want = tradeIds(q.want)
  const avoid = tradeIds(q.avoid)
  if (want.length) {
    stats.push(
      q.wantMode === 'any'
        ? { type: 'count', value: { min: 1 }, filters: want.map((id) => ({ id })) }
        : { type: 'and', filters: want.map((id) => ({ id })) }
    )
  }
  if (avoid.length) stats.push({ type: 'not', filters: avoid.map((id) => ({ id })) })

  const typeFilters: Record<string, unknown> = { category: { option: p.kind === 'tablet' ? 'map.tablet' : 'map.waystone' } }
  const rarity = rarityFilter(q.rarity)
  if (rarity) Object.assign(typeFilters, rarity)
  else if (q.rarity.length > 0 && q.rarity.length < POE2_RARITIES.length) skipped.push('rarity')
  const filters: Poe2TradeBody['query']['filters'] = { type_filters: { filters: typeFilters } }
  const body: Poe2TradeBody = { query: { status: { option: 'available' }, stats, filters }, sort: { price: 'asc' } }

  if (p.kind === 'tablet') {
    const t = p.tablet ?? emptyTabletQuery()
    if (t.types.length === 1) body.query.type = data.tablet.tradeType[t.types[0]]
    else if (t.types.length > 1) skipped.push('types')
    if (t.usesMin > 0) stats.push({ type: 'and', filters: [{ id: USES_STAT, value: { min: t.usesMin } }] })
  } else {
    const w = p.waystone ?? emptyWaystoneQuery()
    const map: Record<string, unknown> = {}
    if (w.tierMin > 0 || w.tierMax > 0) {
      const tier: { min?: number; max?: number } = {}
      if (w.tierMin > 0) tier.min = w.tierMin
      if (w.tierMax > 0) tier.max = w.tierMax
      map.map_tier = tier
    }
    for (const k of WAYSTONE_LABEL_KEYS) {
      const n = w.thresholds[k] ?? 0
      if (n <= 0) continue
      const f = MAP_FILTERS[k]
      if (f) map[f] = { min: n }
      else skipped.push(`threshold:${k}`)
    }
    if (Object.keys(map).length) filters.map_filters = { filters: map }
    const misc: Record<string, unknown> = {}
    if (w.corrupted !== 'any') misc.corrupted = { option: w.corrupted === 'only' ? 'true' : 'false' }
    if (w.unidentified !== 'any') misc.identified = { option: w.unidentified === 'only' ? 'false' : 'true' }
    if (Object.keys(misc).length) filters.misc_filters = { filters: misc }
  }
  return { body, skipped }
}

/** Проверка тела от renderer в main: только то, что строит profileTradeQuery, и статус `available`. */
export function isPoe2TradeBody(v: unknown): v is Poe2TradeBody {
  if (!isObj(v) || !isObj(v.query) || !isObj(v.sort)) return false
  const q = v.query
  if (!isObj(q.status) || q.status.option !== 'available') return false
  if (!Array.isArray(q.stats) || !isObj(q.filters)) return false
  const cat = isObj(q.filters.type_filters) && isObj(q.filters.type_filters.filters) ? q.filters.type_filters.filters.category : null
  return isObj(cat) && (cat.option === 'map.waystone' || cat.option === 'map.tablet')
}
