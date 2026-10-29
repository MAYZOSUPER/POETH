import { describe, expect, it } from 'vitest'
import { parsePobXml, type PobBuild } from '@shared/pob/model'
import {
  actStartLevel,
  currentStage,
  guessStage,
  isLevelingGuess,
  resolveStages,
  skillSections,
  stageFrom,
  type PobStagePlan
} from '@shared/pob/stages'
import { POE1_FIXTURES, fixtureXml } from './fixtures'

function build(name: string): PobBuild {
  const res = parsePobXml(fixtureXml(name))
  if (!res.ok) throw new Error(name)
  return res.build
}

/** Снимок плана: этап → дерево / камни / предметы. */
function planView(b: PobBuild, plan: PobStagePlan): unknown {
  const skillsTitle = (s: { set: number; section: number | null } | null): string => {
    if (!s) return '-'
    const set = b.skillSets[s.set]
    if (s.section === null) return set.title || '(default)'
    return `${set.title || '(default)'} § ${skillSections(set)[s.section].label || '(начало)'}`
  }
  return {
    primary: plan.primary,
    stages: plan.stages.map(
      (s) =>
        `${s.leveling ? 'L' : 'E'} ${String(s.from ?? '-').padStart(3)} ${s.title || '(default)'} → ` +
        `tree: ${s.spec === null ? '-' : b.specs[s.spec].title || '(default)'}; ` +
        `gems: ${skillsTitle(s.skills)}; items: ${s.items === null ? '-' : b.itemSets[s.items].title || '(default)'}`
    )
  }
}

