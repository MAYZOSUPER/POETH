import { resolve } from 'path'
import { pathToFileURL } from 'url'
import { describe, expect, it } from 'vitest'
import { parseGemsData, parseTreeData } from '@shared/build/data'

// Генераторы tools/build-data (S36) на маленьких источниках того же вида, что настоящие: детерминизм,
// виды нод, RU-текст статов по stat id, эффекты мастерств, рёбра, «Grants N Passive Skill Point», камни.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any
const load = (file: string): Promise<Any> => import(pathToFileURL(resolve(__dirname, '../../tools/build-data', file)).href)

const tr = (ids: string[], en: string, ru: string, format = ['#']) => ({
  ids,
  English: [{ condition: ids.map(() => ({ min: null, max: null, negated: null })), format, index_handlers: ids.map(() => []), string: en }],
  Russian: [{ condition: ids.map(() => ({ min: null, max: null, negated: null })), format, index_handlers: ids.map(() => []), string: ru }]
})

function treeSources(): Any {
  const exp = {
    tree: 'Default',
    classes: [
      { name: 'Scion', base_str: 20, base_dex: 20, base_int: 20, ascendancies: [{ id: 'Ascendant', name: 'Ascendant' }] },
      { name: 'Marauder', base_str: 32, base_dex: 14, base_int: 14, ascendancies: [{ id: 'Juggernaut', name: 'Juggernaut' }] }
    ],
    alternate_ascendancies: [{ id: 'Aul', name: 'Aul' }],
    groups: { '1': { x: 100.4, y: -50.6 }, '2': { x: 0, y: 0 }, '3': { x: 999, y: 999 } },
    constants: { orbitRadii: [0, 82, 162], skillsPerOrbit: [1, 6, 16] },
    nodes: {
      root: { group: 0, orbit: 0, orbitIndex: 0, out: ['10'], in: [] },
      '10': { skill: 10, name: 'SEVEN', stats: [], classStartIndex: 0, group: 2, orbit: 0, orbitIndex: 0, out: ['20', '500'], in: [] },
      '20': { skill: 20, name: 'Life', stats: ['5% increased maximum Life'], group: 1, orbit: 2, orbitIndex: 2, out: ['30'], in: ['10'] },
      '30': {
        skill: 30,
        name: 'Iron Grip',
        isNotable: true,
        stats: ['[Strength|Strength] grants Armour', '+12% to Fire Resistance'],
        group: 1,
        orbit: 2,
        orbitIndex: 0,
        out: ['40'],
        in: ['20']
      },
      '40': { skill: 40, name: 'Life Mastery', isMastery: true, masteryEffects: [{ effect: 7, stats: ['+50 to maximum Life'] }], stats: [], group: 1, orbit: 0, orbitIndex: 0, out: [], in: ['30'] },
      '50': { skill: 50, name: 'Iron Will', isKeystone: true, stats: ['Strength bonus applies to Spell Damage'], group: 1, orbit: 1, orbitIndex: 3, out: [], in: ['30'] },
      '60': { skill: 60, name: 'Basic Jewel Socket', isJewelSocket: true, stats: [], group: 1, orbit: 1, orbitIndex: 1, out: [], in: ['20'] },
      '500': { skill: 500, name: 'Ascendant', ascendancyName: 'Ascendant', isAscendancyStart: true, stats: [], group: 2, orbit: 1, orbitIndex: 0, out: ['510'], in: ['10'] },
      '510': { skill: 510, name: 'Passive Point', ascendancyName: 'Ascendant', stats: ['Grants 1 Passive Skill Point'], group: 2, orbit: 1, orbitIndex: 1, out: [], in: ['500'] },
      '900': { skill: 900, name: 'Timeless Keystone', isKeystone: true, stats: ['Not on the tree'] }
    }
  }
  const passive = (id: string, name: string, stats: Record<string, number> = {}, extra = {}) => ({ id, name, stats, skill_points: 0, ...extra })
  const repoeEn = {
    passives: {
      '10': passive('seven1', 'SEVEN'),
      '20': passive('life1', 'Life', { 'maximum_life_+%': 5 }),
      '30': passive('iron_grip2', 'Iron Grip', { strength_applies_to_armour: 1, 'base_fire_damage_resistance_%': 12 }),
      '40': passive('mastery_life3', 'Life Mastery'),
      '50': passive('iron_will4', 'Iron Will', { keystone_iron_will: 1 }),
      '60': passive('jewel_slot5', 'Basic Jewel Socket'),
      '500': passive('AscendancyAscendantStart', 'Ascendant'),
      '510': passive('AscendancyAscendant6', 'Passive Point', {}, { skill_points: 1 })
    }
  }
  const ruNames: Record<string, string> = {
    '10': 'СЕМЬ',
    '20': 'Здоровье',
    '30': 'Железная хватка',
    '40': 'Мастерство здоровья',
    '50': 'Железная воля',
    '60': 'Обычное гнездо для самоцвета',
    '500': 'Восходящая',
    '510': 'Очко пассивных умений'
  }
  const repoeRu = { passives: Object.fromEntries(Object.entries(repoeEn.passives).map(([h, p]) => [h, { ...p, name: ruNames[h] }])) }
  const st = [
    tr(['maximum_life_+%'], '{0}% increased maximum Life', '{0}% увеличение максимума здоровья'),
    tr(['strength_applies_to_armour'], '[Strength|Strength] grants Armour', 'Сила даёт броню', ['ignore']),
    tr(['base_fire_damage_resistance_%'], '{0}% to Fire Resistance', '{0}% к сопротивлению огню', ['+#']),
    tr(['keystone_iron_will'], 'Strength bonus applies to Spell Damage', 'Бонус силы влияет на урон от чар', ['ignore']),
    tr(['base_maximum_life'], '{0} to maximum Life', '{0} к максимуму здоровья', ['+#'])
  ]
  const toEn = st.map(({ ids, English }) => ({ ids, English, Russian: null }))
  const toRu = st.map(({ ids, Russian }) => ({ ids, English: null, Russian }))
  return {
    exp,
    repoeEn,
    repoeRu,
    trEn: [[], toEn],
    trRu: [[], toRu],
    masteryRows: [{ HASH16: '7', Stats: '[1]', Stat1Value: '50', Stat2Value: '0', Stat3Value: '0' }],
    statRows: [
      { rownum: '0', Id: 'maximum_life_+%' },
      { rownum: '1', Id: 'base_maximum_life' }
    ],
    ascRows: [
      { Id: 'Ascendant', 'Name (Russian)': 'Вознесшаяся' },
      { Id: 'Juggernaut', 'Name (Russian)': 'Покоритель' }
    ],
    charRows: [
      { Name: 'Scion', 'Name (Russian)': 'Дворянка' },
      { Name: 'Marauder', 'Name (Russian)': 'Дикарь' }
    ],
    clientStrings: [
      { Id: 'PassiveNodeGrantsPassivePoint', Text: 'Grants {0} Passive Skill Point', 'Text (Russian)': 'Дарует {0} очко пассивных умений' },
      { Id: 'PassiveNodeGrantsPassivePoints', Text: 'Grants {0} Passive Skill Points', 'Text (Russian)': 'Дарует {0} очка(-ов) пассивных умений' }
    ],
    meta: { tree: 'test', sources: ['test'] }
  }
}

