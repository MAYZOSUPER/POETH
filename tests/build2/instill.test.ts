import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import {
  POE2_INSTILL_FILE,
  buildInstill,
  emotionName,
  instillByEmotions,
  instillByName,
  instillCost,
  instillCostView,
  instillEmotions,
  instillsMatching,
  notableName,
  parseInstillData,
  searchInstill,
  setInstillName,
  type InstillData
} from '@shared/poe2/build/instill'
import { resolveStages2 } from '@shared/poe2/build/stages'
import { DATA2, pob2, tree } from './helpers'

// «Вложение» PoE 2 (S66): instill.json (рецепты — выгрузка дерева GGG 0.5.5, имена — EE2). Сверка всех рецептов
// с независимым источником — данными EE2 (stats.ndjson: «Allocates #» с hash ноты и полем `oils` — индексы эмоций
// в том же порядке), RU = EN по поиску, порядок эмоций значим, вложение амулета из настоящих кодов PoB2.

const data = parseInstillData(JSON.parse(readFileSync(join(DATA2, POE2_INSTILL_FILE), 'utf8'))) as InstillData

interface Ee2Stat {
  ref: string
  id?: string
  matchers: { string: string; value?: number; oils?: string }[]
}

function ee2Allocates(lang: 'en' | 'ru'): Map<number, { name: string; oils: number[] }> {
  const out = new Map<number, { name: string; oils: number[] }>()
  for (const line of readFileSync(join(DATA2, lang, 'stats.ndjson'), 'utf8').split('\n')) {
    if (!line.includes('"mod_granted_passive_hash"')) continue
    const s = JSON.parse(line) as Ee2Stat
    if (s.ref !== 'Allocates #') continue
    for (const m of s.matchers) {
      if (m.value === undefined || !m.oils) continue
      out.set(m.value, { name: m.string.replace(/^\S+\s+/, ''), oils: m.oils.split(',').map(Number) })
    }
  }
  return out
}

const hashOf = (en: string): number => instillByName(data, en) as number

describe('instill.json', () => {
  it('13 эмоций по силе, 875 рецептов, у всех нот RU-имя', () => {
    expect(data.emotions.map((e) => e.en)).toEqual([
      'Diluted Liquid Ire',
      'Diluted Liquid Guilt',
      'Diluted Liquid Greed',
      'Liquid Paranoia',
      'Liquid Envy',
      'Liquid Disgust',
      'Liquid Despair',
      'Concentrated Liquid Fear',
      'Concentrated Liquid Suffering',
      'Concentrated Liquid Isolation',
      'Potent Liquid Melancholy',
      'Potent Liquid Ferocity',
      'Potent Liquid Contempt'
    ])
    expect(data.emotions.every((e) => e.ru && e.tag && e.baseId.startsWith('Metadata/Items/Currency/'))).toBe(true)
    expect(data.recipes.size).toBe(875)
    expect([...data.notables.values()].every((n) => n.ru && n.en)).toBe(true)
    expect(data.byEmotions.size).toBe(875)
  })

  it('все рецепты и имена совпадают с данными EE2 (независимый источник)', () => {
    const en = ee2Allocates('en')
    const ru = ee2Allocates('ru')
    expect(en.size).toBe(data.recipes.size)
    for (const [hash, recipe] of data.recipes) {
      expect(en.get(hash)?.oils, `${hash}`).toEqual([...recipe])
      expect(ru.get(hash)?.oils, `${hash}`).toEqual([...recipe])
      expect(data.notables.get(hash)?.ru).toBe(ru.get(hash)?.name)
    }
  })

  it('известный рецепт: Fast Acting Toxins = паранойя, жадность, отчуждение (порядок важен)', () => {
    const h = hashOf('Fast Acting Toxins')
    expect(h).toBe(55)
    expect(instillEmotions(data, h)?.map((e) => e.en)).toEqual(['Liquid Paranoia', 'Diluted Liquid Greed', 'Concentrated Liquid Isolation'])
    expect(instillEmotions(data, h)?.map((e) => emotionName(e, 'ru'))).toEqual(['Жидкая паранойя', 'Разбавленная жидкая жадность', 'Концентрированное жидкое отчуждение'])
    expect(instillByEmotions(data, [3, 2, 9])).toBe(55)
    expect(instillByEmotions(data, [2, 3, 9])).not.toBe(55)
    expect(notableName(data.notables.get(55)!, 'ru')).toBe('Быстродействующие токсины')
    // имя ноты на дереве совпадает с выгрузкой
    expect(tree.nodes.get(55)?.name).toBe('Fast Acting Toxins')
  })

  it('частичный выбор: ноты с той же эмоцией на выбранных местах', () => {
    const list = instillsMatching(data, [3, null, null])
    expect(list).toContain(55)
    expect(list.every((h) => data.recipes.get(h)?.[0] === 3)).toBe(true)
    expect(instillsMatching(data, [3, 2, 9])).toEqual([55])
    expect(instillsMatching(data, [null, null, null])).toEqual([])
  })

  it('поиск RU и EN: по имени и по тексту статов', () => {
    expect(searchInstill(data, 'Быстродейств', 'ru')[0]).toEqual({ hash: 55, by: 'start' })
    expect(searchInstill(data, 'fast acting', 'en')[0]).toEqual({ hash: 55, by: 'start' })
    expect(searchInstill(data, 'токсины', 'ru').map((x) => x.hash)).toContain(55)
    expect(searchInstill(data, 'ailments deal damage', 'en').map((x) => x.hash)).toContain(55)
    expect(searchInstill(data, '', 'ru')).toEqual([])
    expect(instillByName(data, 'Активирует Быстродействующие токсины')).toBe(55)
  })

  it('мусор отвергается', () => {
    expect(parseInstillData({ v: 2 })).toBeNull()
    expect(parseInstillData({ v: 1, emotions: [['x', 'a', 'b', 'c', 'd']], recipes: {}, notables: {} })).toBeNull()
  })
})