describe('guessStage: названия этапов', () => {
  it.each([
    ['Act 3', { kind: 'act', actFrom: 3 }],
    ['^5^1^2Act 1', { kind: 'act', actFrom: 1 }],
    ['Акт 5', { kind: 'act', actFrom: 5 }],
    ['Акты 1-2', { kind: 'act', actFrom: 1, actTo: 2 }],
    ['^xFF6600Acts 1-2      ', { kind: 'act', actFrom: 1, actTo: 2 }],
    ['Acts 7- Early Maps', { kind: 'act', actFrom: 7 }],
    ['Act 1 Lv 1-13', { kind: 'act', actFrom: 1, levelFrom: 1, levelTo: 13 }],
    ['Act 10 65+ My Thoughts', { kind: 'act', actFrom: 10, levelFrom: 65 }],
    // один уровень рядом с актом — уровень к концу акта
    ['Act 1 - Level 12 (14 Points with Quests)', { kind: 'act', actFrom: 1, levelTo: 12 }],
    ['Lvl 13 (Act 1 before Merveil)', { kind: 'act', actFrom: 1, levelTo: 13 }],
    ['Acts 1&2 (Fire spells)', { kind: 'act', actFrom: 1, actTo: 2 }],
    ['Акты 3 и 4', { kind: 'act', actFrom: 3, actTo: 4 }],
    ['A3', { kind: 'act', actFrom: 3 }],
    ['A1-A2', { kind: 'act', actFrom: 1, actTo: 2 }],
    ['A3ArmBrandSwap', { kind: 'unknown' }],
    ['End Act 1 Set', { kind: 'act', actFrom: 1 }],
    ['-------------------- ACT 2--------------------', { kind: 'act', actFrom: 2 }],
    ['----- Act 1 Leveling Gems -----', { kind: 'act', actFrom: 1 }],
    ['Leveling (1-13) {1}', { kind: 'level', levelFrom: 1, levelTo: 13 }],
    ['Leveling (67+, Mapping): Uber Lab + Max Resists', { kind: 'level', levelFrom: 67 }],
    ['Leveling {1,2,3,4,5}', { kind: 'act', actFrom: 1, actTo: 10, campaign: true }],
    ['leveling', { kind: 'act', actFrom: 1, actTo: 10, campaign: true }],
    ['Прокачка', { kind: 'act', actFrom: 1, actTo: 10, campaign: true }],
    ['Lvling Gems in Notes Tab', { kind: 'act', actFrom: 1, actTo: 10, campaign: true }],
    ['level', { kind: 'unknown' }],
    ['Level 12-22', { kind: 'level', levelFrom: 12, levelTo: 22 }],
    ['Leveling 1 - 12', { kind: 'level', levelFrom: 1, levelTo: 12 }],
    ['Levelling 13-25', { kind: 'level', levelFrom: 13, levelTo: 25 }],
    ['Lvl 44', { kind: 'level', levelFrom: 44 }],
    ['Уровень 10-20', { kind: 'level', levelFrom: 10, levelTo: 20 }],
    ['ур. 30', { kind: 'level', levelFrom: 30 }],
    ['12-22', { kind: 'level', levelFrom: 12, levelTo: 22 }],
    ['38 - Untill Cruel Lab - Only SRS links change', { kind: 'level', levelFrom: 38 }],
    ['LV 77+ Follow AllStars CI Tree', { kind: 'level', levelFrom: 77 }],
    ['Leveling 38 - Budget Endgame', { kind: 'level', levelFrom: 38 }],
    ['Early Maps', { kind: 'maps', early: true }],
    ['Ранние карты', { kind: 'maps', early: true }],
    ['Maps - Lvling gems in Notes', { kind: 'maps', early: false }],
    ['Pre-Maps - Needed to swap', { kind: 'act', actFrom: 1, actTo: 10, campaign: true, swap: true }],
    ['End Game Gear', { kind: 'endgame' }],
    ['Endgame', { kind: 'endgame' }],
    ['Эндгейм', { kind: 'endgame' }],
    ['Min Max Gear', { kind: 'endgame' }],
    ['$$$ - Endgame Setup', { kind: 'endgame' }],
    ['Final Tree', { kind: 'endgame' }],
    ['Holy Relic Swap (minimum)', { kind: 'unknown', swap: true }],
    ['i83 sanctum +1totem 30% reserve shield', { kind: 'unknown' }],
    ['6-link setup', { kind: 'unknown' }],
    ['3.28 Crit', { kind: 'unknown' }],
    ['AG/zealotry', { kind: 'unknown' }],
    ['Default', { kind: 'unknown' }],
    ['', { kind: 'unknown' }],
    ['Act 11', { kind: 'unknown' }],
    ['Level 150', { kind: 'unknown' }]
  ])('%s', (title, want) => {
    expect(guessStage(title)).toEqual({ swap: false, ...want })
  })

  it('уровень начала и «прокачка ли это»', () => {
    expect(actStartLevel(1)).toBe(1)
    expect(actStartLevel(2)).toBe(14)
    expect(actStartLevel(10)).toBe(65)
    expect(stageFrom(guessStage('Act 3'))).toBe(24)
    expect(stageFrom(guessStage('Act 1 Lv 1-13'))).toBe(1)
    expect(stageFrom(guessStage('Act 2 - Level 22 (27 Points with Quests)'))).toBe(14)
    expect(stageFrom(guessStage('Early Maps'))).toBe(70)
    expect(stageFrom(guessStage('Crit'))).toBeNull()
    expect(isLevelingGuess(guessStage('Act 10'))).toBe(true)
    expect(isLevelingGuess(guessStage('Early Maps'))).toBe(true)
    expect(isLevelingGuess(guessStage('Leveling 65 - 77'))).toBe(true)
    expect(isLevelingGuess(guessStage('Leveling 78 - 90'))).toBe(false)
    expect(isLevelingGuess(guessStage('Maps'))).toBe(false)
    expect(isLevelingGuess(guessStage('Endgame'))).toBe(false)
    expect(isLevelingGuess(guessStage('Crit'))).toBe(false)
  })
})

