import { resolve } from 'path'
import { pathToFileURL } from 'url'
import { describe, expect, it } from 'vitest'
import { NODE_FLAG, findAscendancy, findGem, parsePoe2Gems, parsePoe2Tree } from '@shared/poe2/build/data'
import { gems, pob2, tree } from './helpers'

// генераторы — чистые функции .mjs (как tests/build-data/generator.test.ts)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any
const load = (file: string): Promise<Any> => import(pathToFileURL(resolve(__dirname, '../../tools/build-data/poe2', file)).href)

// Данные «Билда» PoE 2 (S66): resources/data/poe2/build/{tree,gems}.json из выгрузки дерева GGG 0.5.5 и RePoE PoE 2.
// После пересборки под 1.0 известные id и числа ниже могут поменяться — поправить ожидания (README генератора).

describe('tree.json', () => {
  it('ноды с id, классы, старты, акты', () => {
    expect(tree.meta.tree).toBe('0.5.5')
    expect(tree.nodes.size).toBeGreaterThan(4000)
    const ids = new Set([...tree.nodes.values()].map((n) => n.id))
    expect(ids.size).toBeGreaterThan(4000)
    // пример из документации GGG: strength89, melee17, jewel_slot1956, AscendancyWarrior1Small3
    for (const id of ['strength89', 'melee17', 'jewel_slot1956', 'AscendancyWarrior1Small3']) expect(ids.has(id)).toBe(true)
    expect(tree.classes[8].name).toBe('Huntress')
    expect(findAscendancy(tree, 'Huntress1')).toMatchObject({ en: 'Amazon', ru: 'Амазонка', className: 'Huntress' })
    expect(findAscendancy(tree, 'Warrior1')).toMatchObject({ en: 'Titan', ru: 'Титан' })
    // у PoE 2 одна стартовая нода на два класса
    expect(tree.starts.get(2)).toBe(tree.starts.get(8))
    for (const h of tree.starts.values()) expect((tree.nodes.get(h)?.flags ?? 0) & NODE_FLAG.classStart).toBeTruthy()
    expect(tree.acts.map((a) => a.act)).toEqual([1, 2, 3, 4])
    expect(tree.acts[0]).toEqual({ act: 1, from: 1, to: 15 })
    expect(tree.interlude).toEqual({ from: 54, to: 56 })
    expect(tree.maps).toBe(65)
  })

  it('соседи — в обе стороны', () => {
    const n = tree.nodes.get(4)
    expect(n?.id).toBe('lightning14')
    for (const h of n?.near ?? []) expect(tree.nodes.get(h)?.near).toContain(4)
  })

  it('ноды фикстур есть в данных (кроме единиц из старых версий дерева)', () => {
    for (const name of ['amazon', 'stormweaver', 'pathfinder']) {
      const nodes = pob2(name).specs[0].nodes
      const missing = nodes.filter((h) => !tree.nodes.has(h))
      expect(missing.length, name).toBeLessThanOrEqual(2)
    }
  })

  it('чужой формат и мусор отвергаются', () => {
    expect(parsePoe2Tree(null)).toBeNull()
    expect(parsePoe2Tree({ v: 2, nodes: [], classes: [] })).toBeNull()
    expect(parsePoe2Tree({ v: 1, nodes: [[1, '../x', '', 0, 0, []]], classes: [] })).toBeNull()
    const t = parsePoe2Tree({ v: 1, nodes: [[1, 'a1', 'A', 1, 'X1', [2]], [2, 'b2', '', 0, 0, []]], classes: [['Cls', [['X1', 'Asc', 'Восх']]]], acts: [[1, 1, 10], [2, 0, 5]] })
    expect(t?.nodes.get(2)?.near).toEqual([1])
    expect(t?.acts).toEqual([{ act: 1, from: 1, to: 10 }])
    expect(t?.maps).toBe(65)
  })
})

describe('gems.json', () => {
  it('камни умений, поддержки, мета; имена RU из EE2', () => {
    expect(gems.gems.size).toBeGreaterThan(900)
    expect(findGem(gems, 'Metadata/Items/Gems/SkillGemEarthquake')).toMatchObject({ en: 'Earthquake', ru: 'Землетрясение', kind: 'skill' })
    expect(findGem(gems, 'Metadata/Items/Gems/SupportGemFastForward')).toMatchObject({ kind: 'support' })
    // пример GGG: у части камней путь `Gem/`
    expect(findGem(gems, 'Metadata/Items/Gem/SupportGemTireless')).toMatchObject({ en: 'Tireless', kind: 'support' })
    // стандартная атака оружия — не камень
    expect(findGem(gems, 'Metadata/Items/Gem/SkillGemPlayerDefaultQuarterstaff')).toBeNull()
    expect([...gems.gems.values()].some((g) => g.kind === 'meta' && g.en === 'Cast on Critical')).toBe(true)
  })

  it('камни фикстур узнаются (кроме атак оружия и единиц из старых версий)', () => {
    for (const name of ['amazon', 'stormweaver', 'pathfinder']) {
      const all = pob2(name).skillSets.flatMap((s) => s.groups.flatMap((g) => g.gems))
      const missing = all.filter((g) => g.gemId && !/PlayerDefault/.test(g.gemId) && !findGem(gems, g.gemId))
      expect(missing.length, `${name}: ${missing.map((g) => g.nameSpec).join(', ')}`).toBeLessThanOrEqual(2)
    }
  })

  it('мусор отвергается', () => {
    expect(parsePoe2Gems({ v: 1, gems: { 'C:/x': ['a', '', 's'] } })).toBeNull()
    expect(parsePoe2Gems({ v: 1, gems: { 'Metadata/Items/Gems/X': ['a', '', 'z'] } })).toBeNull()
  })
})

describe('генератор', () => {
  it('уровни актов по областям: конец акта — самая высокая область, интерлюдии — P*', async () => {
    const { actLevels } = await load('tree.mjs')
    const areas = [
      { id: 'G1_1', area_level: 1 },
      { id: 'G1_15', area_level: 15 },
      { id: 'G1_town', area_level: 15, is_town: true },
      { id: 'G2_1', area_level: 16 },
      { id: 'G2_9', area_level: 31 },
      { id: 'G4_ship', area_level: 1 },
      { id: 'G4_1', area_level: 46 },
      { id: 'G4_9', area_level: 53 },
      { id: 'P1_1', area_level: 54 },
      { id: 'P2_6', area_level: 56 },
      { id: 'MapX', area_level: 65 }
    ]
    expect(actLevels(areas)).toEqual({ acts: [[1, 1, 15], [2, 16, 31], [4, 32, 53]], interlude: [54, 56] })
  })

  it('«Allocates #» EE2: hash → имя без глагола', async () => {
    const { allocatesNames } = await load('instill.mjs')
    const stats = [{ ref: 'Allocates #', id: 'mod_granted_passive_hash', matchers: [{ string: 'Активирует Быстродействующие токсины', value: 55 }, { string: 'x' }] }]
    expect([...allocatesNames(stats)]).toEqual([[55, 'Быстродействующие токсины']])
  })
})
