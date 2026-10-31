// Штраф опыта за разницу уровней в PoE 1 (S52): строка «Зона 45 · вы 52 · опыт −38 %» в гиде прокачки и во
// вкладке «Кампания». Чистый модуль. Правило игры (своими словами, сверено 30.10.2026 по poedb.tw/us/Experience
// и официальному посту GGG о формуле опыта в 2.3.0, forum/view-thread/1693152):
//  - без штрафа — разница до 3 + floor(уровень / 16) (уровень 52 → ±6);
//  - сверх неё (d — лишние уровни) опыт умножается на ((L + 5) / (L + 5 + d^2,5))^1,5, штраф одинаков для зоны
//    ниже и выше персонажа;
//  - у областей выше 70 для этой формулы уровень монстров ниже настоящего (T16, 83 → 77,54): таблица GGG 70–84;
//  - с 95 уровня опыт ещё делится на 1,065 (95) … 1,4 (99) — с 3.1;
//  - меньше 1 % опыта не бывает.
// Уровень зоны — из строки генерации зоны журнала (уровень области), уровень персонажа — его собственные строки
// повышения уровня (в группе чужие не считаются — sync.ts).
//
// S64, PoE 2 — правила в XP_RULES.poe2 (данные: к 1.0 11.12 правятся здесь):
//  - степень 1,3 вместо 1,5 — poe2wiki «Experience» (формула ((L+5)/(L+5+d^2,5))^1,3, правка 08.09.2026);
//  - безопасная полоса НЕ ПОДТВЕРЖДЕНА: в вики полосы нет (таблицу «±3 — 100 %» там убрали как неточную 28.05.2026),
//    сторонние гайды пишут 3 + floor(L/16), как в PoE 1. Берём её (без полосы строка пугала бы «−47 %» уже при
//    разнице в 3 уровня), а в экспертной строке пишем «не подтверждено» — проверка в игре;
//  - поправок «уровень монстров ниже настоящего» и «делитель 95+» для PoE 2 не нашли — не применяем;
//  - лучшая область для опыта — путевой камень 16 (уровень области 80, патчноут 0.5.0);
//  - смерть в областях через устройство карт отнимает 10 % опыта уровня (вики) — в подсказку не входит.

import type { GameId } from '../games'
import { classifyArea } from '../farm/zones'
import { zoneKind } from './sync'

export interface XpRules {
  /** внешняя степень формулы: PoE 1 — 1,5, PoE 2 — 1,3 */
  exponent: number
  /** безопасная полоса: base + floor(уровень / per) */
  safe: { base: number; per: number }
  /** полоса подтверждена источником (PoE 2 — нет: экспертная строка «не подтверждено») */
  safeConfirmed: boolean
  /** уровень монстров для формулы у высоких областей (PoE 1, GGG 2.3.0); null — как есть */
  effective: Record<number, number> | null
  /** делитель опыта с 95 уровня; null — нет */
  highDivisor: Record<number, number> | null
  /** лучшая область для опыта в эндгейме (уровень) — для «берите выше» */
  bestMapLevel: number
}

/** Уровень монстров для формулы опыта у областей 70–84 (пост GGG к 2.3.0). */
const EFFECTIVE_AREA_LEVEL: Record<number, number> = {
  70: 70,
  71: 70.94,
  72: 71.82,
  73: 72.64,
  74: 73.4,
  75: 74.1,
  76: 74.74,
  77: 75.32,
  78: 75.84,
  79: 76.3,
  80: 76.7,
  81: 77.04,
  82: 77.32,
  83: 77.54,
  84: 77.7
}

/** Делитель опыта с 95 уровня (с 3.1). */
const HIGH_LEVEL_DIVISOR: Record<number, number> = { 95: 1.065, 96: 1.115, 97: 1.187, 98: 1.2825, 99: 1.4 }

