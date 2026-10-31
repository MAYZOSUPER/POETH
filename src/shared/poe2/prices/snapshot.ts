// Цены PoE 2 (S67): снимок poe.ninja в пакете данных PoE 2.
//
// Откуда: CI (.github/workflows/data.yml, публикация пакета PoE 2) запускает tools/data/ninja-snapshot-poe2.mjs —
// к poe.ninja ходит GitHub Actions, а не приложение (poe.ninja просит десктоп-приложения ходить через свой
// бэкенд). Снимок лежит в resources/data/poe2/prices/ (встроенный) и приходит обновлением пакета данных без
// переустановки (S12): userData/data/poe2/prices/ — надстройка, читать сначала её, потом встроенный.
//
// Файлы:
//   prices/index.json      {v: 1, source: 'poe.ninja', at, leagues: [{league, file, at, lines}]}
//                          лиги — в порядке poe.ninja: первой идёт текущая временная лига; хардкора по умолчанию нет
//   prices/<file>          снимок лиги (file = leagueFile(league): «Runes of Aldur» → Runes_20of_20Aldur.json):
//     {v: 1, source: 'poe.ninja', league, at,
//      primary: 'divine',                       — в чём цены (core.primary poe.ninja PoE 2)
//      rates: {exalted: 559.6, chaos: 9.47},    — сколько единиц валюты за одну primary
//      etags?: {<kind>: ETag},                  — для условных запросов CI, приложению не нужны
//      lines: [Poe2PriceLine]}
//
// Строка (Poe2PriceLine): имя — английское, как в игре и в данных EE2 (refName) — русское имя берите оттуда.
//   обмен валюты (kind из EXCHANGE_KINDS): {id: 'liquid-paranoia', name: 'Liquid Paranoia', kind: 'Delirium',
//     value: 0.005 (в primary), volume?: оборот в primary за период poe.ninja, change?: % за неделю}
//   уники (kind из UNIQUE_KINDS): {id: 'mageblood-utility-belt', name: 'Mageblood', base: 'Utility Belt',
//     kind: 'UniqueAccessories', value, listings: лотов, variant?, corrupted?, change?}
//
// Чтение: loadPoe2Prices (load.ts) → Poe2PriceTable (table.ts): цена по имени/id в divine, exalted, chaos и флаг
// «мало данных». Всё из файлов — недоверенные данные (пакет приходит из сети): проверяется и обрезается здесь.

export const POE2_PRICES_VERSION = 1
/** Папка снимка внутри данных PoE 2 (resources/data/poe2/<…>, userData/data/poe2/<…>). */
export const POE2_PRICES_DIR = 'prices'
export const POE2_PRICES_INDEX = `${POE2_PRICES_DIR}/index.json`

/** Типы обмена валюты poe.ninja PoE 2 (exchange overview). */
export const EXCHANGE_KINDS = [
  'Currency',
  'Fragments',
  'Abyss',
  'UncutGems',
  'LineageSupportGems',
  'Essences',
  'SoulCores',
  'Idols',
  'Runes',
  'Ritual',
  'Expedition',
  'Delirium',
  'Breach',
  'Verisium'
] as const
/** Типы уников poe.ninja PoE 2 (stash item overview). */
export const UNIQUE_KINDS = [
  'UniqueWeapons',
  'UniqueArmours',
  'UniqueAccessories',
  'UniqueFlasks',
  'UniqueCharms',
  'UniqueJewels',
  'UniqueSanctumRelics',
  'UniqueTablets',
  'PrecursorTablets'
] as const
export type Poe2ExchangeKind = (typeof EXCHANGE_KINDS)[number]
export type Poe2UniqueKind = (typeof UNIQUE_KINDS)[number]
export type Poe2PriceKind = Poe2ExchangeKind | Poe2UniqueKind

/** Удобные группы для потребителей: эмоции («Вложение»), руны, камни, валюта. */
export const KIND_GROUPS = {
  /** дистиллированные эмоции (Delirium) — рецепты вложения */
  emotions: ['Delirium'],
  runes: ['Runes'],
  gems: ['UncutGems', 'LineageSupportGems'],
  currency: ['Currency'],
  omens: ['Ritual'],
  uniques: UNIQUE_KINDS
} as const satisfies Record<string, readonly Poe2PriceKind[]>

