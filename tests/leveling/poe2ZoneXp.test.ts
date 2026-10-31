import { afterEach, describe, expect, it } from 'vitest'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import {
  XP_RULES,
  levelDiffMultiplier,
  safeZoneFor,
  xpMultiplier,
  xpWhere,
  xpWherePoe2,
  zoneXp
} from '@shared/leveling/zoneXp'
import { leveling } from '../../src/renderer/src/i18n/dict/leveling'
import { zoneXpHintText } from '../../src/renderer/src/panels/zoneXpHintText'
import { LogTailer } from '../../src/main/services/logTailer'

// S64: штраф опыта PoE 2 — степень 1,3 (poe2wiki «Experience»), полоса без штрафа как в PoE 1 (не подтверждена),
// без поправок «уровень монстров ниже» и «95+». Подсказка компаса ZoneXpHint и уровень области из журнала.

const p2 = (L: number, A: number): number => levelDiffMultiplier(L, A, 'poe2')
const formula = (L: number, d: number, e: number): number => ((L + 5) / (L + 5 + d ** 2.5)) ** e

describe('правила PoE 2 — данные', () => {
  it('степень 1,3; полоса 3 + floor(L/16) помечена как не подтверждённая; без поправок PoE 1', () => {
    expect(XP_RULES.poe2.exponent).toBe(1.3)
    expect(XP_RULES.poe2.safeConfirmed).toBe(false)
    expect(XP_RULES.poe2.effective).toBeNull()
    expect(XP_RULES.poe2.highDivisor).toBeNull()
    expect(XP_RULES.poe2.bestMapLevel).toBe(80)
    expect(XP_RULES.poe1.exponent).toBe(1.5)
    expect(XP_RULES.poe1.safeConfirmed).toBe(true)
  })

  it('полоса без штрафа по уровню персонажа', () => {
    expect(safeZoneFor(15, 'poe2')).toBe(3)
    expect(safeZoneFor(20, 'poe2')).toBe(4)
    expect(safeZoneFor(80, 'poe2')).toBe(8)
  })
})

describe('множитель опыта PoE 2', () => {
  it('в полосе — 100 %, за ней — формула со степенью 1,3', () => {
    expect(p2(20, 16)).toBe(1)
    expect(p2(20, 24)).toBe(1)
    expect(p2(20, 12)).toBeCloseTo(formula(20, 4, 1.3), 10)
    expect(p2(20, 12)).toBeCloseTo(0.3425, 4)
    expect(p2(30, 20)).toBeCloseTo(0.1948, 4)
    expect(p2(20, 26)).toBeCloseTo(0.7671, 4)
  })

  it('штраф одинаков для зоны ниже и выше', () => {
    expect(p2(40, 30)).toBeCloseTo(p2(40, 50), 12)
  })

  it('PoE 2 режет мягче PoE 1 (1,3 против 1,5); PoE 1 — как в S52', () => {
    expect(levelDiffMultiplier(20, 12)).toBeCloseTo(formula(20, 4, 1.5), 10)
    expect(p2(20, 12)).toBeGreaterThan(levelDiffMultiplier(20, 12))
  })

  it('у высоких путевых камней уровень не понижается, делителя 95+ нет; минимум 1 %', () => {
    // 90 в области 80: PoE 2 — честная разница 10 (−2 сверх полосы 8)
    expect(p2(90, 80)).toBeCloseTo(formula(90, 2, 1.3), 10)
    expect(xpMultiplier(97, 80, 'poe2')).toBeCloseTo(p2(97, 80), 12)
    expect(xpMultiplier(97, 80)).toBeLessThan(levelDiffMultiplier(97, 80)) // у PoE 1 делитель есть
    expect(p2(90, 2)).toBe(0.01)
  })
})

describe('какие зоны PoE 2 считаем', () => {
  it.each([
    ['g1_town', 15, null],
    ['p1_town', 64, null],
    ['g_endgame_town', 65, null],
    ['g1_worldmap', 0, null],
    ['g4_ship', 1, null],
    ['hideoutfelled', 65, null],
    ['maphideoutfelled', 65, null],
    ['maphideoutfelled_claimable', 65, 'map'],
    ['g1_4', 4, 'campaign'],
    ['G1_13_1', 12, 'campaign'],
    ['p2_5', 56, 'campaign'],
    ['mapcrypt', 65, 'map'],
    ['mapuniquevault', 70, 'map'],
    ['sanctumfoyer_1_1', 65, 'endgame'],
    ['expeditionlogbook_1', 70, 'endgame']
  ])('%s (%i) → %s', (id, level, want) => {
    expect(xpWherePoe2(id, level)).toBe(want)
    expect(xpWhere(id, level, 'poe2')).toBe(want)
  })
})