describe('этапы на настоящих кодах', () => {
  it.each(POE1_FIXTURES)('%s', (name) => {
    const b = build(name)
    expect(planView(b, resolveStages(b))).toMatchSnapshot()
  })

  it('10 актов, камни — разделы одного набора («----- Act N Leveling Gems -----»)', () => {
    const b = build('pobbin-acts-level-gems')
    const plan = resolveStages(b)
    expect(plan.primary).toBe('spec')
    expect(plan.stages.map((s) => s.title.replace(/ - Level.*/, ''))).toEqual(
      Array.from({ length: 10 }, (_, i) => `Act ${i + 1}`)
    )
    expect(plan.stages.every((s) => s.leveling)).toBe(true)
    // «Act 2 - Level 22»: 22 — уровень к концу акта, этап начинается с начала акта
    expect(plan.stages.map((s) => s.from)).toEqual([1, 14, 24, 34, 41, 46, 51, 55, 61, 65])
    expect(skillSections(b.skillSets[0]).map((s) => s.label)).toEqual([
      '----- Act 1 Leveling Gems -----',
      '----- Act 2 Leveling Gems -----',
      '----- Act 3 Leveling Gems -----',
      '----- Act 4 Leveling Gems -----',
      '----- Act 9 Leveling Gems -----'
    ])
    // акт к разделу; для 5–8 актов новых камней нет — остаётся раздел 4 акта
    expect(plan.stages.map((s) => s.skills?.section)).toEqual([0, 1, 2, 3, 3, 3, 3, 3, 4, 4])
  })

  it('акты во всех трёх осях: дерево, камни и предметы одного акта', () => {
    const b = build('pobbin-acts-all-axes')
    const plan = resolveStages(b)
    for (const s of plan.stages) {
      expect(b.skillSets[s.skills?.set ?? -1].title, s.title).toBe(s.title)
      expect(b.itemSets[s.items ?? -1].title, s.title).toBe(s.title)
    }
  })

  it('прокачка + варианты эндгейма: набор «Leveling» без чисел — на все этапы прокачки, эндгейм — набор автора', () => {
    const b = build('pobbin-leveling-endgame-variants')
    const plan = resolveStages(b)
    const leveling = plan.stages.filter((s) => s.leveling)
    expect(leveling.map((s) => s.from)).toEqual([1, 13, 22, 38, 54, 67])
    expect(leveling.every((s) => b.itemSets[s.items ?? -1].title === 'Leveling {1,2,3,4,5}')).toBe(true)
    expect(leveling.map((s) => b.skillSets[s.skills?.set ?? -1].title)).toEqual(leveling.map((s) => s.title.replace(' } ', ' ')))
    const mace = plan.stages.find((s) => s.title.startsWith('Mace Endgame'))
    expect(mace?.leveling).toBe(false)
    // для эндгейма — активные наборы автора, а не последний набор прокачки
    expect(mace && b.skillSets[mace.skills?.set ?? -1].title).toBe('Cluster Jewel Setup (96) {7,8}')
    expect(mace && b.itemSets[mace.items ?? -1].title).toBe('Mace Switch {7,8}')
  })

  it('короткая запись A1…A10; «Leveling Tree» без чисел этапом не выбирается', () => {
    const b = build('pobbin-short-acts')
    const plan = resolveStages(b)
    expect(plan.stages.filter((s) => s.guess.kind === 'act' && !s.guess.campaign).map((s) => s.title)).toEqual(
      Array.from({ length: 10 }, (_, i) => `A${i + 1}`)
    )
    const t = (i: number | null): string | null => (i === null ? null : plan.stages[i].title)
    expect(t(currentStage(plan, { level: 5 }).index)).toBe('A1')
    expect(t(currentStage(plan, { act: 3 }).index)).toBe('A3')
  })

  it('диапазоны уровней: набор камней — действующий на начало этапа', () => {
    const b = build('pobbin-leveling-ranges')
    const plan = resolveStages(b)
    const stage = plan.stages.find((s) => s.title === 'Leveling 26 - 38')
    expect(stage && b.skillSets[stage.skills?.set ?? -1].title).toBe('Leveling 13 - 27')
    expect(stage && b.itemSets[stage.items ?? -1].title).toBe('Leveling 1 - 27')
  })

  it('билд без этапов: один этап, не прокачка', () => {
    const b = build('pobbin-death-oath-328')
    const plan = resolveStages(b)
    expect(plan.primary).toBe('none')
    expect(plan.stages).toHaveLength(1)
    expect(plan.stages[0]).toMatchObject({ spec: 0, skills: { set: 0, section: null }, items: 0, leveling: false })
    expect(currentStage(plan, { level: 30 })).toEqual({ index: null, source: 'auto' })
  })
})