export interface Poe2PriceLine {
  /** id poe.ninja: у обмена — id валюты («divine», «liquid-paranoia»), у уников — detailsId */
  id: string
  /** английское имя (как refName в данных EE2) */
  name: string
  kind: Poe2PriceKind
  /** цена в primary (divine) */
  value: number
  /** уники: база («Utility Belt», «Runeforged Shortbow») */
  base?: string
  variant?: string
  corrupted?: true
  /** уники: число лотов, по которым poe.ninja считает цену */
  listings?: number
  /** обмен: оборот в primary за период poe.ninja */
  volume?: number
  /** изменение цены за неделю, % */
  change?: number
}

export interface Poe2PriceSnapshot {
  v: 1
  source: 'poe.ninja'
  league: string
  /** когда CI снял цены (мс) */
  at: number
  /** в чём цены строк: 'divine' */
  primary: string
  /** сколько единиц валюты за одну primary: {exalted: 559.6, chaos: 9.47} */
  rates: Record<string, number>
  lines: Poe2PriceLine[]
}

export interface Poe2PriceIndexLeague {
  league: string
  file: string
  at: number
  lines: number
}

export interface Poe2PriceIndex {
  v: 1
  source: 'poe.ninja'
  at: number
  leagues: Poe2PriceIndexLeague[]
}

const MAX_LINES = 20_000
/** дороже — лот «для вида»; тот же предел — MAX_VALUE в tools/data/ninja-snapshot-poe2.mjs */
const MAX_VALUE = 1e6
const MAX_LEAGUES = 20
const KINDS: ReadonlySet<string> = new Set<string>([...EXCHANGE_KINDS, ...UNIQUE_KINDS])
const FILE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,150}\.json$/
const CURRENCY_ID = /^[a-z0-9-]{1,40}$/

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown, max = 200): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

/**
 * Имя файла лиги: латиница и цифры, остальное — «_код»; первая буква — латинская или цифра (путь пакета
 * данных). Тот же алгоритм — leagueFile() в tools/data/ninja-snapshot-poe2.mjs.
 */
export function leagueFile(league: string): string {
  const s = league.replace(/[^A-Za-z0-9]/g, (c) => `_${c.charCodeAt(0).toString(16)}`).slice(0, 120)
  return `${/^[A-Za-z0-9]/.test(s) ? '' : 'L'}${s}.json`
}

/** Хардкор-лига: «HC Runes of Aldur», «Hardcore». */
export function isHardcoreLeague(league: string): boolean {
  return /^(HC|SSF HC)\b/i.test(league) || /\bHardcore\b/i.test(league)
}

/** Софткор-пара хардкор-лиги: «HC Runes of Aldur» → «Runes of Aldur», «Hardcore» → «Standard». */
export function softcoreOf(league: string): string | null {
  if (/^hardcore$/i.test(league.trim())) return 'Standard'
  const m = /^(?:SSF\s+)?HC\s+(.+)$/i.exec(league.trim())
  return m ? m[1] : null
}

/** Частная лига: «Runes of Aldur (PL12345)» → «Runes of Aldur»; не частная — null. */
export function privateBaseOf(league: string): string | null {
  const m = /^(.+?)\s*\(PL\d+\)$/i.exec(league.trim())
  return m ? m[1] : null
}

/** Одна строка снимка; мусор — null. */
export function parsePriceLine(v: unknown): Poe2PriceLine | null {
  if (!isObj(v)) return null
  const id = str(v.id, 160)
  const name = str(v.name)
  const kind = str(v.kind, 40)
  const value = num(v.value)
  if (!id || !name || !kind || !KINDS.has(kind) || value === undefined || value <= 0 || value > MAX_VALUE) return null
  const line: Poe2PriceLine = { id, name, kind: kind as Poe2PriceKind, value }
  const base = str(v.base)
  if (base) line.base = base
  const variant = str(v.variant, 80)
  if (variant) line.variant = variant
  if (v.corrupted === true) line.corrupted = true
  const listings = num(v.listings)
  if (listings !== undefined && listings >= 0) line.listings = Math.round(listings)
  const volume = num(v.volume)
  if (volume !== undefined && volume >= 0) line.volume = volume
  const change = num(v.change)
  if (change !== undefined) line.change = change
  return line
}

