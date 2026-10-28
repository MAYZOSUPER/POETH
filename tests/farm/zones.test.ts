import { describe, expect, it } from 'vitest'
import { classifyArea, isRunArea, mapTier, parseFarmLine, parseFarmText } from '@shared/farm/zones'

// Разбор строк Client.txt для трекера карт (S11b): вход в зону (язык-независимо), имя зоны и
// смерть игрока в EN и RU клиенте, вид зоны по id из настоящего Client.txt PoE1.

describe('parseFarmText — строки лога', () => {
  it('вход в зону: id, уровень, seed (одинаково в EN и RU клиенте)', () => {
    expect(parseFarmText('Generating level 83 area "MapWorldsLair" with seed 655576537')).toEqual({
      type: 'zone',
      zone: { areaId: 'MapWorldsLair', level: 83, seed: '655576537' }
    })
    // старый формат без seed
    expect(parseFarmText('Generating level 1 area "1_1_1"')).toEqual({
      type: 'zone',
      zone: { areaId: '1_1_1', level: 1, seed: '' }
    })
  })

  it('имя зоны: [SCENE] Set Source и «You have entered» / «Вы вошли в область»', () => {
    expect(parseFarmText('[SCENE] Set Source [Strand]')).toEqual({ type: 'areaName', name: 'Strand' })
    expect(parseFarmText('[SCENE] Set Source [(null)]')).toBeNull()
    expect(parseFarmText(": You have entered The Maven's Crucible.")).toEqual({
      type: 'areaName',
      name: "The Maven's Crucible"
    })
    expect(parseFarmText(': Вы вошли в область Гавань разбойников.')).toEqual({
      type: 'areaName',
      name: 'Гавань разбойников'
    })
  })

  it('смерть игрока: EN «has been slain», RU «был повержен» (и женский род)', () => {
    expect(parseFarmText(': Hero has been slain.')).toEqual({ type: 'death', player: 'Hero' })
    expect(parseFarmText(': Герой был повержен.')).toEqual({ type: 'death', player: 'Герой' })
    expect(parseFarmText(': Героиня была повержена.')).toEqual({ type: 'death', player: 'Героиня' })
  })

  it('чужие строки — не события трекера', () => {
    expect(parseFarmText('@From Buyer: Hero has been slain.')).toBeNull()
    expect(parseFarmText(': Hero (Assassin) is now level 52')).toBeNull()
    expect(parseFarmText(': Ally has joined the area.')).toBeNull()
    expect(parseFarmText('Tile hash: 1905386628')).toBeNull()
  })

  it('строка целиком: время из префикса (локальное)', () => {
    const p = parseFarmLine(
      '2026/10/28 21:01:00 74519981 1186a8a3 [DEBUG Client 19012] Generating level 83 area "MapWorldsStrand" with seed 111\r'
    )
    expect(p?.ts).toBe(new Date(2026, 9, 28, 21, 1, 0).getTime())
    expect(p?.event).toEqual({ type: 'zone', zone: { areaId: 'MapWorldsStrand', level: 83, seed: '111' } })
    expect(parseFarmLine('мусор')).toBeNull()
  })
})

describe('classifyArea — вид зоны по id (настоящий Client.txt PoE1)', () => {
  const cases: [string, number, string][] = [
    ['HideoutSpace', 60, 'hideout'],
    ['HideoutShapersRealm', 60, 'hideout'],
    ['1_1_town', 1, 'town'],
    ['2_11_endgame_town', 69, 'town'],
    ['HeistHub', 68, 'town'],
    ['Labyrinth_Airlock', 33, 'town'],
    ['DeepwaterHub', 1, 'town'],
    ['ChayulaLeague', 1, 'town'],
    ['1_1_1', 1, 'campaign'],
    ['2_7_5_map', 55, 'campaign'],
    ['2_Labyrinth_OH_branch', 55, 'other'],
    ['EndGame_Labyrinth_boss_1', 75, 'other'],
    ['MapWorldsLair', 77, 'map'],
    ['Synthesis_MapGuardian3', 83, 'map'],
    ['MavenHub', 73, 'other'],
    ['HeistBunker9', 83, 'other'],
    ['LegionLeague4', 82, 'other'],
    ['DeepwaterEncounter', 77, 'other']
  ]
  it.each(cases)('%s (ур. %i) → %s', (id, level, kind) => {
    expect(classifyArea(id, level)).toBe(kind)
  })

  it('забег идёт только в карте и прочем контенте', () => {
    expect(isRunArea('map')).toBe(true)
    expect(isRunArea('other')).toBe(true)
    expect(isRunArea('hideout')).toBe(false)
    expect(isRunArea('town')).toBe(false)
    expect(isRunArea('campaign')).toBe(false)
  })
})

describe('mapTier — ярус по уровню области', () => {
  it.each([
    [67, null],
    [68, 1],
    [76, 9],
    [83, 16],
    [84, 17],
    [90, 17]
  ])('%i → %s', (level, tier) => {
    expect(mapTier(level)).toBe(tier)
  })
})