describe('текущий этап', () => {
  const b = build('pobbin-acts-level-gems')
  const plan = resolveStages(b)
  const title = (i: number | null): string | null => (i === null ? null : plan.stages[i].title.replace(/ - Level.*/, ''))

  it('по акту из Client.txt', () => {
    expect(title(currentStage(plan, { act: 1, level: 2 }).index)).toBe('Act 1')
    expect(title(currentStage(plan, { act: 3, level: 25 }).index)).toBe('Act 3')
    // акт важнее уровня: в 2 акте на 30 уровне — всё ещё этап 2 акта
    expect(title(currentStage(plan, { act: 2, level: 30 }).index)).toBe('Act 2')
    // этапа на акт нет — остаётся прошлый («Acts 3-4» в 4 акте, «Acts 7- Early Maps» в 9)
    const lb = build('pobbin-leveling-acts')
    const lp = resolveStages(lb)
    const t = (i: number | null): string | null => (i === null ? null : lp.stages[i].title)
    expect(t(currentStage(lp, { act: 4 }).index)).toBe('Acts 3-4')
    expect(t(currentStage(lp, { act: 9 }).index)).toBe('Acts 7- Early Maps')
  })

  it('по уровню, если акт неизвестен', () => {
    expect(title(currentStage(plan, { level: 1 }).index)).toBe('Act 1')
    expect(title(currentStage(plan, { level: 35 }).index)).toBe('Act 4')
    expect(title(currentStage(plan, {}).index)).toBe('Act 1')
  })

  it('эндгейм по уровню не выбирается; после кампании — ранние карты или последний этап прокачки', () => {
    expect(title(currentStage(plan, { level: 95 }).index)).toBe('Act 10')
    expect(title(currentStage(plan, { campaignDone: true }).index)).toBe('Act 10')
    const eb = build('pobbin-leveling-endgame-variants')
    const ep = resolveStages(eb)
    const t = (i: number | null): string | null => (i === null ? null : ep.stages[i].title)
    expect(t(currentStage(ep, { level: 96 }).index)).toMatch(/^Leveling \(67\+, Mapping\)/)
    expect(t(currentStage(ep, { act: 11 }).index)).toMatch(/^Leveling \(67\+, Mapping\)/)
  })

  it('по уровням (Leveling N - M)', () => {
    const lb = build('pobbin-leveling-ranges')
    const lp = resolveStages(lb)
    const t = (i: number | null): string | null => (i === null ? null : lp.stages[i].title)
    expect(t(currentStage(lp, { level: 30 }).index)).toBe('Leveling 26 - 38')
    expect(t(currentStage(lp, { level: 70 }).index)).toBe('Leveling 65 - 77')
    // после кампании без ранних карт — последний этап прокачки
    expect(t(currentStage(lp, { campaignDone: true }).index)).toBe('Leveling 65 - 77')
  })
})

describe('ручная правка этапов', () => {
  const b = build('pobbin-acts-level-gems')

  it('игрок выбирает текущий этап и набор камней; автомат помнит своё', () => {
    const auto = resolveStages(b)
    const key = auto.stages.find((s) => s.title.startsWith('Act 5 '))?.key as string
    const edits = { current: key, stages: { [key]: { skills: { set: 0, section: 4 }, leveling: true } } }
    const plan = resolveStages(b, edits)
    const act5 = plan.stages.find((s) => s.key === key)
    expect(act5?.skills).toEqual({ set: 0, section: 4 })
    expect(act5?.auto.skills).toEqual({ set: 0, section: 3 })
    expect(act5?.edited).toEqual(['skills', 'leveling'])
    expect(currentStage(plan, { level: 1 }, edits)).toEqual({ index: plan.stages.indexOf(act5 as never), source: 'manual' })
  })

  it('«это эндгейм — не показывать в прокачке» и обратно', () => {
    const auto = resolveStages(b)
    const act10 = auto.stages.find((s) => s.title.startsWith('Act 10 '))?.key as string
    const plan = resolveStages(b, { stages: { [act10]: { leveling: false } } })
    expect(plan.stages.find((s) => s.key === act10)?.leveling).toBe(false)
    expect(currentStage(plan, { level: 66 }).index).toBe(plan.stages.findIndex((s) => s.title.startsWith('Act 9 ')))

    const eb = build('pobbin-leveling-endgame-variants')
    const end = resolveStages(eb).stages.find((s) => s.title.startsWith('Mace Endgame'))?.key as string
    const ep = resolveStages(eb, { stages: { [end]: { leveling: true, from: 80 } } })
    const e = ep.stages.find((s) => s.key === end)
    expect(e).toMatchObject({ leveling: true, from: 80, auto: { leveling: false, from: 90 } })
    expect(currentStage(ep, { level: 85 }).index).toBe(ep.stages.indexOf(e as never))
  })

  it('битые правки с диска отбрасываются', () => {
    const auto = resolveStages(b)
    const key = auto.stages[0].key
    const plan = resolveStages(b, {
      current: 'spec:999',
      stages: {
        [key]: { spec: 999, items: -1, skills: { set: 0, section: 99 }, leveling: 'yes' as never, from: 1000 },
        __proto__: { leveling: true } as never
      }
    })
    expect(plan.stages[0].edited).toEqual([])
    expect(plan.stages[0].spec).toBe(auto.stages[0].spec)
    expect(currentStage(plan, { level: 1 }, { current: 'spec:999' }).source).toBe('auto')
  })
})