/** Тот же объект с обратным порядком ключей (проверка, что вывод не зависит от порядка источника). */
function reversedKeys<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(Object.entries(o).reverse()) as T
}

describe('tools/build-data/tree.mjs', () => {
  it('детерминирован: два прогона и обратный порядок нод в источниках дают тот же файл', async () => {
    const { buildTree } = await load('tree.mjs')
    const a = JSON.stringify(buildTree(treeSources()).data)
    const b = JSON.stringify(buildTree(treeSources()).data)
    const src = treeSources()
    src.exp.nodes = reversedKeys(src.exp.nodes)
    src.repoeEn.passives = reversedKeys(src.repoeEn.passives)
    src.repoeRu.passives = reversedKeys(src.repoeRu.passives)
    src.exp.groups = reversedKeys(src.exp.groups)
    const c = JSON.stringify(buildTree(src).data)
    expect(b).toBe(a)
    expect(c).toBe(a)
  })

  it('ноды: вид, имена EN/RU, текст статов EN/RU по stat id, разметка снята, ноды не на дереве отброшены', async () => {
    const { buildTree } = await load('tree.mjs')
    const { data, report } = buildTree(treeSources())
    const tree = parseTreeData(JSON.parse(JSON.stringify(data)))!
    expect(tree.nodes.size).toBe(8)
    expect(tree.nodes.has(900)).toBe(false)
    expect(tree.nodes.get(10)!.kind).toBe('classStart')
    expect(tree.nodes.get(20)!.kind).toBe('normal')
    expect(tree.nodes.get(30)!.kind).toBe('notable')
    expect(tree.nodes.get(40)!.kind).toBe('mastery')
    expect(tree.nodes.get(50)!.kind).toBe('keystone')
    expect(tree.nodes.get(60)!.kind).toBe('jewel')
    expect(tree.nodes.get(500)!.kind).toBe('ascStart')
    const grip = tree.byId.get('iron_grip2')!
    expect(grip.ru).toBe('Железная хватка')
    expect(grip.stats).toEqual([
      { en: 'Strength grants Armour', ru: 'Сила даёт броню' },
      { en: '+12% to Fire Resistance', ru: '+12% к сопротивлению огню' }
    ])
    // для расчёта — только статы защит и атрибутов (keystone_iron_will — нет)
    expect(grip.calc).toEqual({ 'base_fire_damage_resistance_%': 12, strength_applies_to_armour: 1 })
    expect(tree.nodes.get(50)!.calc).toEqual({})
    expect(tree.nodes.get(20)!.stats).toEqual([{ en: '5% increased maximum Life', ru: '5% увеличение максимума здоровья' }])
    expect(report.enMismatch).toEqual([])
    expect(report.ruMissing).toBe(0)
  })

  it('эффект мастерства, очко пассивок, рёбра без переходов дерево ↔ восхождение, классы', async () => {
    const { buildTree } = await load('tree.mjs')
    const tree = parseTreeData(JSON.parse(JSON.stringify(buildTree(treeSources()).data)))!
    expect(tree.nodes.get(40)!.masteryEffects).toEqual([7])
    expect(tree.masteries.get(7)).toEqual({ effect: 7, stats: [{ en: '+50 to maximum Life', ru: '+50 к максимуму здоровья' }], calc: { base_maximum_life: 50 } })
    const point = tree.nodes.get(510)!
    expect(point.points).toBe(1)
    expect(point.asc).toBe('Ascendant')
    expect(point.stats).toEqual([{ en: 'Grants 1 Passive Skill Point', ru: 'Дарует 1 очко пассивных умений' }])
    expect(tree.nodes.get(10)!.links).toEqual([20]) // 10 → 500 (старт восхождения) не связываем
    expect(tree.nodes.get(30)!.links).toEqual([20, 40, 50])
    expect(tree.nodes.get(500)!.links).toEqual([510])
    expect(tree.classes[0]).toMatchObject({ id: 0, en: 'Scion', ru: 'Дворянка', start: 10, asc: [{ id: 'Ascendant', ru: 'Вознесшаяся', start: 500 }] })
    expect(tree.classes[1].start).toBeNull()
    expect(tree.groups.get(1)).toEqual({ x: 100, y: -51 })
    expect(tree.groups.has(3)).toBe(false)
  })
})

