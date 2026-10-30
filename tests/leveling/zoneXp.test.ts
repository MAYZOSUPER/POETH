import { describe, expect, it } from 'vitest'
import {
  BEST_MAP_LEVEL,
  effectiveAreaLevel,
  highLevelDivisor,
  levelDiffMultiplier,
  safeZone,
  xpMultiplier,
  xpWhere,
  zoneXp
} from '@shared/leveling/zoneXp'

// Штраф опыта PoE 1 (S52). Контрольные значения посчитаны отдельно по формуле
// ((L + 5) / (L + 5 + d^2,5))^1,5, d — разница сверх 3 + floor(L / 16); примеры poedb для 24 уровня —
// 95 % / 52,5 % / 20 % от монстров 19 / 17 / 15.

describe('формула опыта', () => {
  it('безопасная разница на 1, 20, 50, 70, 90 уровнях', () => {
    expect([1, 20, 50, 70, 90].map(safeZone)).toEqual([3, 4, 6, 7, 8])
    expect(safeZone(15)).toBe(3)
    expect(safeZone(16)).toBe(4)
    expect(safeZone(95)).toBe(8)
    expect(safeZone(96)).toBe(9)
  })

  it('контрольные точки: 1, 20, 50, 70, 90', () => {
    const cases: [number, number, number][] = [
      [1, 1, 1],
      [1, 4, 1],
      [1, 5, 0.7936],
      [1, 8, 0.0627],
      [20, 15, 0.9429],
      [20, 13, 0.4834],
      [20, 26, 0.7364],
      [50, 44, 1],
      [50, 40, 0.5026],
      [70, 62, 0.9803],
      [70, 60, 0.7533],
      [90, 78, 0.3559], // 78 → 75,84: сверх ±8 — 6,16
      [90, 80, 0.4589], // 80 → 76,7: сверх — 5,3
      [90, 70, 0.064]
    ]
    for (const [player, area, mult] of cases) expect(levelDiffMultiplier(player, area), `${player} в ${area}`).toBeCloseTo(mult, 3)
  })

  it('примеры poedb (24 уровень)', () => {
    expect(levelDiffMultiplier(24, 19)).toBeCloseTo(0.9504, 3)
    expect(levelDiffMultiplier(24, 17)).toBeCloseTo(0.5245, 3)
    expect(levelDiffMultiplier(24, 15)).toBeCloseTo(0.1996, 3)
    expect(levelDiffMultiplier(24, 20)).toBe(1)
    expect(levelDiffMultiplier(24, 28)).toBe(1)
  })

  it('штраф одинаков для зоны ниже и выше', () => {
    expect(levelDiffMultiplier(50, 60)).toBeCloseTo(levelDiffMultiplier(50, 40), 10)
    expect(levelDiffMultiplier(20, 28)).toBeCloseTo(levelDiffMultiplier(20, 12), 10)
  })

  it('области выше 70 — уровень для формулы по таблице GGG, выше 84 — как 84', () => {
    expect(effectiveAreaLevel(45)).toBe(45)
    expect(effectiveAreaLevel(70)).toBe(70)
    expect(effectiveAreaLevel(71)).toBe(70.94)
    expect(effectiveAreaLevel(80)).toBe(76.7)
    expect(effectiveAreaLevel(83)).toBe(77.54)
    expect(effectiveAreaLevel(84)).toBe(77.7)
    expect(effectiveAreaLevel(86)).toBe(77.7)
    // 90 в T16 (83 → 77,54): разница 12,46, сверх 8 — 4,46
    expect(levelDiffMultiplier(90, 83)).toBeCloseTo(0.5774, 3)
    // 85 в T16: 85 − 77,54 = 7,46 — в пределах ±8, без штрафа
    expect(levelDiffMultiplier(85, 83)).toBe(1)
  })

  it('95+: делитель 1,065 … 1,4, минимум 1 %', () => {
    expect(highLevelDivisor(94)).toBe(1)
    expect(highLevelDivisor(95)).toBe(1.065)
    expect(highLevelDivisor(96)).toBe(1.115)
    expect(highLevelDivisor(97)).toBe(1.187)
    expect(highLevelDivisor(98)).toBe(1.2825)
    expect(highLevelDivisor(99)).toBe(1.4)
    expect(xpMultiplier(95, 83)).toBeCloseTo(levelDiffMultiplier(95, 83) / 1.065, 10)
    expect(xpMultiplier(99, 83)).toBeCloseTo(levelDiffMultiplier(99, 83) / 1.4, 10)
    expect(xpMultiplier(1, 30)).toBe(0.01)
    expect(xpMultiplier(99, 1)).toBe(0.01)
    expect(xpMultiplier(52, 52)).toBe(1)
  })
})