describe('вложение из билда PoB2', () => {
  // «{enchant}Allocates …» у автора есть и на других предметах — берём только амулет
  it.each([
    ['amazon', 'Grace of the Ancestors', 'Милость предков'],
    ['stormweaver', 'Dynamism', null],
    ['pathfinder', 'Vulgar Methods', null]
  ])('%s', (name, expected, ru) => {
    const b = pob2(name)
    const plan = resolveStages2(b, tree)
    expect(setInstillName(b, b.activeItemSet)).toBe(expected)
    const bi = buildInstill(b, plan, data)
    expect(bi?.name).toBe(expected)
    expect(bi?.hash).toBeGreaterThan(0)
    expect(instillEmotions(data, bi!.hash!)).toHaveLength(3)
    if (ru) expect(notableName(data.notables.get(bi!.hash!)!, 'ru')).toBe(ru)
  })

  it('прокачка: вложение с амулета эндгейма, если на этапе на экране его нет', () => {
    const b = pob2('leveling-amazon')
    const plan = resolveStages2(b, tree)
    const bi = buildInstill(b, plan, data, 0)
    expect(bi?.stage).toBe(2)
    expect(bi?.name).toBe(setInstillName(b, b.activeItemSet))
  })
})

describe('стоимость', () => {
  it('сумма в exalted; нет цены одной эмоции — без суммы', () => {
    const e = instillEmotions(data, 55)!
    const prices = new Map([
      ['Liquid Paranoia', 12],
      ['Diluted Liquid Greed', 1.5],
      ['Concentrated Liquid Isolation', 40]
    ])
    expect(instillCost(e, prices)).toEqual({ each: [12, 1.5, 40], total: 53.5 })
    expect(instillCost(e, new Map([['Liquid Paranoia', 12]]))).toEqual({ each: [12, null, null], total: null })
    expect(instillCost(e, null).total).toBeNull()
  })

  it('от 1 div — в divine по курсу', () => {
    expect(instillCostView(53.5, 564)).toEqual({ unit: 'exalted', n: 54 })
    expect(instillCostView(7.25, 564)).toEqual({ unit: 'exalted', n: 7.3 })
    expect(instillCostView(1200, 564)).toEqual({ unit: 'divine', n: 2.1 })
    expect(instillCostView(1200, null)).toEqual({ unit: 'exalted', n: 1200 })
  })
})
