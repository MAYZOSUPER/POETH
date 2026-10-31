import { describe, expect, it } from 'vitest'
import type { Pob2Build } from '@shared/pob/poe2'
import { resolveStages2, stageFrom2 } from '@shared/poe2/build/stages'
import { pob2, tree } from './helpers'

// Этапы PoE 2 по уровням (S66): названия читает guessStage (S35), уровни актов — из данных игры (tree.json).

const t = { acts: tree.acts, interlude: tree.interlude, maps: tree.maps }

/** Билд-заготовка с названиями наборов по трём осям. */
function fake(specs: string[], skills: string[] = [], items: string[] = []): Pob2Build {
  const spec = (title: string) => ({
    title,
    treeVersion: '0_5',
    classId: 8,
    ascendClassId: 1,
    ascendancy: 'Huntress1',
    nodes: [],
    weaponSets: [[], []] as [number[], number[]],
    attributes: { str: [], dex: [], int: [] },
    sockets: []
  })
  return {
    game: 'poe2',
    targetVersion: '0_1',
    level: 90,
    className: 'Huntress',
    ascendClassName: 'Amazon',
    mainSocketGroup: null,
    specs: specs.map(spec),
    activeSpec: specs.length - 1,
    skillSets: skills.map((title, i) => ({ id: i + 1, title, groups: [] })),
    activeSkillSet: Math.max(0, skills.length - 1),
    items: [],
    itemSets: items.map((title, i) => ({ id: i + 1, title, useSecondWeaponSet: false, slots: {}, otherSlots: [] })),
    activeItemSet: Math.max(0, items.length - 1),
    notes: '',
    warnings: []
  }
}

describe('уровень этапа по названию (PoE 2)', () => {
  it.each([
    ['Act 1', 'act', 1],
    ['Act 2', 'act', 16],
    ['Акт 3', 'act', 32],
    ['A4', 'act', 46],
    ['Interlude', 'interlude', 54],
    ['Интерлюдии', 'interlude', 54],
    ['Level 1-12', 'level', 1],
    ['Lvl 28', 'level', 28],
    ['Act 2 - Level 22', 'act', 16],
    ['Early Maps', 'maps', 65],
    ['Endgame', 'endgame', 65]
  ])('%s', (title, kind, from) => {
    expect(stageFrom2(title, t)).toEqual({ kind, from })
  })

  it('акт новее данных (акты 5–6 в 1.0) — после последнего известного, до карт', () => {
    expect(stageFrom2('Act 5', t)).toEqual({ kind: 'act', from: 54 })
  })

  it('не узнано и «на всю кампанию» — null', () => {
    expect(stageFrom2('Crit', t)).toBeNull()
    expect(stageFrom2('Leveling', t)).toBeNull()
    expect(stageFrom2('', t)).toBeNull()
  })
})

describe('план этапов', () => {
  it('настоящий билд без этапов — один этап 1–100 на активные наборы', () => {
    const plan = resolveStages2(pob2('amazon'), t)
    expect(plan).toEqual({ primary: 'none', stages: [{ title: '', kind: 'all', from: 1, to: 100, spec: 0, skills: 0, items: 0 }] })
  })

  it('фикстура прокачки: акты по дереву, камни и предметы — набор, действующий на начало этапа', () => {
    const plan = resolveStages2(pob2('leveling-amazon'), t)
    expect(plan.primary).toBe('spec')
    expect(plan.stages.map((s) => [s.title, s.from, s.to, s.spec, s.skills, s.items])).toEqual([
      ['Act 1', 1, 31, 0, 0, 0],
      ['Act 3', 32, 64, 1, 0, 0],
      ['Endgame', 65, 100, 2, 1, 1]
    ])
    // акты — для подписи на языке интерфейса («Акт 1»), у эндгейма их нет
    expect(plan.stages.map((s) => s.act ?? null)).toEqual([[1, 1], [3, 3], null])
    expect(resolveStages2(fake(['Acts 1-2', 'Interlude', 'Maps']), t).stages.map((s) => [s.kind, s.act ?? null])).toEqual([
      ['act', [1, 2]],
      ['interlude', null],
      ['maps', null]
    ])
  })

  it('основная ось — где больше узнанных названий; «Swap» того же уровня — не отдельный этап', () => {
    const plan = resolveStages2(fake(['Main'], ['Act 1', 'Act 2', 'Act 2 Swap', 'Maps', 'Endgame'], ['Act 1']), t)
    expect(plan.primary).toBe('skills')
    expect(plan.stages.map((s) => [s.title, s.from, s.to, s.skills, s.spec, s.items])).toEqual([
      ['Act 1', 1, 15, 0, 0, 0],
      ['Act 2', 16, 64, 1, 0, 0],
      ['Maps', 65, 79, 3, 0, 0],
      ['Endgame', 80, 100, 4, 0, 0]
    ])
  })

  it('то же название на другой оси берётся точно', () => {
    const plan = resolveStages2(fake(['Act 1', 'Act 3', 'Endgame'], ['Endgame', 'Act 1']), t)
    expect(plan.stages.map((s) => s.skills)).toEqual([1, 1, 0])
  })
})