describe('tools/build-data/gems.mjs', () => {
  const gemsSources = (): Any => {
    const lvl = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i + 1), { required_level: i * 3 + 1 }]))
    const gem = (id: string, name: string, color: string, extra = {}) => ({
      display_name: name,
      color,
      is_support: false,
      tags: [],
      base_item: { id, max_level: 3, release_state: 'released' },
      per_level: lvl(4),
      ...extra
    })
    return {
      gemsEn: {
        Fireball: gem('Metadata/Items/Gems/SkillGemFireball', 'Fireball', 'b'),
        FireballAltX: gem('Metadata/Items/Gems/SkillGemFireball', 'Fireball of Testing', 'b', { discriminator: 'alt_x' }),
        BladeFlurry: gem('Metadata/Items/Gems/SkillGemChargedAttack', 'Blade Flurry', 'g'),
        SupportX: gem('Metadata/Items/Gems/SupportGemX', 'X Support', 'r', { is_support: true }),
        Hidden: gem('Metadata/Items/Gems/SkillGemHidden', 'Hidden', 'w', { base_item: { id: 'Metadata/Items/Gems/SkillGemHidden', max_level: 1, release_state: 'unreleased' } }),
        RoyaleFireball: gem('Metadata/Items/Gems/SkillGemFireballRoyale', 'Fireball', 'b')
      },
      gemsMinEn: [
        { display_name: 'Fireball', base_item: { id: 'Metadata/Items/Gems/SkillGemFireball' } },
        { display_name: 'Fireball of Testing', base_item: { id: 'Metadata/Items/Gems/SkillGemFireball' } },
        { display_name: 'Blade Flurry', base_item: { id: 'Metadata/Items/Gems/SkillGemChargedAttack' } },
        { display_name: 'X Support', base_item: { id: 'Metadata/Items/Gems/SupportGemX' } }
      ],
      gemsMinRu: [
        { display_name: 'Огненный шар', base_item: { id: 'Metadata/Items/Gems/SkillGemFireball' } },
        { display_name: 'Огненный шар проверки', base_item: { id: 'Metadata/Items/Gems/SkillGemFireball' } },
        { display_name: 'Порыв клинков', base_item: { id: 'Metadata/Items/Gems/SkillGemChargedAttack' } },
        { display_name: 'Поддержка: Икс', base_item: { id: 'Metadata/Items/Gems/SupportGemX' } }
      ],
      grantedEffects: [
        { rownum: '0', Id: 'Fireball' },
        { rownum: '1', Id: 'FireballAltX' },
        { rownum: '2', Id: 'BladeFlurry' },
        { rownum: '3', Id: 'SupportX' }
      ],
      gemEffects: [
        { Id: 'Fireball', GrantedEffect: '0' },
        { Id: 'FireballAltX', GrantedEffect: '1' },
        { Id: 'BladeFlurry', GrantedEffect: '2' },
        { Id: 'SupportXVariant', GrantedEffect: '3' }
      ],
      lv: {
        names: { Nessa: 'Несса', Tarkleigh: 'Таркли' },
        areas: { town: { act: 1, level: 1, town: true }, a: { act: 1, level: 3 }, b: { act: 1, level: 9 } },
        sections: [
          {
            act: 1,
            steps: [
              { id: 's1', parts: [{ k: 'enter', a: 'a' }] },
              { id: 's2', parts: [{ k: 'quest', q: 'q1' }] },
              { id: 's3', parts: [{ k: 'enter', a: 'b' }, { k: 'enter', a: 'town' }] },
              { id: 's4', parts: [{ k: 'quest', q: 'q2' }] }
            ]
          }
        ],
        gems: {},
        quests: {
          q2: {
            act: 1,
            en: 'Second',
            ru: 'Второй',
            rewards: { q2: { npc: 'Nessa', quest: [], vendor: [{ gem: 'Metadata/Items/Gems/SkillGemFireball', classes: [], npc: 'Nessa' }] } }
          },
          q1: {
            act: 1,
            en: 'First',
            ru: 'Первый',
            rewards: {
              q1: {
                npc: 'Tarkleigh',
                quest: [
                  { gem: 'Metadata/Items/Gems/SkillGemFireball', classes: ['Witch'] },
                  { gem: 'Metadata/Items/Flasks/FlaskLife1', classes: [] }
                ],
                vendor: [{ gem: 'Metadata/Items/Gems/SkillGemChargedAttack', classes: ['Duelist', 'Shadow'], npc: 'Nessa' }]
              }
            }
          }
        }
      },
      meta: { sources: ['test'] }
    }
  }

  it('ключ PoB по variantId, gameId и skillId, трансфигурированные, без невыпущенных и Royale; детерминизм', async () => {
    const { buildGems } = await load('gems.mjs')
    const { data, report } = buildGems(gemsSources())
    expect(JSON.stringify(buildGems(gemsSources()).data)).toBe(JSON.stringify(data))
    expect(Object.keys(data.gems)).toEqual([
      'Metadata/Items/Gems/SkillGemBladeFlurry',
      'Metadata/Items/Gems/SkillGemFireball',
      'Metadata/Items/Gems/SkillGemFireballAltX',
      'Metadata/Items/Gems/SkillGemSupportXVariant'
    ])
    const gems = parseGemsData(JSON.parse(JSON.stringify(data)))!
    const bf = gems.gems.get('Metadata/Items/Gems/SkillGemBladeFlurry')!
    expect(bf).toMatchObject({ gameId: 'Metadata/Items/Gems/SkillGemChargedAttack', skillId: 'BladeFlurry', variantId: 'BladeFlurry', ru: 'Порыв клинков', color: 'g' })
    expect(gems.gems.get('Metadata/Items/Gems/SkillGemSupportXVariant')).toMatchObject({ skillId: 'SupportX', support: true, ru: 'Поддержка: Икс' })
    const alt = gems.gems.get('Metadata/Items/Gems/SkillGemFireballAltX')!
    expect(alt).toMatchObject({ transfigured: true, gameId: 'Metadata/Items/Gems/SkillGemFireball', ru: 'Огненный шар проверки', sources: [] })
    expect(gems.gems.get('Metadata/Items/Gems/SkillGemFireball')!.req).toEqual([1, 4, 7, 10])
    expect(report.notInRepoe).toEqual([])
  })

  it('источники: квесты по ходу маршрута (уровень — по зонам до квеста), классы маской, NPC по-русски', async () => {
    const { buildGems } = await load('gems.mjs')
    const { data } = buildGems(gemsSources())
    expect(data.quests).toEqual({ q1: { act: 1, lvl: 3, en: 'First', ru: 'Первый' }, q2: { act: 1, lvl: 9, en: 'Second', ru: 'Второй' } })
    expect(data.npcs).toEqual({ Nessa: 'Несса', Tarkleigh: 'Таркли' })
    const gems = parseGemsData(data)!
    expect(gems.gems.get('Metadata/Items/Gems/SkillGemFireball')!.sources).toEqual([
      { kind: 'quest', questId: 'q1', act: 1, level: 3, questEn: 'First', questRu: 'Первый', npcEn: 'Tarkleigh', npcRu: 'Таркли', classes: ['Witch'] },
      { kind: 'vendor', questId: 'q2', act: 1, level: 9, questEn: 'Second', questRu: 'Второй', npcEn: 'Nessa', npcRu: 'Несса', classes: [] }
    ])
    expect(gems.gems.get('Metadata/Items/Gems/SkillGemBladeFlurry')!.sources[0].classes).toEqual(['Duelist', 'Shadow'])
  })
})
