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

import { classifyArea } from '../farm/zones'
import { zoneKind } from './sync'

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
const EFFECTIVE_MAX_LEVEL = 84

/** Делитель опыта с 95 уровня (с 3.1). */
const HIGH_LEVEL_DIVISOR: Record<number, number> = { 95: 1.065, 96: 1.115, 97: 1.187, 98: 1.2825, 99: 1.4 }

/** Меньше 1 % опыта игра не даёт. */
export const XP_MIN_MULT = 0.01
/** Самая высокая карта (T17) — лучшее, что можно взять в эндгейме. */
export const BEST_MAP_LEVEL = 84

/** Простой режим: строка — только с заметным штрафом (% опыта за разницу уровней). */
export const SIMPLE_MIN_LOSS = 10
/** Экспертный режим: любой штраф от 1 %. */
export const EXPERT_MIN_LOSS = 1
/** В эндгейме «слишком лёгкая» — только если карта выше даст хотя бы столько процентных пунктов опыта. */
export const MAP_GAIN_MIN = 10

/** Разница уровней без штрафа: 3 + 1 за каждые полные 16 уровней персонажа. */
export function safeZone(playerLevel: number): number {
  return 3 + Math.floor(playerLevel / 16)
}

/** Уровень монстров области для формулы опыта: выше 70 — ниже настоящего; выше 84 данных нет — как у 84. */
export function effectiveAreaLevel(areaLevel: number): number {
  if (areaLevel <= 70) return areaLevel
  return EFFECTIVE_AREA_LEVEL[Math.min(Math.round(areaLevel), EFFECTIVE_MAX_LEVEL)] ?? areaLevel
}

/** Множитель опыта только за разницу уровней (без поправки 95+), не меньше 1 %. */
export function levelDiffMultiplier(playerLevel: number, areaLevel: number): number {
  const d = Math.max(0, Math.abs(playerLevel - effectiveAreaLevel(areaLevel)) - safeZone(playerLevel))
  if (d === 0) return 1
  return Math.max(XP_MIN_MULT, ((playerLevel + 5) / (playerLevel + 5 + d ** 2.5)) ** 1.5)
}

/** Делитель опыта персонажа 95+ (1 — ниже 95). */
export function highLevelDivisor(playerLevel: number): number {
  return playerLevel >= 95 ? HIGH_LEVEL_DIVISOR[Math.min(99, Math.floor(playerLevel))] : 1
}

/** Итоговый множитель опыта: разница уровней, поправка 95+, минимум 1 %. */
export function xpMultiplier(playerLevel: number, areaLevel: number): number {
  return Math.max(XP_MIN_MULT, levelDiffMultiplier(playerLevel, areaLevel) / highLevelDivisor(playerLevel))
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

/** Зона для строки опыта: кампания, карта, эндгейм; не город, убежище, лабиринт и прочие хабы. */
export function xpWhere(areaId: string, areaLevel: number): ZoneXpWhere | null {
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
export function zoneXp(areaId: string, areaLevel: number, playerLevel: number, simple: boolean, campaignDone = false): ZoneXp | null {
  if (!Number.isFinite(areaLevel) || !Number.isFinite(playerLevel) || playerLevel < 1 || playerLevel >= 100) return null
  const zone = xpWhere(areaId, areaLevel)
  if (!zone) return null
  const where = zone === 'campaign' && campaignDone ? 'endgame' : zone
  const diff = levelDiffMultiplier(playerLevel, areaLevel)
  if ((1 - diff) * 100 < (simple ? SIMPLE_MIN_LOSS : EXPERT_MIN_LOSS)) return null
  const effective = effectiveAreaLevel(areaLevel)
  const kind = effective > playerLevel ? 'high' : 'low'
  if (kind === 'low' && where !== 'campaign' && (levelDiffMultiplier(playerLevel, BEST_MAP_LEVEL) - diff) * 100 < MAP_GAIN_MIN) return null
  const mult = xpMultiplier(playerLevel, areaLevel)
  return {
    areaLevel,
    playerLevel,
    kind,
    where,
    gap: areaLevel - playerLevel,
    safe: safeZone(playerLevel),
    effective,
    mult,
    loss: Math.round((1 - mult) * 100),
    divisor: highLevelDivisor(playerLevel)
  }
}
