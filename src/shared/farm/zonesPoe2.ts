// Правила трекера карт для Path of Exile 2 (этап S69; чистый TS, без electron).
//
// Строки Client.txt PoE 2 — те же, что у PoE 1 (сверено по тестам журнала Exiled Exchange 2, MIT):
//  - вход в область `Generating level N area "<id>" with seed S` — служебная, одинакова в EN и RU;
//    после смерти игрок воскресает в том же экземпляре — та же строка с тем же seed;
//  - `[SCENE] Set Source [<имя>]`: `(null)` — загрузка, `(unknown)` — главное меню, `Act N` —
//    карта мира акта, `Atlas` — открыли устройство карт; остальное — имя области на языке клиента;
//  - смерть: PlayerSlain EN «{0} has been slain.», RU «{0} был повержен.»; PlayerSuicide EN
//    «{0} has committed suicide.», RU «{0} покончил с собой» (без точки) — тексты GGG из BackendErrors
//    (выгрузка LocalIdentity/poe2-data, кода оттуда нет). В PoE 2 смерть карту не закрывает.
// Ярус путевого камня = уровень области − 64: T1 = 65 … T16 = 80.
//
// Вид области — из данных (resources/data/poe2/farm/areas.json, собирает tools/farm/build-poe2-areas.mjs
// из RePoE PoE 2 world_areas; к 1.0 пересобрать — id поменяются). Id, которого в данных нет (новая
// область до пересборки), — по шаблонам ниже.

import type { FarmAreaKind } from '../types/farm'
import type { FarmRules } from './zones'

/** Подпапка данных PoE 2 и файл видов областей: resources/data/poe2/farm/areas.json (и userData/data/…). */
export const POE2_FARM_DIR = 'farm'
export const POE2_FARM_AREAS_FILE = 'areas.json'

const KINDS: readonly FarmAreaKind[] = ['hideout', 'town', 'campaign', 'map', 'sub', 'other']

/** Данные областей PoE 2 (areas.json). */
export interface Poe2FarmAreas {
  version: 1
  /** откуда и когда собрано — для пересборки к 1.0 */
  source: string
  /** id области по видам */
  kinds: Partial<Record<FarmAreaKind, string[]>>
  /** `[SCENE] Set Source [<имя>]` с этими именами — не область (меню, карта мира, устройство карт; EN и RU) */
  sceneIgnore: string[]
  /** ярус = уровень − base, от 1 до max (сейчас 64 и 16) */
  tier?: { base: number; max: number }
}

const DEFAULT_TIER = { base: 64, max: 16 }
/** Всегда не области: загрузка и главное меню. */
const SCENE_NOT_AREA = ['(null)', '(unknown)']

const SLAIN_POE2: readonly RegExp[] = [
  /^: (.+) has been slain\.$/,
  /^: (.+) has committed suicide\.$/,
  /^: (.+) был[аои]? поверж(?:ен|ена|ено|ены)\.$/,
  /^: (.+) покончил[аои]? с собой\.?$/
]

const ID_RE = /^[\w-]{1,80}$/
const NAME_MAX = 120

/** Прочитанный JSON → данные областей; битый файл — null (тогда только шаблоны). */
export function normalizePoe2FarmAreas(raw: unknown): Poe2FarmAreas | null {
  const x = raw as Partial<Poe2FarmAreas> | null
  if (!x || x.version !== 1 || !x.kinds || typeof x.kinds !== 'object') return null
  const kinds: Partial<Record<FarmAreaKind, string[]>> = {}
  for (const k of KINDS) {
    const ids = (x.kinds as Record<string, unknown>)[k]
    if (Array.isArray(ids)) kinds[k] = ids.filter((id): id is string => typeof id === 'string' && ID_RE.test(id))
  }
  const sceneIgnore = Array.isArray(x.sceneIgnore)
    ? x.sceneIgnore.filter((n): n is string => typeof n === 'string' && n.length > 0 && n.length <= NAME_MAX)
    : []
  const t = x.tier
  const tier =
    t && Number.isInteger(t.base) && Number.isInteger(t.max) && t.base > 0 && t.max > 0 && t.max <= 30
      ? { base: t.base, max: t.max }
      : undefined
  return { version: 1, source: typeof x.source === 'string' ? x.source.slice(0, 300) : '', kinds, sceneIgnore, ...(tier ? { tier } : {}) }
}

/**
 * Вид области, которой нет в данных (новая к 1.0, пока данные не пересобраны). Порядок важен:
 * `MapHideout*_Claimable` — карта (на атласе), а не убежище; кампания — `G<акт>_…` и интерлюдии `P<N>_…`.
 */
export function classifyPoe2Fallback(areaId: string, level: number): FarmAreaKind {
  if (/^(?:Hideout|PersonalHideout|GuildHideout)/.test(areaId)) return 'hideout'
  if (/_[Tt]own$/.test(areaId)) return 'town'
  if (/^(?:Abyss_Depths|ExpeditionSubArea_)/.test(areaId)) return 'sub'
  if (/^[GP]\d+_/.test(areaId)) return 'campaign'
  if (/^(?:Map|ExpeditionLogBook_)/.test(areaId)) return level >= 65 ? 'map' : 'campaign'
  return 'other'
}

/** Правила PoE 2; без данных — только шаблоны classifyPoe2Fallback. */
export function poe2FarmRules(data?: Poe2FarmAreas | null): FarmRules {
  const byId = new Map<string, FarmAreaKind>()
  for (const k of KINDS) for (const id of data?.kinds[k] ?? []) byId.set(id, k)
  const notArea = new Set([...SCENE_NOT_AREA, ...(data?.sceneIgnore ?? [])])
  const { base, max } = data?.tier ?? DEFAULT_TIER
  return {
    game: 'poe2',
    classify: (areaId, level) => byId.get(areaId) ?? classifyPoe2Fallback(areaId, level),
    tier: (level) => (Number.isFinite(level) && level > base ? Math.min(max, level - base) : null),
    slain: SLAIN_POE2,
    isAreaName: (name) => !notArea.has(name)
  }
}