export const XP_RULES: Record<GameId, XpRules> = {
  poe1: {
    exponent: 1.5,
    safe: { base: 3, per: 16 },
    safeConfirmed: true,
    effective: EFFECTIVE_AREA_LEVEL,
    highDivisor: HIGH_LEVEL_DIVISOR,
    bestMapLevel: 84
  },
  poe2: {
    exponent: 1.3,
    safe: { base: 3, per: 16 },
    safeConfirmed: false,
    effective: null,
    highDivisor: null,
    bestMapLevel: 80
  }
}

const rules = (game: GameId): XpRules => XP_RULES[game] ?? XP_RULES.poe1

/** Меньше 1 % опыта игра не даёт. */
export const XP_MIN_MULT = 0.01
/** Самая высокая карта (T17) — лучшее, что можно взять в эндгейме PoE 1. */
export const BEST_MAP_LEVEL = XP_RULES.poe1.bestMapLevel

/** Простой режим: строка — только с заметным штрафом (% опыта за разницу уровней). */
export const SIMPLE_MIN_LOSS = 10
/** Экспертный режим: любой штраф от 1 %. */
export const EXPERT_MIN_LOSS = 1
/** В эндгейме «слишком лёгкая» — только если карта выше даст хотя бы столько процентных пунктов опыта. */
export const MAP_GAIN_MIN = 10

/** Разница уровней без штрафа в PoE 1: 3 + 1 за каждые полные 16 уровней персонажа (один аргумент — для .map). */
export function safeZone(playerLevel: number): number {
  return safeZoneFor(playerLevel, 'poe1')
}

/** Разница уровней без штрафа по правилам игры (у PoE 2 — допущение, см. XP_RULES.poe2.safeConfirmed). */
export function safeZoneFor(playerLevel: number, game: GameId): number {
  const s = rules(game).safe
  return s.base + Math.floor(playerLevel / s.per)
}

/** Уровень монстров области для формулы опыта: у PoE 1 выше 70 — ниже настоящего; выше 84 данных нет — как у 84. */
export function effectiveAreaLevel(areaLevel: number, game: GameId = 'poe1'): number {
  const table = rules(game).effective
  if (!table || areaLevel <= 70) return areaLevel
  const keys = Object.keys(table).map(Number)
  return table[Math.min(Math.round(areaLevel), Math.max(...keys))] ?? areaLevel
}

/** Множитель опыта только за разницу уровней (без поправки 95+), не меньше 1 %. */
export function levelDiffMultiplier(playerLevel: number, areaLevel: number, game: GameId = 'poe1'): number {
  const d = Math.max(0, Math.abs(playerLevel - effectiveAreaLevel(areaLevel, game)) - safeZoneFor(playerLevel, game))
  if (d === 0) return 1
  return Math.max(XP_MIN_MULT, ((playerLevel + 5) / (playerLevel + 5 + d ** 2.5)) ** rules(game).exponent)
}

/** Делитель опыта персонажа 95+ (1 — ниже 95 или у игры такой поправки нет). */
export function highLevelDivisor(playerLevel: number, game: GameId = 'poe1'): number {
  const table = rules(game).highDivisor
  return table && playerLevel >= 95 ? (table[Math.min(99, Math.floor(playerLevel))] ?? 1) : 1
}

/** Итоговый множитель опыта: разница уровней, поправка 95+, минимум 1 %. */
export function xpMultiplier(playerLevel: number, areaLevel: number, game: GameId = 'poe1'): number {
  return Math.max(XP_MIN_MULT, levelDiffMultiplier(playerLevel, areaLevel, game) / highLevelDivisor(playerLevel, game))
}

/** Куда советовать при «слишком лёгкой» зоне: дальше по маршруту, карты выше или просто «лёгкая». */
export type ZoneXpWhere = 'campaign' | 'map' | 'endgame'

export interface ZoneXp {
  areaLevel: number
  playerLevel: number
  /** зона ниже персонажа (опыт режется, «идите дальше») или выше («опасно») — по уровню для формулы */
  kind: 'low' | 'high'
  where: ZoneXpWhere
  /** насколько зона выше персонажа по уровню области (для «на N уровней выше») */
  gap: number
  /** без штрафа: ±safe */
  safe: number
  /** уровень монстров для формулы (у карт выше 70 — ниже настоящего) */
  effective: number
  /** итоговый множитель опыта */
  mult: number
  /** −% опыта (итог, округлено) */
  loss: number
  /** делитель 95+ (1 — нет) */
  divisor: number
}

