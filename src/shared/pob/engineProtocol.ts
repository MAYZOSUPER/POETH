// Протокол движка PoB (S44; чистый модуль: main src/main/pob/engine.ts, tests/pob/engineProtocol.test.ts).
// Движок — отдельный процесс LuaJIT с resources/pob/server.lua: запрос — строка JSON в stdin, ответ — строка
// «@poeth {json}» в stdout (прочий вывод PoB туда не попадает, но и он отбрасывается). Ответ движка — тоже
// недоверенные данные для main: здесь он собирается заново — только известные статы и конечные числа.

/** Префикс строки ответа движка (всё прочее в stdout — шум). */
export const ENGINE_PREFIX = '@poeth '
/** Строка запроса: XML этапа ≤ 3 МБ + текст предметов. Совпадает с MAX_LINE в server.lua (4 МБ) с запасом. */
export const ENGINE_MAX_REQUEST = 3.5 * 1024 * 1024
/** Строка ответа: статы и короткие поля — килобайты; больше — сбой протокола. */
export const ENGINE_MAX_REPLY = 256 * 1024
/** XML этапа (server.lua: MAX_XML). */
export const ENGINE_MAX_XML = 3 * 1024 * 1024
/** Текст одного предмета (server.lua: MAX_ITEM; исследование §11 — ≤ 16 КБ). */
export const ENGINE_MAX_ITEM = 16 * 1024
/** Вариантов слота за один запрос (кольца — 2; server.lua: MAX_OPTIONS). */
export const ENGINE_MAX_OPTIONS = 4

/** Слоты, которые сравнивает движок: экипировка без флаконов, самоцветов и Swap. */
export const ENGINE_SLOTS = ['Weapon 1', 'Weapon 2', 'Helmet', 'Body Armour', 'Gloves', 'Boots', 'Amulet', 'Ring 1', 'Ring 2', 'Belt'] as const
export type EngineSlot = (typeof ENGINE_SLOTS)[number]
const SLOT_SET: ReadonlySet<string> = new Set(ENGINE_SLOTS)
export const isEngineSlot = (s: unknown): s is EngineSlot => typeof s === 'string' && SLOT_SET.has(s)

/** Статы выхода PoB (env.player.output), которые возвращает server.lua (тот же список — STATS). */
export const ENGINE_STATS = [
  'FullDPS',
  'CombinedDPS',
  'TotalDPS',
  'TotalDot',
  'TotalEHP',
  'Life',
  'LifeUnreserved',
  'EnergyShield',
  'Mana',
  'Ward',
  'Armour',
  'Evasion',
  'Str',
  'Dex',
  'Int',
  'ReqStr',
  'ReqDex',
  'ReqInt',
  'FireResist',
  'ColdResist',
  'LightningResist',
  'ChaosResist',
  'FireResistOverCap',
  'ColdResistOverCap',
  'LightningResistOverCap',
  'ChaosResistOverCap',
  'FireResistMax',
  'ColdResistMax',
  'LightningResistMax',
  'ChaosResistMax',
  'EffectiveMovementSpeedMod',
  'EffectiveBlockChance',
  'EffectiveSpellSuppressionChance',
  'PhysicalMaximumHitTaken',
  'MinionCombinedDPS',
  'MinionTotalDPS'
] as const
export type EngineStat = (typeof ENGINE_STATS)[number]
export type EngineStats = Partial<Record<EngineStat, number>>

export interface EngineReady {
  ready: true
  /** последняя версия дерева в этом PoB (`3_29`) — в неё переводится билд */
  tree: string
  /** время старта внутри Lua (CPU, мс) и куча Lua (КБ) */
  ms: number
  mem: number
}

export type EngineErrorCode =
  | 'bad-input' // запрос не прошёл проверку в server.lua
  | 'build' // PoB не загрузил билд
  | 'item' // PoB не узнал предмет (база)
  | 'kind' // флакон, самоцвет — движок их не сравнивает
  | 'internal' // ошибка внутри PoB

export interface EngineOptionResult {
  ok: boolean
  /** не подходит для слота (PoB IsItemValidForSlot) */
  error?: 'slot'
  new?: EngineStats
}

export interface EngineCompareOk {
  ok: true
  base: EngineStats
  results: EngineOptionResult[]
  item: {
    base: string
    rarity: string
    /** требование уровня предмета (PoB) */
    reqLevel: number
    /** уровень персонажа в загруженном билде */
    level: number
    /** строки, которые PoB не понял (не учтены в расчёте) */
    unsupported: string[]
  }
}