/** Снимок лиги из файла; не тот формат — null (битые строки пропускаются). */
export function parsePoe2PriceSnapshot(raw: unknown): Poe2PriceSnapshot | null {
  if (!isObj(raw) || raw.v !== POE2_PRICES_VERSION) return null
  const league = str(raw.league, 100)
  const at = num(raw.at)
  const primary = str(raw.primary, 40)
  if (!league || at === undefined || at <= 0 || !primary || !CURRENCY_ID.test(primary) || !Array.isArray(raw.lines)) return null
  const rates: Record<string, number> = {}
  if (isObj(raw.rates)) {
    for (const [k, v] of Object.entries(raw.rates)) {
      const r = num(v)
      if (CURRENCY_ID.test(k) && r !== undefined && r > 0 && r < 1e7) rates[k] = r
    }
  }
  const lines: Poe2PriceLine[] = []
  for (const l of raw.lines.slice(0, MAX_LINES)) {
    const p = parsePriceLine(l)
    if (p) lines.push(p)
  }
  return { v: POE2_PRICES_VERSION, source: 'poe.ninja', league, at, primary, rates, lines }
}

/** prices/index.json; не тот формат — null. */
export function parsePoe2PriceIndex(raw: unknown): Poe2PriceIndex | null {
  if (!isObj(raw) || raw.v !== POE2_PRICES_VERSION || !Array.isArray(raw.leagues)) return null
  const at = num(raw.at)
  const leagues: Poe2PriceIndexLeague[] = []
  for (const l of raw.leagues.slice(0, MAX_LEAGUES)) {
    if (!isObj(l)) continue
    const league = str(l.league, 100)
    const file = str(l.file, 160)
    const lat = num(l.at)
    if (!league || !file || !FILE_RE.test(file) || lat === undefined) continue
    leagues.push({ league, file, at: lat, lines: Math.max(0, Math.round(num(l.lines) ?? 0)) })
  }
  return { v: POE2_PRICES_VERSION, source: 'poe.ninja', at: at ?? 0, leagues }
}

/**
 * Как цены нашлись для лиги игрока:
 *  - exact     — снимок этой лиги;
 *  - private   — частная лига «X (PL123)»: цены лиги X (имя без суффикса «(PL…)»);
 *  - softcore  — хардкор-лига без снимка: цены её софткор-пары («HC X» → «X», «Hardcore» → «Standard»; и частная
 *                «HC X (PL1)»);
 *  - current   — лиги нет в снимке ('auto', пусто, частная с другим именем): цены текущей временной лиги (первая
 *                в index.json).
 */
export type Poe2PriceMatch = 'exact' | 'private' | 'softcore' | 'current'

/** Какой снимок взять для лиги игрока (сравнение без учёта регистра); пустой index — null. */
export function pickLeague(index: Poe2PriceIndex, league: string | null | undefined): { entry: Poe2PriceIndexLeague; match: Poe2PriceMatch } | null {
  const find = (name: string): Poe2PriceIndexLeague | undefined =>
    index.leagues.find((l) => l.league.toLowerCase() === name.trim().toLowerCase())
  const want = (league ?? '').trim()
  if (want && want.toLowerCase() !== 'auto') {
    const exact = find(want)
    if (exact) return { entry: exact, match: 'exact' }
    // частная лига — по имени без «(PL…)», как хардкор — по софткор-паре
    const name = privateBaseOf(want) ?? want
    const parent = name !== want ? find(name) : undefined
    if (parent) return { entry: parent, match: 'private' }
    const sc = softcoreOf(name)
    const soft = sc ? find(sc) : undefined
    if (soft) return { entry: soft, match: 'softcore' }
  }
  const first = index.leagues[0]
  return first ? { entry: first, match: 'current' } : null
}