/**
 * Зона PoE 2 по id области из журнала (`Generating level N area "<id>"`; компас хранит id строчными):
 * города (`G1_town`, `P1_Town`, `G_Endgame_Town`) и убежища (`Hideout…`, `MapHideout…` без `_Claimable`) — без строки;
 * кампания и интерлюдии (`G1_2`, `P2_5`) — 'campaign'; путевые камни (`Map…`, в т. ч. уникальные карты и
 * захватываемые убежища `…_Claimable`) — 'map'; прочие области эндгейма (Sanctum, Expedition, Delirium…) — 'endgame'.
 * Имена id — RePoE fork poe2 world_areas (0.5.5).
 */
export function xpWherePoe2(areaId: string, areaLevel: number): ZoneXpWhere | null {
  if (areaLevel <= 1) return null
  const id = areaId.toLowerCase()
  if (/(^|_)town$/.test(id) || id === 'g_endgame_town' || /worldmap$/.test(id) || id === 'g_login') return null
  if (id.startsWith('hideout') || (/^maphideout/.test(id) && !id.endsWith('_claimable'))) return null
  if (/^[gp]\d/.test(id)) return 'campaign'
  if (id.startsWith('map')) return 'map'
  return 'endgame'
}

/** Зона для строки опыта: кампания, карта, эндгейм; не город, убежище, лабиринт и прочие хабы. */
export function xpWhere(areaId: string, areaLevel: number, game: GameId = 'poe1'): ZoneXpWhere | null {
  if (game === 'poe2') return xpWherePoe2(areaId, areaLevel)
  if (areaLevel <= 1 || /Labyrinth/.test(areaId)) return null
  const k = classifyArea(areaId, areaLevel)
  if (k === 'town' || k === 'hideout') return null
  const kind = zoneKind(areaId, areaLevel)
  return kind === 'campaign' || kind === 'map' || kind === 'endgame' ? kind : null
}

/**
 * Строка «опыт в этой зоне» или null — штрафа нет (или он не заметен в простом режиме). В эндгейме «слишком
 * лёгкая» — только если карта выше заметно лучше: с ~86 уровня опыт режут все карты, и совет «берите выше»
 * бесполезен. Кампания пройдена — зона актов как эндгейм: «дальше по маршруту» уже некуда.
 */
export function zoneXp(
  areaId: string,
  areaLevel: number,
  playerLevel: number,
  simple: boolean,
  campaignDone = false,
  game: GameId = 'poe1'
): ZoneXp | null {
  if (!Number.isFinite(areaLevel) || !Number.isFinite(playerLevel) || playerLevel < 1 || playerLevel >= 100) return null
  const zone = xpWhere(areaId, areaLevel, game)
  if (!zone) return null
  const where = zone === 'campaign' && campaignDone ? 'endgame' : zone
  const diff = levelDiffMultiplier(playerLevel, areaLevel, game)
  if ((1 - diff) * 100 < (simple ? SIMPLE_MIN_LOSS : EXPERT_MIN_LOSS)) return null
  const effective = effectiveAreaLevel(areaLevel, game)
  const kind = effective > playerLevel ? 'high' : 'low'
  const best = rules(game).bestMapLevel
  if (kind === 'low' && where !== 'campaign' && (levelDiffMultiplier(playerLevel, best, game) - diff) * 100 < MAP_GAIN_MIN) return null
  const mult = xpMultiplier(playerLevel, areaLevel, game)
  return {
    areaLevel,
    playerLevel,
    kind,
    where,
    gap: areaLevel - playerLevel,
    safe: safeZoneFor(playerLevel, game),
    effective,
    mult,
    loss: Math.round((1 - mult) * 100),
    divisor: highLevelDivisor(playerLevel, game)
  }
}