export type EngineReply = { ok: false; error: EngineErrorCode; detail?: string } | { ok: true; [k: string]: unknown }

export interface EngineSelftest {
  socket: boolean
  lcurl: boolean
  ssl: boolean
  ffi: boolean
  cmodule: boolean
  popen: boolean
  execute: boolean
  write: boolean
  remove: boolean
  outside: boolean
  inside: boolean
}

// ---------------------------------------------------------------------------- проверка

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const STAT_LIMIT = 1e13

/** Строка stdout движка → объект ответа; шум и чужие строки — null. */
export function parseEngineLine(line: string): Record<string, unknown> | null {
  const s = line.replace(/\r$/, '')
  if (!s.startsWith(ENGINE_PREFIX) || s.length > ENGINE_MAX_REPLY) return null
  try {
    const v: unknown = JSON.parse(s.slice(ENGINE_PREFIX.length))
    return isObj(v) ? v : null
  } catch {
    return null
  }
}

export function cleanReady(v: Record<string, unknown>): EngineReady | null {
  if (v.ready !== true || typeof v.tree !== 'string' || !/^\d{1,2}_\d{1,3}$/.test(v.tree)) return null
  const n = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) && x >= 0 && x < 1e9 ? Math.round(x) : 0)
  return { ready: true, tree: v.tree, ms: n(v.ms), mem: n(v.mem) }
}

/** Статы: только известные имена и конечные числа в разумных пределах (пустой объект Lua приходит как []). */
export function cleanStats(v: unknown): EngineStats {
  const out: EngineStats = {}
  if (!isObj(v)) return out
  for (const k of ENGINE_STATS) {
    const x = v[k]
    if (typeof x === 'number' && Number.isFinite(x) && Math.abs(x) < STAT_LIMIT) out[k] = x
  }
  return out
}

const cleanText = (s: unknown, max: number): string =>
  typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/ {2,}/g, ' ').trim().slice(0, max) : ''

const ERRORS: ReadonlySet<string> = new Set<EngineErrorCode>(['bad-input', 'build', 'item', 'kind', 'internal'])

/** Ответ на compare: собирается заново; число вариантов — как в запросе (иначе сбой протокола → null). */
export function cleanCompareReply(v: Record<string, unknown>, options: number): EngineCompareOk | { ok: false; error: EngineErrorCode; detail?: string } | null {
  if (v.ok === false) {
    const error = typeof v.error === 'string' && ERRORS.has(v.error) ? (v.error as EngineErrorCode) : 'internal'
    const detail = cleanText(v.detail, 300)
    return detail ? { ok: false, error, detail } : { ok: false, error }
  }
  if (v.ok !== true || !Array.isArray(v.results) || v.results.length !== options || !isObj(v.item)) return null
  const results: EngineOptionResult[] = v.results.map((r) =>
    isObj(r) && r.ok === true ? { ok: true, new: cleanStats(r.new) } : { ok: false, error: 'slot' as const }
  )
  const it = v.item
  const num = (x: unknown, max: number): number => (typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= max ? Math.round(x) : 0)
  const unsupported = Array.isArray(it.unsupported) ? it.unsupported.slice(0, 20).map((s) => cleanText(s, 200)).filter(Boolean) : []
  return {
    ok: true,
    base: cleanStats(v.base),
    results,
    item: {
      base: cleanText(it.base, 100),
      rarity: cleanText(it.rarity, 16),
      reqLevel: num(it.reqLevel, 100),
      level: num(it.level, 100),
      unsupported
    }
  }
}

export function cleanSelftest(v: Record<string, unknown>): EngineSelftest | null {
  if (v.ok !== true) return null
  const keys: Array<keyof EngineSelftest> = ['socket', 'lcurl', 'ssl', 'ffi', 'cmodule', 'popen', 'execute', 'write', 'remove', 'outside', 'inside']
  const out = {} as EngineSelftest
  for (const k of keys) out[k] = v[k] === true
  return out
}

// ---------------------------------------------------------------------------- запрос

/**
 * Запрос → строка для stdin: JSON без символов вне ASCII (\uXXXX — в канале только ASCII, Windows-консоль и кодировки
 * не важны) и без управляющих (JSON.stringify их экранирует). Длиннее предела — null.
 */
export function encodeRequest(req: Record<string, unknown>): string | null {
  const s = JSON.stringify(req).replace(/[\u007f-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)
  return s.length > ENGINE_MAX_REQUEST ? null : s + '\n'
}