describe('строка опыта PoE 2', () => {
  it('кампания: персонаж 20 в зоне 10 — «ниже», идите дальше; потеря по формуле', () => {
    const x = zoneXp('g1_11', 10, 20, true, false, 'poe2')
    expect(x).not.toBeNull()
    expect(x).toMatchObject({ kind: 'low', where: 'campaign', safe: 4, gap: -10, effective: 10, divisor: 1 })
    expect(x!.mult).toBeCloseTo(formula(20, 6, 1.3), 10)
    expect(x!.loss).toBe(Math.round((1 - formula(20, 6, 1.3)) * 100))
  })

  it('зона выше персонажа — «опасно»', () => {
    const x = zoneXp('g1_15', 15, 9, true, false, 'poe2')
    expect(x).toMatchObject({ kind: 'high', where: 'campaign', gap: 6 })
  })

  it('в полосе и в городе — строки нет', () => {
    expect(zoneXp('g1_4', 4, 7, false, false, 'poe2')).toBeNull()
    expect(zoneXp('g1_town', 15, 40, false, false, 'poe2')).toBeNull()
  })

  it('простой режим — только заметный штраф (от 10 %), экспертный — от 1 %', () => {
    // 20 в 15: −5 % — в простом не показываем
    expect(zoneXp('g1_12', 15, 20, true, false, 'poe2')).toBeNull()
    expect(zoneXp('g1_12', 15, 20, false, false, 'poe2')?.loss).toBe(5)
  })

  it('путевые камни: 80 в T1 (65) — «берите выше»; 90 в T16 (80) — строки нет (выше брать нечего)', () => {
    expect(zoneXp('mapcrypt', 65, 80, true, false, 'poe2')).toMatchObject({ kind: 'low', where: 'map' })
    expect(zoneXp('mapcrypt', 80, 90, false, false, 'poe2')).toBeNull()
  })

  it('кампания пройдена — зоны актов как эндгейм («слишком лёгкая», только если камень выше заметно лучше)', () => {
    expect(zoneXp('p1_1', 54, 70, true, true, 'poe2')?.where).toBe('endgame')
    // 60 в зоне 10: опыт режут и лучшие камни ниже 10 п. п. разницы — совет бесполезен, строки нет
    expect(zoneXp('g1_11', 10, 60, true, true, 'poe2')).toBeNull()
  })
})

describe('текст подсказки ZoneXpHint (настоящий словарь)', () => {
  const tFor =
    (lang: 'ru' | 'en') =>
    (key: string, params?: Record<string, string | number>): string => {
      const s = leveling[lang][key]
      expect(s, key).toBeTypeOf('string')
      return Object.entries(params ?? {}).reduce((acc, [k, v]) => acc.replace(`{${k}}`, String(v)), s as string)
    }

  it('RU: «Эта зона даёт ~N % опыта — идите дальше по маршруту», в подробностях — «не подтверждено»', () => {
    const x = zoneXp('g1_11', 10, 20, false, false, 'poe2')!
    const n = Math.round(x.mult * 100)
    const { main, extra } = zoneXpHintText(x, tFor('ru'), 'ru', 'poe2')
    expect(main).toBe(`Эта зона даёт ~${n} % опыта — зона слишком лёгкая, идите дальше по маршруту`)
    expect(extra).toBe('Зона 10 · вы 20 · без штрафа ±4 · полоса без штрафа в PoE 2 не подтверждена')
  })

  it('EN, путевой камень и «выше вас»', () => {
    const low = zoneXp('mapcrypt', 65, 80, true, false, 'poe2')!
    expect(zoneXpHintText(low, tFor('en'), 'en', 'poe2').main).toBe(
      `This zone gives ~${Math.round(low.mult * 100)}% XP — run higher waystones`
    )
    const high = zoneXp('g1_15', 15, 9, true, false, 'poe2')!
    expect(zoneXpHintText(high, tFor('ru'), 'ru', 'poe2').main).toMatch(/— зона на 6 уровней выше, опасно$/)
  })
})

describe('уровень области из журнала (компас PoE 2)', () => {
  const tailers: LogTailer[] = []
  afterEach(() => {
    for (const t of tailers.splice(0)) t.stop()
  })

  it('строка «Generating level N area» даёт areaLevel в событии зоны и в статусе; id — как раньше', async () => {
    const P = '2026/10/31 21:40:00 123456 abcd [INFO Client 4242]'
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'poeth-zxp-'))
    const file = path.join(dir, 'Client.txt')
    await fs.writeFile(file, [`${P} Generating level 12 area "G1_11" with seed 1`, `${P} : Hero (Mercenary) is now level 20`, ''].join('\n'))
    const t = new LogTailer()
    tailers.push(t)
    const zones: { areaId?: string; areaLevel?: number }[] = []
    t.on('zone', (e: { areaId?: string; areaLevel?: number }) => zones.push({ areaId: e.areaId, areaLevel: e.areaLevel }))
    const status = await t.start(file)
    expect(status).toMatchObject({ areaId: 'g1_11', areaLevel: 12, level: 20 })
    expect(zones).toEqual([{ areaId: 'g1_11', areaLevel: 12 }])
    t.stop()
    await fs.rm(dir, { recursive: true, force: true })
  })
})