describe('строка «опыт в зоне»: где и с какого порога', () => {
  it('город, убежище, лабиринт, хабы — без строки', () => {
    for (const [id, lvl] of [
      ['1_3_town', 13],
      ['2_11_town', 69],
      ['HideoutSpace', 60],
      ['Labyrinth_Airlock', 33],
      ['1_Labyrinth_boss_3', 33],
      ['3_Labyrinth_C_straight', 68],
      ['EndGame_Labyrinth_C_quad', 75],
      ['HeistHub', 70],
      ['Delve_Main', 1]
    ] as const) {
      expect(xpWhere(id, lvl), id).toBeNull()
      expect(zoneXp(id, lvl, 90, false), id).toBeNull()
    }
    expect(xpWhere('1_2_1', 13)).toBe('campaign')
    expect(xpWhere('MapWorldsLair', 77)).toBe('map')
    expect(xpWhere('2_11_lake', 69)).toBe('endgame')
  })

  it('без штрафа строки нет', () => {
    expect(zoneXp('1_5_1', 45, 50, false)).toBeNull()
    expect(zoneXp('1_5_1', 45, 50, true)).toBeNull()
  })

  it('простой режим — только заметный штраф (от 10 %), экспертный — от 1 %', () => {
    // 52 в зоне 45: сверх ±6 — 1 уровень, −3 %
    expect(zoneXp('1_5_1', 45, 52, true)).toBeNull()
    expect(zoneXp('1_5_1', 45, 52, false)).toMatchObject({ kind: 'low', where: 'campaign', loss: 3, safe: 6, gap: -7 })
    // 52 в зоне 43: сверх — 3, −30 %
    expect(zoneXp('1_5_1', 43, 52, true)).toMatchObject({ kind: 'low', loss: 30 })
    // 20 в зоне 25 (на 5 выше): −6 % — в простом нет; 26 — −26 %, «опасно»
    expect(zoneXp('1_3_1', 25, 20, true)).toBeNull()
    expect(zoneXp('1_3_1', 25, 20, false)).toMatchObject({ kind: 'high', gap: 5, loss: 6 })
    expect(zoneXp('1_3_1', 26, 20, true)).toMatchObject({ kind: 'high', gap: 6, loss: 26 })
  })

  it('карты: та же строка по уровню карты, «лёгкая» — только если карта выше заметно лучше', () => {
    // 80 в T1 (68): −38 %, на T17 штрафа нет — советуем карты выше
    expect(zoneXp('MapWorldsLair', 68, 80, true)).toMatchObject({ kind: 'low', where: 'map', loss: 38 })
    // 90 в T16: −42 %, но выше почти некуда (T17 даёт +2 п.п.) — строки нет и в экспертном
    expect(zoneXp('MapWorldsLair', 83, 90, true)).toBeNull()
    expect(zoneXp('MapWorldsLair', 83, 90, false)).toBeNull()
    expect(levelDiffMultiplier(90, BEST_MAP_LEVEL)).toBeGreaterThan(levelDiffMultiplier(90, 83))
    // 90 в T1 — карты выше дадут много
    expect(zoneXp('MapWorldsLair', 68, 90, true)).toMatchObject({ kind: 'low', loss: 96 })
    // 68 в T16: на 15 уровней выше, «опасно» (по уровню для формулы 77,54 — сверх 7 на 2,54)
    expect(zoneXp('MapWorldsLair', 83, 68, true)).toMatchObject({ kind: 'high', gap: 15, effective: 77.54 })
    // 95+: итог с делителем
    const hi = zoneXp('MapWorldsLair', 68, 96, true)!
    expect(hi.divisor).toBe(1.115)
    expect(hi.mult).toBeCloseTo(xpMultiplier(96, 68), 10)
  })

  it('кампания пройдена — зона актов как эндгейм (не «дальше по маршруту»)', () => {
    expect(zoneXp('1_5_5', 43, 90, true)).toMatchObject({ where: 'campaign' })
    expect(zoneXp('1_5_5', 43, 90, true, true)).toMatchObject({ where: 'endgame', kind: 'low' })
    // выше — по-прежнему «опасно»
    expect(zoneXp('2_10_1', 64, 50, true, true)).toMatchObject({ kind: 'high', where: 'endgame' })
  })

  it('уровень 100 и мусор — без строки', () => {
    expect(zoneXp('MapWorldsLair', 68, 100, false)).toBeNull()
    expect(zoneXp('1_1_1', NaN, 10, false)).toBeNull()
    expect(zoneXp('1_1_1', 1, 0, false)).toBeNull()
  })
})
